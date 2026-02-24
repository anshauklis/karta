import plotly.express as px
from api.renderers.base import BaseRenderer, ChartCapabilities


class BoxRenderer(BaseRenderer):
    chart_type = "box"
    capabilities = ChartCapabilities(supports_color=True)

    def render(self, df, x_col, y, color, config, df_melted):
        fig = px.box(df_melted, x=x_col, y=y, color=color)
        return fig
