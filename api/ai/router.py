"""
AI Assistant API router.

Endpoints:
- Sessions: list, get, delete
- Glossary: CRUD (admin only)
- One-shot: generate-sql, fix-sql, summarize
- Chat: SSE streaming with tool-use loop
"""

import inspect
import json
import logging
import re

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import text

from api.database import engine
from api.auth.dependencies import get_current_user, require_admin
from api.models import (
    AIChatRequest,
    AIGenerateSQLRequest,
    AIFixSQLRequest,
    AISummarizeRequest,
    AITextResponse,
    AISessionResponse,
    AIMessageResponse,
    AIGlossaryCreate,
    AIGlossaryUpdate,
    AIGlossaryResponse,
    AISuggestChartConfigRequest,
    AISuggestChartConfigResponse,
)
from api.ai.llm_client import is_ai_enabled, chat_completion
from api.ai.prompts import (
    build_system_prompt,
    build_agent_prompt,
    build_generate_sql_prompt,
    build_fix_sql_prompt,
    build_summarize_prompt,
    build_suggest_chart_config_prompt,
    build_parse_filters_prompt,
    SUGGEST_CHART_CONFIG_TOOL,
    PARSE_FILTERS_TOOL,
)
from api.ai.tools import get_schema as tool_get_schema, TOOL_DEFINITIONS, TOOL_MAP
from api.ai.agents import classify_intent, get_agent_tools

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai", tags=["ai"])


def _require_ai_enabled():
    if not is_ai_enabled():
        raise HTTPException(
            status_code=503,
            detail="AI features are not enabled. Set AI_API_URL, AI_API_KEY, and AI_ENABLED=true.",
        )


# --- Admin Status ---

@router.get("/status", summary="Get AI status")
def ai_status(current_user: dict = Depends(require_admin)):
    """Return AI configuration status (admin only). Never exposes the full API key."""
    from api.ai.llm_client import AI_API_URL, AI_API_KEY, AI_MODEL, AI_ENABLED

    # Count sessions and messages
    with engine.connect() as conn:
        sess_count = conn.execute(text("SELECT COUNT(*) FROM ai_sessions")).scalar() or 0
        msg_count = conn.execute(text("SELECT COUNT(*) FROM ai_messages")).scalar() or 0

    return {
        "enabled": AI_ENABLED and bool(AI_API_KEY),
        "api_url": AI_API_URL,
        "api_key_set": bool(AI_API_KEY),
        "api_key_preview": f"{AI_API_KEY[:8]}...{AI_API_KEY[-4:]}" if len(AI_API_KEY) > 12 else ("***" if AI_API_KEY else ""),
        "model": AI_MODEL,
        "total_sessions": sess_count,
        "total_messages": msg_count,
    }


@router.get("/admin/sessions", summary="List all AI sessions (admin)")
def list_all_sessions(current_user: dict = Depends(require_admin)):
    """List all AI chat sessions across all users with message counts (admin only)."""
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT s.id, s.title, s.context_type, s.created_at, s.updated_at,
                   u.name as user_name, u.email as user_email,
                   (SELECT COUNT(*) FROM ai_messages WHERE session_id = s.id) as message_count
            FROM ai_sessions s
            JOIN users u ON u.id = s.user_id
            ORDER BY s.updated_at DESC
            LIMIT 100
        """)).mappings().all()
    return [dict(r) for r in rows]


# --- Sessions ---

@router.get("/sessions", response_model=list[AISessionResponse], summary="List AI sessions")
def list_sessions(current_user: dict = Depends(get_current_user)):
    """Return the current user's AI chat sessions, most recent first (max 50)."""
    _require_ai_enabled()
    user_id = int(current_user["sub"])
    with engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT id, title, context_type, context_id, connection_id, created_at, updated_at "
            "FROM ai_sessions WHERE user_id = :uid ORDER BY updated_at DESC LIMIT 50"
        ), {"uid": user_id})
        return [dict(r) for r in rows.mappings().all()]


