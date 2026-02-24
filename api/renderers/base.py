from dataclasses import dataclass, asdict


@dataclass
class ChartCapabilities:
    needs_x: bool = True
    needs_y: bool = True
    supports_color: bool = False
    supports_stack: bool = False
    supports_sort: bool = False
    supports_overlays: bool = False
    supports_styling: bool = True
    supports_cond_format: bool = False

    def to_dict(self) -> dict:
        return asdict(self)


class BaseRenderer:
    chart_type: str = ""
    aliases: list[str] = []
    capabilities = ChartCapabilities()

    def pre_transform(self, config: dict) -> dict:
        """Handle aliases (e.g. bar_h -> bar + horizontal). Default: no-op."""
        return config

    def render(self, df, x_col, y, color, config, df_melted):
        """Create Plotly figure. Receives both original df and melted df_melted."""
        raise NotImplementedError
