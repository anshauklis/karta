from api.renderers.base import BaseRenderer

_REGISTRY: dict[str, BaseRenderer] = {}


def register(renderer_cls: type[BaseRenderer]) -> None:
    instance = renderer_cls()
    _REGISTRY[instance.chart_type] = instance
    for alias in instance.aliases:
        _REGISTRY[alias] = instance


def get_renderer(chart_type: str) -> BaseRenderer | None:
    return _REGISTRY.get(chart_type)


def get_capabilities() -> dict[str, dict]:
    """Return {type_name: {capability: bool}} for all registered types (no aliases)."""
    seen = set()
    result = {}
    for name, renderer in _REGISTRY.items():
        if id(renderer) in seen:
            continue
        seen.add(id(renderer))
        caps = renderer.capabilities.to_dict()
        result[renderer.chart_type] = caps
        for alias in renderer.aliases:
            result[alias] = caps
    return result


# --- Register all renderers ---
from api.renderers.bar import BarRenderer
from api.renderers.line import LineRenderer
from api.renderers.area import AreaRenderer
from api.renderers.pie import PieRenderer
from api.renderers.scatter import ScatterRenderer
from api.renderers.histogram import HistogramRenderer
from api.renderers.heatmap import HeatmapRenderer
from api.renderers.box import BoxRenderer
from api.renderers.violin import ViolinRenderer
from api.renderers.treemap import TreemapRenderer
from api.renderers.funnel import FunnelRenderer
from api.renderers.waterfall import WaterfallRenderer
from api.renderers.combo import ComboRenderer
from api.renderers.correlation import CorrelationRenderer
from api.renderers.pareto import ParetoRenderer
from api.renderers.control import ControlRenderer
from api.renderers.kpi import KPIRenderer

register(BarRenderer)
register(LineRenderer)
register(AreaRenderer)
register(PieRenderer)
register(ScatterRenderer)
register(HistogramRenderer)
register(HeatmapRenderer)
register(BoxRenderer)
register(ViolinRenderer)
register(TreemapRenderer)
register(FunnelRenderer)
register(WaterfallRenderer)
register(ComboRenderer)
register(CorrelationRenderer)
register(ParetoRenderer)
register(ControlRenderer)
register(KPIRenderer)
