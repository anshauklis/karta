# Billing

Manage your Karta subscription with Stripe integration.

## Plans

| Tier | Description |
|------|-------------|
| **Community** | Free, open-source, self-hosted |
| **Team** | Up to 5 users, priority support |
| **Enterprise** | Unlimited users, SSO, audit, RBAC, white-label, multi-tenant |

## Subscription Management

### Admin > Billing

Displays:
- Current plan tier with badge
- Subscription status (**Active**, **Trialing**, **Past Due**, **Canceled**) with color-coded badge
- Next billing date (if subscription exists)

### Actions

- **Upgrade** — shown when no active subscription. Initiates a Stripe Checkout session.
- **Manage Subscription** — shown when subscription exists. Opens the Stripe Customer Portal where you can update payment method, change plan, or cancel.

### Pricing Page

Available at `/pricing` for all users. Shows a 3-tier comparison with feature lists and upgrade buttons.

## Stripe Configuration

Required environment variables:

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Stripe API secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_PRICE_TEAM` | Stripe Price ID for Team plan |
| `STRIPE_PRICE_ENTERPRISE` | Stripe Price ID for Enterprise plan |

:::{warning}
Stripe webhook secret is critical for secure payment processing. Without it, webhook signatures cannot be verified and payment events will be rejected.
:::

## Webhook Events

Karta handles these Stripe webhook events:

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Creates subscription record |
| `customer.subscription.updated` | Updates plan and status |
| `customer.subscription.deleted` | Marks subscription as canceled |

Webhook endpoint: `POST /api/billing/webhook`

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/billing/checkout` | Admin | Create Stripe Checkout session |
| `POST` | `/api/billing/webhook` | None | Stripe webhook handler (signature verified) |
| `GET` | `/api/billing/status` | Admin | Get current subscription status |
| `POST` | `/api/billing/portal` | Admin | Create Stripe Customer Portal session |

:::{tip}
The webhook endpoint does not require JWT authentication. Instead, it verifies the request using the Stripe webhook signature to ensure the event is genuine.
:::

:::{warning}
Billing features require the `billing` feature in your license. Without it, the Admin > Billing page is not accessible.
:::
