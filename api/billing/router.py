"""Stripe billing: checkout, webhooks, subscription management."""

import os
import logging
import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text

from api.database import engine
from api.auth.dependencies import get_current_user

logger = logging.getLogger("karta.billing")
router = APIRouter(prefix="/api/billing", tags=["billing"])

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")
WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
PRICE_TEAM = os.environ.get("STRIPE_PRICE_TEAM", "")
PRICE_ENTERPRISE = os.environ.get("STRIPE_PRICE_ENTERPRISE", "")
FRONTEND_URL = os.environ.get("NEXTAUTH_URL", "http://localhost:3000")


class CheckoutRequest(BaseModel):
    tier: str  # "team" or "enterprise"


@router.post("/checkout")
async def create_checkout(body: CheckoutRequest, current_user: dict = Depends(get_current_user)):
    """Create Stripe Checkout session."""
    if not stripe.api_key:
        raise HTTPException(503, "Billing not configured")

    price_id = PRICE_TEAM if body.tier == "team" else PRICE_ENTERPRISE
    if not price_id:
        raise HTTPException(400, f"Price not configured for tier: {body.tier}")

    # Get or create Stripe customer
    tenant_id = 1  # TODO: from request state
    with engine.connect() as conn:
        row = conn.execute(text(
            "SELECT stripe_customer_id FROM subscriptions WHERE tenant_id = :tid ORDER BY id DESC LIMIT 1"
        ), {"tid": tenant_id}).fetchone()
        customer_id = row[0] if row else None

    if not customer_id:
        customer = stripe.Customer.create(
            email=current_user.get("email", ""),
            metadata={"tenant_id": str(tenant_id)},
        )
        customer_id = customer.id

    session = stripe.checkout.Session.create(
        customer=customer_id,
        payment_method_types=["card"],
        line_items=[{"price": price_id, "quantity": 1}],
        mode="subscription",
        success_url=f"{FRONTEND_URL}/admin/billing?success=true",
        cancel_url=f"{FRONTEND_URL}/admin/billing?canceled=true",
        metadata={"tenant_id": str(tenant_id)},
    )
    return {"url": session.url}


@router.post("/webhook")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events."""
    if not WEBHOOK_SECRET:
        raise HTTPException(503, "Webhook not configured")

    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")

    try:
        event = stripe.Webhook.construct_event(payload, sig, WEBHOOK_SECRET)
    except Exception as e:
        raise HTTPException(400, f"Invalid webhook: {e}")

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        tenant_id = int(session.get("metadata", {}).get("tenant_id", 1))
        _handle_checkout_completed(session, tenant_id)
    elif event["type"] in ("customer.subscription.updated", "customer.subscription.deleted"):
        sub = event["data"]["object"]
        _handle_subscription_change(sub)

    return {"received": True}


def _handle_checkout_completed(session, tenant_id):
    sub_id = session.get("subscription")
    customer_id = session.get("customer")
    with engine.connect() as conn:
        # Check if subscription exists for this tenant
        existing = conn.execute(text(
            "SELECT id FROM subscriptions WHERE tenant_id = :tid"
        ), {"tid": tenant_id}).fetchone()

        if existing:
            conn.execute(text("""
                UPDATE subscriptions
                SET stripe_customer_id = :cid,
                    stripe_subscription_id = :sid,
                    tier = 'team',
                    status = 'active'
                WHERE tenant_id = :tid
            """), {"tid": tenant_id, "cid": customer_id, "sid": sub_id})
        else:
            conn.execute(text("""
                INSERT INTO subscriptions (tenant_id, stripe_customer_id, stripe_subscription_id, tier, status)
                VALUES (:tid, :cid, :sid, 'team', 'active')
            """), {"tid": tenant_id, "cid": customer_id, "sid": sub_id})
        conn.commit()


def _handle_subscription_change(sub):
    sub_id = sub["id"]
    status = sub["status"]  # active, past_due, canceled, etc.
    period_end = sub.get("current_period_end")
    with engine.connect() as conn:
        conn.execute(text("""
            UPDATE subscriptions SET status = :status, current_period_end = to_timestamp(:period_end)
            WHERE stripe_subscription_id = :sid
        """), {"status": status, "sid": sub_id, "period_end": period_end})
        conn.commit()


@router.get("/status")
async def billing_status(current_user: dict = Depends(get_current_user)):
    """Get current subscription status."""
    tenant_id = 1
    with engine.connect() as conn:
        row = conn.execute(text("""
            SELECT tier, status, stripe_subscription_id, current_period_end
            FROM subscriptions WHERE tenant_id = :tid ORDER BY id DESC LIMIT 1
        """), {"tid": tenant_id}).fetchone()
        if not row:
            return {"tier": "community", "status": "active", "subscription_id": None, "period_end": None}
        return {
            "tier": row[0],
            "status": row[1],
            "subscription_id": row[2],
            "period_end": row[3].isoformat() if row[3] else None,
        }


@router.post("/portal")
async def billing_portal(current_user: dict = Depends(get_current_user)):
    """Create Stripe Customer Portal session."""
    if not stripe.api_key:
        raise HTTPException(503, "Billing not configured")
    tenant_id = 1
    with engine.connect() as conn:
        row = conn.execute(text(
            "SELECT stripe_customer_id FROM subscriptions WHERE tenant_id = :tid LIMIT 1"
        ), {"tid": tenant_id}).fetchone()
        if not row or not row[0]:
            raise HTTPException(404, "No subscription found")

    session = stripe.billing_portal.Session.create(
        customer=row[0],
        return_url=f"{FRONTEND_URL}/admin/billing",
    )
    return {"url": session.url}
