"""
Multi-agent routing for the AI copilot.

Three specialized agents — Data Analyst, Chart Builder, Dashboard Manager —
with a lightweight LLM-based intent classifier that routes user messages
to the appropriate agent.
"""

import json
import logging

from api.ai.llm_client import chat_completion

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Agent definitions
# ---------------------------------------------------------------------------

AGENTS: dict[str, dict] = {
    "data_analyst": {
        "name": "Data Analyst",
        "description": (
            "Explores databases, writes SQL, profiles tables, executes queries, "
            "validates SQL, and explains results."
        ),
        "tools": [
            "search_content",
            "get_connections",
            "get_schema",
            "get_sample",
            "get_table_profile",
            "execute_sql",
            "list_datasets",
            "list_semantic_models",
            "semantic_query",
            "validate_sql",
        ],
    },
    "chart_builder": {
        "name": "Chart Builder",
        "description": (
            "Creates, configures, previews, updates, and clones charts. "
            "Understands visualization best practices."
        ),
        "tools": [
            "get_connections",
            "get_schema",
            "get_table_profile",
            "execute_sql",
            "quick_create_chart",
            "create_dataset",
            "create_chart",
            "update_chart",
            "delete_chart",
            "preview_chart",
            "patch_chart_config",
            "get_chart_config_schema",
            "clone_chart",
            "list_semantic_models",
            "semantic_query",
        ],
    },
    "dashboard_manager": {
        "name": "Dashboard Manager",
        "description": (
            "Manages dashboards: creates, clones, adds filters, organizes "
            "charts across dashboards."
        ),
        "tools": [
            "search_content",
            "list_dashboards",
            "create_dashboard",
            "clone_dashboard",
            "clone_chart",
            "add_filter",
        ],
    },
}

# ---------------------------------------------------------------------------
# Routing tool (function-calling schema for intent classification)
# ---------------------------------------------------------------------------

ROUTING_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "route_to_agent",
            "description": (
                "Select the best agent to handle the user's request."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "agent": {
                        "type": "string",
                        "enum": ["data_analyst", "chart_builder", "dashboard_manager"],
                        "description": (
                            "data_analyst — SQL, data exploration, profiling, query results. "
                            "chart_builder — chart creation, config, visualization. "
                            "dashboard_manager — dashboard CRUD, cloning, filters."
                        ),
                    },
                },
                "required": ["agent"],
            },
        },
    },
]

_ROUTING_SYSTEM_PROMPT = (
    "You are a lightweight router. Given the user's message, decide which "
    "specialist agent should handle it.\n\n"
    "Agents:\n"
    "- data_analyst: SQL queries, data exploration, table profiling, "
    "executing/validating SQL, explaining results, semantic queries.\n"
    "- chart_builder: creating/updating/deleting charts, visualization config, "
    "chart types, preview, styling.\n"
    "- dashboard_manager: creating/cloning dashboards, adding filters, "
    "organizing charts across dashboards.\n\n"
    "Call the route_to_agent function with the best match. "
    "If unsure, choose data_analyst."
)


# ---------------------------------------------------------------------------
# Intent classification
# ---------------------------------------------------------------------------


async def classify_intent(
    user_message: str,
    context: dict | None = None,
) -> str:
    """Classify user intent and return the agent key.

    Makes a lightweight LLM call using function calling to pick the agent.
    Falls back to ``"data_analyst"`` on any error.
    """
    try:
        messages: list[dict] = [
            {"role": "system", "content": _ROUTING_SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ]

        # Provide context hint if available
        if context:
            ctx_type = context.get("type")
            if ctx_type == "chart":
                messages[0]["content"] += (
                    "\nHint: the user is currently on a chart editor page."
                )
            elif ctx_type == "dashboard":
                messages[0]["content"] += (
                    "\nHint: the user is currently on a dashboard page."
                )

        response = await chat_completion(
            messages,
            tools=ROUTING_TOOLS,
            temperature=0.0,
            max_tokens=64,
        )

        choice = response["choices"][0]
        msg = choice["message"]
        tool_calls = msg.get("tool_calls")

        if tool_calls:
            for tc in tool_calls:
                if tc["function"]["name"] == "route_to_agent":
                    args = json.loads(tc["function"]["arguments"])
                    agent_key = args.get("agent", "data_analyst")
                    if agent_key in AGENTS:
                        return agent_key

        return "data_analyst"

    except Exception:
        logger.exception("Agent routing failed, falling back to data_analyst")
        return "data_analyst"


# ---------------------------------------------------------------------------
# Tool filtering
# ---------------------------------------------------------------------------


def get_agent_tools(
    agent_key: str,
    all_tool_definitions: list[dict],
    all_tool_map: dict,
) -> tuple[list[dict], dict]:
    """Return (tool_definitions, tool_map) scoped to *agent_key*.

    Tools listed in the agent definition but not yet present in
    ``all_tool_map`` (e.g. future semantic tools) are silently skipped.
    """
    agent = AGENTS.get(agent_key)
    if not agent:
        return all_tool_definitions, all_tool_map

    allowed = set(agent["tools"])

    filtered_defs = [
        td
        for td in all_tool_definitions
        if td["function"]["name"] in allowed
        and td["function"]["name"] in all_tool_map
    ]

    filtered_map = {
        name: handler
        for name, handler in all_tool_map.items()
        if name in allowed
    }

    return filtered_defs, filtered_map