@router.get("/sessions/{session_id}", response_model=list[AIMessageResponse], summary="Get session messages")
def get_session_messages(session_id: int, current_user: dict = Depends(get_current_user)):
    """Return all messages in an AI session, ordered chronologically."""
    _require_ai_enabled()
    user_id = int(current_user["sub"])
    with engine.connect() as conn:
        owner = conn.execute(text(
            "SELECT user_id FROM ai_sessions WHERE id = :sid"
        ), {"sid": session_id}).fetchone()
        if not owner or owner[0] != user_id:
            raise HTTPException(status_code=404, detail="Session not found")
        rows = conn.execute(text(
            "SELECT id, session_id, role, content, tool_calls, sql_query, created_at "
            "FROM ai_messages WHERE session_id = :sid ORDER BY created_at"
        ), {"sid": session_id})
        return [dict(r) for r in rows.mappings().all()]


@router.delete("/sessions/{session_id}", status_code=204, summary="Delete AI session")
def delete_session(session_id: int, current_user: dict = Depends(get_current_user)):
    """Delete an AI chat session and all its messages."""
    user_id = int(current_user["sub"])
    with engine.connect() as conn:
        result = conn.execute(text(
            "DELETE FROM ai_sessions WHERE id = :sid AND user_id = :uid"
        ), {"sid": session_id, "uid": user_id})
        conn.commit()
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Session not found")


# --- Chat (SSE streaming) ---

@router.post("/chat", summary="Chat with AI assistant")
async def chat(req: AIChatRequest, current_user: dict = Depends(get_current_user)):
    """Send a message to the AI assistant and receive an SSE stream with tool-use loop support."""
    _require_ai_enabled()
    user_id = int(current_user["sub"])

    async def event_stream():
        try:
            session_id = req.session_id
            if not session_id:
                session_id = _create_session(
                    user_id, req.connection_id,
                    req.context.get("type") if req.context else None,
                    req.context.get("id") if req.context else None,
                )
                yield _sse({"type": "session", "session_id": session_id})

            _save_message(session_id, "user", req.message)

            messages = _load_messages_for_llm(session_id, req.connection_id, req.context)

            # Classify intent and select agent
            agent_key = await classify_intent(req.message, req.context)
            yield _sse({"type": "agent", "name": agent_key})

            # Get agent-specific tools
            agent_tool_defs, agent_tool_map = get_agent_tools(
                agent_key, TOOL_DEFINITIONS, TOOL_MAP,
            )

            # Append agent-specific instructions
            agent_prompt = build_agent_prompt(agent_key)
            if agent_prompt:
                messages.append({"role": "system", "content": agent_prompt})

            # Tool-use loop (max 5 iterations)
            for _iteration in range(5):
                response = await chat_completion(
                    messages,
                    tools=agent_tool_defs if req.connection_id else None,
                )
                choice = response["choices"][0]
                msg = choice["message"]

                tool_calls = msg.get("tool_calls")
                if tool_calls:
                    messages.append(msg)
                    for tc in tool_calls:
                        fn_name = tc["function"]["name"]
                        fn_args = json.loads(tc["function"]["arguments"])
                        yield _sse({"type": "tool_call", "name": fn_name, "status": "running"})

                        handler = agent_tool_map.get(fn_name)
                        if handler:
                            sig = inspect.signature(handler)
                            if "user_id" in sig.parameters:
                                fn_args["user_id"] = user_id
                            result = await handler(**fn_args)
                        else:
                            result = {"error": f"Unknown tool: {fn_name}"}

                        result_str = json.dumps(result, ensure_ascii=False, default=str)
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tc["id"],
                            "content": result_str,
                        })
                        yield _sse({"type": "tool_result", "name": fn_name, "status": "done"})

                    continue

                content = msg.get("content", "")
                if content:
                    yield _sse({"type": "text", "content": content})
                    sql = _extract_sql(content)
                    if sql:
                        yield _sse({"type": "sql", "content": sql})

                _save_message(session_id, "assistant", content, sql_query=_extract_sql(content))
                _maybe_update_title(session_id, req.message)

                yield _sse({"type": "done", "session_id": session_id})
                break

        except Exception as e:
            logger.exception("AI chat error")
            yield _sse({"type": "error", "content": "An internal error occurred. Please try again."})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# --- One-shot endpoints ---

