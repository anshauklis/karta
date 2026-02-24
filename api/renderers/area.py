import plotly.express as px
from api.renderers.base import BaseRenderer, ChartCapabilities


class AreaRenderer(BaseRenderer):
    chart_type = "area"
    capabilities = ChartCapabilities(
        supports_color=True, supports_stack=True, supports_overlays=True,
    )

    def render(self, df, x_col, y, color, config, df_melted):
        stack_mode = config.get("stack_mode", "none")
        groupnorm = "percent" if stack_mode == "percent" else None
        fig = px.area(df_melted, x=x_col, y=y, color=color, groupnorm=groupnorm)
        return fig
