"""Discrete color palettes shared by the executor and chart renderers.

Standalone module (depends only on plotly) so both `api.executor` and the
individual renderers can import it without circular-import risk.
"""
import plotly.express as px

# Built-in qualitative color palettes (keys match the frontend Color Palette UI).
PALETTES = {
    "default": px.colors.qualitative.Plotly,
    "pastel": px.colors.qualitative.Pastel,
    "vivid": px.colors.qualitative.Vivid,
    "bold": px.colors.qualitative.Bold,
    "dark": px.colors.qualitative.Dark24,
    "earth": px.colors.qualitative.Set2,
}


def palette_sequence(config: dict) -> list[str]:
    """Resolve the discrete color sequence for a chart config.

    Passed as `color_discrete_sequence` to px so the selected palette actually
    recolors traces. Setting layout `colorway` alone is a no-op once px assigns
    explicit per-trace colors.
    """
    return PALETTES.get(config.get("color_palette", "default"), PALETTES["default"])
