import plotly.graph_objects as go
from api.renderers.base import BaseRenderer, ChartCapabilities


class WaterfallRenderer(BaseRenderer):
    chart_type = "waterfall"
    capabilities = ChartCapabilities()

    def render(self, df, x_col, y, color, config, df_melted):
        y_cols = config.get("y_columns", [])
        fig = go.Figure(go.Waterfall(
            x=df[x_col].tolist(),
            y=df[y_cols[0]].tolist(),
            connector={"line": {"color": "rgb(63, 63, 63)"}},
            increasing={"marker": {"color": "#636EFA"}},
            decreasing={"marker": {"color": "#EF553B"}},
            totals={"marker": {"color": "#00CC96"}},
        ))
        if config.get("show_values"):
            fig.update_traces(textposition="outside")
        return fig