@router.post("/generate-sql", response_model=AITextResponse, summary="Generate SQL from description")
async def generate_sql(req: AIGenerateSQLRequest, current_user: dict = Depends(get_current_user)):
    """Generate a SQL query from a natural-language description using schema context."""
    _require_ai_enabled()
    schema_data = await tool_get_schema(req.connection_id)
    schema_str = json.dumps(schema_data, indent=2)

    messages = [
        {"role": "system", "content": build_generate_sql_prompt(req.connection_id, schema_str)},
    ]
    if req.current_sql:
        messages.append({"role": "user", "content": f"Current SQL:\n```sql\n{req.current_sql}\n```\n\nModify it to: {req.prompt}"})
    else:
        messages.append({"role": "user", "content": req.prompt})

    response = await chat_completion(messages)
    text_content = response["choices"][0]["message"]["content"]
    sql = _extract_sql(text_content)
    return AITextResponse(text=text_content, sql=sql)


@router.post("/fix-sql", response_model=AITextResponse, summary="Fix SQL error")
async def fix_sql(req: AIFixSQLRequest, current_user: dict = Depends(get_current_user)):
    """Analyze a SQL query and its error message, then return a corrected version."""
    _require_ai_enabled()
    messages = [
        {"role": "system", "content": build_fix_sql_prompt()},
        {"role": "user", "content": f"SQL:\n```sql\n{req.sql}\n```\n\nError: {req.error}"},
    ]
    response = await chat_completion(messages)
    text_content = response["choices"][0]["message"]["content"]
    sql = _extract_sql(text_content)
    return AITextResponse(text=text_content, sql=sql)


@router.post("/summarize", response_model=AITextResponse, summary="Summarize chart data")
async def summarize(req: AISummarizeRequest, current_user: dict = Depends(get_current_user)):
    """Generate a natural-language summary of chart data (uses first 50 rows)."""
    _require_ai_enabled()
    rows_for_prompt = req.rows[:50] if len(req.rows) > 50 else req.rows
    data_str = json.dumps({
        "chart_type": req.chart_type,
        "title": req.title,
        "columns": req.columns,
        "rows": rows_for_prompt,
        "total_rows": req.row_count,
    })
    messages = [
        {"role": "system", "content": build_summarize_prompt()},
        {"role": "user", "content": f"Summarize this chart data:\n{data_str}"},
    ]
    response = await chat_completion(messages)
    text_content = response["choices"][0]["message"]["content"]
    return AITextResponse(text=text_content)


@router.post(
    "/suggest-chart-config",
    response_model=AISuggestChartConfigResponse,
    summary="Suggest chart config from natural language",
)
async def suggest_chart_config(
    req: AISuggestChartConfigRequest,
    current_user: dict = Depends(get_current_user),
):
    """Generate a chart configuration from a natural-language description.

    Uses function calling to return structured output. The config is NOT saved
    to the database — the frontend applies it in the chart editor so the user
    can tweak before saving.
    """
    _require_ai_enabled()

    system_prompt = build_suggest_chart_config_prompt(
        columns=req.columns,
        current_config=req.current_config,
        current_chart_type=req.current_chart_type,
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": req.prompt},
    ]

    # Use function calling to get structured output
    response = await chat_completion(
        messages,
        tools=[SUGGEST_CHART_CONFIG_TOOL],
        temperature=0.1,
    )

    choice = response["choices"][0]
    msg = choice["message"]

    # Extract from tool call if the model used function calling
    tool_calls = msg.get("tool_calls")
    if tool_calls:
        for tc in tool_calls:
            if tc["function"]["name"] == "suggest_chart_config":
                args = json.loads(tc["function"]["arguments"])
                return AISuggestChartConfigResponse(
                    chart_type=args.get("chart_type", "bar"),
                    chart_config=args.get("chart_config", {}),
                    title=args.get("title"),
                    explanation=args.get("explanation"),
                )

    # Fallback: try to parse JSON from text content
    content = msg.get("content", "")
    try:
        # Try to find JSON in the response
        json_match = re.search(r'\{[\s\S]*\}', content)
        if json_match:
            parsed = json.loads(json_match.group())
            return AISuggestChartConfigResponse(
                chart_type=parsed.get("chart_type", "bar"),
                chart_config=parsed.get("chart_config", {}),
                title=parsed.get("title"),
                explanation=parsed.get("explanation"),
            )
    except (json.JSONDecodeError, AttributeError):
        pass

    # Last resort: return a basic config
    raise HTTPException(
        status_code=422,
        detail="AI could not generate a valid chart configuration. Please try rephrasing your request.",
    )


