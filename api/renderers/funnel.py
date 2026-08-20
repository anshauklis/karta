import plotly.express as px
from api.renderers.base import BaseRenderer, ChartCapabilities
from api.renderers.palettes import palette_sequence


class FunnelRenderer(BaseRenderer):
    chart_type = "funnel"
    capabilities = ChartCapabilities(supports_sort=True)

    def render(self, df, x_col, y, color, config, df_melted):
        y_cols = config.get("y_columns", [])
        fig = px.funnel(df, x=y_cols[0], y=x_col,
                        color_discrete_sequence=palette_sequence(config))
        if config.get("show_values"):
            fig.update_traces(textinfo="value+percent initial")
        return fig
