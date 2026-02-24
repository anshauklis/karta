import plotly.express as px
from api.renderers.base import BaseRenderer, ChartCapabilities


class ScatterRenderer(BaseRenderer):
    chart_type = "scatter"
    capabilities = ChartCapabilities(
        supports_color=True, supports_sort=True, supports_overlays=True,
    )

    def render(self, df, x_col, y, color, config, df_melted):
        show_values = config.get("show_values", False)
        fig = px.scatter(df_melted, x=x_col, y=y, color=color,
                         text=y if show_values else None)
        if show_values:
            fig.update_traces(textposition="top center")
        return fig
