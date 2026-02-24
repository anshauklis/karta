import plotly.graph_objects as go
from plotly.subplots import make_subplots
from api.renderers.base import BaseRenderer, ChartCapabilities


class ParetoRenderer(BaseRenderer):
    chart_type = "pareto"
    capabilities = ChartCapabilities(supports_sort=True)

    def render(self, df, x_col, y, color, config, df_melted):
        y_cols = config.get("y_columns", [])
        sorted_df = df.sort_values(by=y_cols[0], ascending=False)
        cumulative = sorted_df[y_cols[0]].cumsum() / sorted_df[y_cols[0]].sum() * 100
        fig = make_subplots(specs=[[{"secondary_y": True}]])
        fig.add_trace(
            go.Bar(x=sorted_df[x_col], y=sorted_df[y_cols[0]], name=y_cols[0]),
            secondary_y=False,
        )
        fig.add_trace(
            go.Scatter(x=sorted_df[x_col], y=cumulative,
                       name="Cumulative %", mode="lines+markers"),
            secondary_y=True,
        )
        fig.update_yaxes(title_text="Cumulative %", secondary_y=True, range=[0, 105])
        return fig
