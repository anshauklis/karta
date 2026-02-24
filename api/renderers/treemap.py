import plotly.express as px
from api.renderers.base import BaseRenderer, ChartCapabilities


class TreemapRenderer(BaseRenderer):
    chart_type = "treemap"
    capabilities = ChartCapabilities(supports_color=True)

    def render(self, df, x_col, y, color, config, df_melted):
        y_cols = config.get("y_columns", [])
        color_col = config.get("color_column") or None
        path_cols = [x_col] + ([color_col] if color_col else [])
        fig = px.treemap(df, path=path_cols, values=y_cols[0])
        return fig
