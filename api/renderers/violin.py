import plotly.express as px
from api.renderers.base import BaseRenderer, ChartCapabilities


class ViolinRenderer(BaseRenderer):
    chart_type = "violin"
    capabilities = ChartCapabilities(supports_color=True)

    def render(self, df, x_col, y, color, config, df_melted):
        fig = px.violin(df_melted, x=x_col, y=y, color=color,
                        box=True, points="outliers")
        return fig
