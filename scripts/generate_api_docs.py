"""Generate Markdown API documentation from OpenAPI schema.

Usage: python scripts/generate_api_docs.py > docs/api/README.md
Requires: running API server on localhost:80 (or set KARTA_API_URL)
"""
import json
import os
import urllib.request


API_URL = os.environ.get("KARTA_API_URL", "http://localhost:80")


def fetch_openapi() -> dict:
    """Fetch OpenAPI JSON from running API."""
    url = f"{API_URL}/openapi.json"
    with urllib.request.urlopen(url) as resp:
        return json.loads(resp.read())


def generate_markdown(spec: dict) -> str:
    """Convert OpenAPI spec to Markdown."""
    lines: list[str] = []
    info = spec.get("info", {})
    lines.append(f"# {info.get('title', 'API Documentation')}")
    lines.append("")
    lines.append(info.get("description", ""))
    lines.append("")
    lines.append(f"**Version:** {info.get('version', '?')}")
    lines.append("")

    # Group paths by tag
    tag_paths: dict[str, list] = {}
    for path, methods in spec.get("paths", {}).items():
        for method, details in methods.items():
            if method in ("get", "post", "put", "delete", "patch"):
                tags = details.get("tags", ["other"])
                for tag in tags:
                    tag_paths.setdefault(tag, []).append(
                        (method.upper(), path, details)
                    )

    # Tag descriptions
    tag_descs = {
        t["name"]: t.get("description", "") for t in spec.get("tags", [])
    }

    # Preserve tag order from spec
    tag_order = [t["name"] for t in spec.get("tags", [])]
    extra_tags = sorted(set(tag_paths.keys()) - set(tag_order))
    ordered_tags = tag_order + extra_tags

    for tag in ordered_tags:
        if tag not in tag_paths:
            continue
        endpoints = tag_paths[tag]
        desc = tag_descs.get(tag, "")
        lines.append(f"## {tag}")
        if desc:
            lines.append(f"*{desc}*")
        lines.append("")

        for method, path, details in endpoints:
            summary = details.get("summary", "")
            description = details.get("description", "")
            lines.append(f"### `{method} {path}`")
            if summary:
                lines.append(f"**{summary}**")
            lines.append("")
            if description:
                lines.append(description.strip())
                lines.append("")

            # Parameters
            params = details.get("parameters", [])
            if params:
                lines.append("**Parameters:**")
                lines.append("")
                lines.append("| Name | In | Type | Required | Description |")
                lines.append("|------|-----|------|----------|-------------|")
                for p in params:
                    schema = p.get("schema", {})
                    ptype = schema.get("type", "string")
                    lines.append(
                        f"| `{p['name']}` | {p.get('in', '?')} | {ptype} "
                        f"| {p.get('required', False)} | "
                        f"{p.get('description', '')} |"
                    )
                lines.append("")

            # Request body
            body = details.get("requestBody", {})
            if body:
                content = body.get("content", {})
                for ct, ct_spec in content.items():
                    ref = ct_spec.get("schema", {}).get("$ref", "")
                    if ref:
                        model_name = ref.split("/")[-1]
                        lines.append(
                            f"**Request Body:** `{model_name}` ({ct})"
                        )
                        lines.append("")

            # Responses
            responses = details.get("responses", {})
            if responses:
                lines.append("**Responses:**")
                lines.append("")
                for code, resp in responses.items():
                    rdesc = resp.get("description", "")
                    lines.append(f"- `{code}`: {rdesc}")
                lines.append("")

            lines.append("---")
            lines.append("")

    # Schemas section
    schemas = spec.get("components", {}).get("schemas", {})
    if schemas:
        lines.append("## Models")
        lines.append("")
        for name, schema in sorted(schemas.items()):
            lines.append(f"### {name}")
            lines.append("")
            sdesc = schema.get("description", "")
            if sdesc:
                lines.append(sdesc)
                lines.append("")
            props = schema.get("properties", {})
            required = set(schema.get("required", []))
            if props:
                lines.append("| Field | Type | Required | Description |")
                lines.append("|-------|------|----------|-------------|")
                for field, fspec in props.items():
                    ftype = fspec.get(
                        "type",
                        fspec.get("$ref", "?").split("/")[-1],
                    )
                    fdesc = fspec.get("description", "")
                    freq = "Yes" if field in required else "No"
                    lines.append(
                        f"| `{field}` | {ftype} | {freq} | {fdesc} |"
                    )
                lines.append("")

    return "\n".join(lines)


def main():
    spec = fetch_openapi()
    md = generate_markdown(spec)
    print(md)


if __name__ == "__main__":
    main()
