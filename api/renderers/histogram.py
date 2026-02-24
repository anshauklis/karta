import plotly.express as px
from api.renderers.base import BaseRenderer, ChartCapabilities


class HistogramRenderer(BaseRenderer):
    chart_type = "histogram"
    capabilities = ChartCapabilities(needs_y=False, supports_color=True)

    def render(self, df, x_col, y, color, config, df_melted):
        bins = config.get("bins", 20)
        y_cols = config.get("y_columns", [])
        color_col = config.get("color_column") or None
        text_auto = bool(config.get("show_values"))
        if y_cols:
            fig = px.histogram(df, x=x_col, y=y_cols[0], color=color_col,
                               nbins=bins, histfunc="sum", text_auto=text_auto)
        else:
            fig = px.histogram(df, x=x_col, color=color_col, nbins=bins,
                               text_auto=text_auto)
        return fig