# --- Parse filters (NL → structured) ---

@router.post("/parse-filters", summary="Parse natural language into dashboard filters")
async def parse_filters(req: dict, current_user: dict = Depends(get_current_user)):  # TODO: replace dict with Pydantic model
    """Parse a natural-language filter description into structured filter objects.

    Expects: { prompt: str, columns: [{ name: str, type: str }] }
    Returns: { filters: [{ column: str, value: any }] }
    """
    _require_ai_enabled()

    prompt = req.get("prompt", "").strip()
    columns = req.get("columns", [])

    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required")
    if not columns:
        raise HTTPException(status_code=400, detail="columns list is required")

    system_prompt = build_parse_filters_prompt(columns)

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": prompt},
    ]

    response = await chat_completion(
        messages,
        tools=[PARSE_FILTERS_TOOL],
        temperature=0.1,
    )

    choice = response["choices"][0]
    msg = choice["message"]

    # Extract from tool call
    tool_calls = msg.get("tool_calls")
    if tool_calls:
        for tc in tool_calls:
            if tc["function"]["name"] == "apply_filters":
                args = json.loads(tc["function"]["arguments"])
                return {"filters": args.get("filters", [])}

    # Fallback: try to parse JSON from text content
    content = msg.get("content", "")
    try:
        json_match = re.search(r'\{[\s\S]*\}', content)
        if json_match:
            parsed = json.loads(json_match.group())
            if "filters" in parsed:
                return {"filters": parsed["filters"]}
    except (json.JSONDecodeError, AttributeError):
        pass

    return {"filters": []}


# --- Glossary (admin only) ---

@router.get("/glossary", response_model=list[AIGlossaryResponse], summary="List glossary terms")
def list_glossary(current_user: dict = Depends(get_current_user)):
    """Return all business glossary terms sorted alphabetically."""
    with engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT id, term, definition, sql_hint, created_by, created_at "
            "FROM ai_glossary ORDER BY term"
        ))
        return [dict(r) for r in rows.mappings().all()]


@router.post("/glossary", response_model=AIGlossaryResponse, status_code=201, summary="Create glossary term")
def create_glossary_term(req: AIGlossaryCreate, current_user: dict = Depends(require_admin)):
    """Add a new business glossary term with definition and optional SQL hint (admin only)."""
    user_id = int(current_user["sub"])
    with engine.connect() as conn:
        row = conn.execute(text(
            "INSERT INTO ai_glossary (term, definition, sql_hint, created_by) "
            "VALUES (:term, :definition, :sql_hint, :uid) "
            "RETURNING id, term, definition, sql_hint, created_by, created_at"
        ), {"term": req.term, "definition": req.definition, "sql_hint": req.sql_hint, "uid": user_id})
        conn.commit()
        return dict(row.mappings().fetchone())


@router.put("/glossary/{term_id}", response_model=AIGlossaryResponse, summary="Update glossary term")
def update_glossary_term(term_id: int, req: AIGlossaryUpdate, current_user: dict = Depends(require_admin)):
    """Update an existing glossary term's definition or SQL hint (admin only)."""
    updates = req.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    set_parts = [f"{k} = :{k}" for k in updates]
    updates["id"] = term_id
    with engine.connect() as conn:
        row = conn.execute(text(
            f"UPDATE ai_glossary SET {', '.join(set_parts)} WHERE id = :id "
            "RETURNING id, term, definition, sql_hint, created_by, created_at"
        ), updates)
        conn.commit()
        result = row.mappings().fetchone()
        if not result:
            raise HTTPException(status_code=404, detail="Term not found")
        return dict(result)


