import plotly.graph_objects as go
from plotly.subplots import make_subplots
from api.renderers.base import BaseRenderer, ChartCapabilities


class ComboRenderer(BaseRenderer):
    chart_type = "combo"
    capabilities = ChartCapabilities(supports_overlays=True)

    def render(self, df, x_col, y, color, config, df_melted):
        y_cols = config.get("y_columns", [])
        show_values = config.get("show_values", False)
        fig = make_subplots(specs=[[{"secondary_y": True}]])
        bar_col = y_cols[0]
        line_cols = y_cols[1:] if len(y_cols) > 1 else []
        fig.add_trace(
            go.Bar(x=df[x_col], y=df[bar_col], name=bar_col,
                   text=df[bar_col] if show_values else None,
                   textposition="outside" if show_values else None),
            secondary_y=False,
        )
        for col in line_cols:
            fig.add_trace(
                go.Scatter(x=df[x_col], y=df[col], name=col, mode="lines+markers",
                           text=df[col] if show_values else None,
                           textposition="top center" if show_values else None),
                secondary_y=True,
            )
        fig.update_layout(barmode="group")
        return fig