@router.delete("/glossary/{term_id}", status_code=204, summary="Delete glossary term")
def delete_glossary_term(term_id: int, current_user: dict = Depends(require_admin)):
    """Permanently remove a glossary term (admin only)."""
    with engine.connect() as conn:
        result = conn.execute(text("DELETE FROM ai_glossary WHERE id = :id"), {"id": term_id})
        conn.commit()
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Term not found")


# --- Helpers ---

def _sse(data: dict) -> str:
    """Format a dict as an SSE data line."""
    return f"data: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"


def _create_session(
    user_id: int,
    connection_id: int | None,
    context_type: str | None,
    context_id: int | None,
) -> int:
    with engine.connect() as conn:
        row = conn.execute(text(
            "INSERT INTO ai_sessions (user_id, connection_id, context_type, context_id) "
            "VALUES (:uid, :cid, :ct, :ci) RETURNING id"
        ), {"uid": user_id, "cid": connection_id, "ct": context_type, "ci": context_id})
        conn.commit()
        return row.fetchone()[0]


def _save_message(
    session_id: int,
    role: str,
    content: str,
    tool_calls: list | None = None,
    sql_query: str | None = None,
):
    with engine.connect() as conn:
        conn.execute(text(
            "INSERT INTO ai_messages (session_id, role, content, tool_calls, sql_query) "
            "VALUES (:sid, :role, :content, :tc, :sql)"
        ), {
            "sid": session_id,
            "role": role,
            "content": content,
            "tc": json.dumps(tool_calls) if tool_calls else None,
            "sql": sql_query,
        })
        conn.commit()


def _load_messages_for_llm(
    session_id: int,
    connection_id: int | None,
    context: dict | None,
) -> list[dict]:
    """Load conversation history and prepend system prompt.

    When there are more than MAX_MESSAGES messages, older messages are
    summarised (truncated to 200 chars each) so the context window stays
    manageable.  The most recent ``keep_count`` messages are kept verbatim.
    """
    messages = [{
        "role": "system",
        "content": build_system_prompt(
            connection_id=connection_id,
            context_type=context.get("type") if context else None,
            context_id=context.get("id") if context else None,
        ),
    }]

    with engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT role, content FROM ai_messages "
            "WHERE session_id = :sid ORDER BY created_at"
        ), {"sid": session_id})
        history = [{"role": r["role"], "content": r["content"]}
                   for r in rows.mappings().all()]

    # Conversation summary for long dialogues
    max_messages = 15
    if len(history) > max_messages:
        keep_count = 10
        old_messages = history[:-keep_count]
        recent_messages = history[-keep_count:]

        summary_parts = []
        for msg in old_messages:
            prefix = "User" if msg["role"] == "user" else "Assistant"
            content_preview = (msg.get("content") or "")[:200]
            if content_preview:
                summary_parts.append(f"{prefix}: {content_preview}")

        summary_text = "\n".join(summary_parts)
        messages.append({
            "role": "system",
            "content": (
                "[Conversation summary of earlier messages]\n"
                f"{summary_text}\n"
                "[End of summary — recent messages follow]"
            ),
        })
        messages.extend(recent_messages)
    else:
        messages.extend(history)

    return messages


def _maybe_update_title(session_id: int, first_message: str):
    """Set session title from first user message if not set yet."""
    title = first_message[:100].strip()
    if not title:
        return
    with engine.connect() as conn:
        conn.execute(text(
            "UPDATE ai_sessions SET title = :title, updated_at = NOW() "
            "WHERE id = :sid AND title = ''"
        ), {"sid": session_id, "title": title})
        conn.commit()


def _extract_sql(text_content: str) -> str | None:
    """Extract SQL from markdown code block, or return whole text if no block found."""
    match = re.search(r'```sql\s*\n(.*?)\n```', text_content, re.DOTALL)
    if match:
        return match.group(1).strip()
    match = re.search(r'```\s*\n(.*?)\n```', text_content, re.DOTALL)
    if match:
        return match.group(1).strip()
    stripped = text_content.strip()
    if stripped.upper().startswith(("SELECT", "WITH")):
        return stripped
    return None
