import plotly.graph_objects as go
from api.renderers.base import BaseRenderer, ChartCapabilities


class ControlRenderer(BaseRenderer):
    chart_type = "control"
    capabilities = ChartCapabilities()

    def render(self, df, x_col, y, color, config, df_melted):
        from api.stats import control_limits
        y_cols = config.get("y_columns", [])
        y_data = df[y_cols[0]]
        mean_val, ucl, lcl = control_limits(y_data)
        fig = go.Figure()
        fig.add_trace(go.Scatter(
            x=df[x_col], y=y_data, mode="lines+markers", name=y_cols[0],
        ))
        fig.add_hline(y=mean_val, line_color="green", line_dash="solid",
                      annotation_text=f"Mean={mean_val:.2f}")
        fig.add_hline(y=ucl, line_color="red", line_dash="dash",
                      annotation_text=f"UCL={ucl:.2f}")
        fig.add_hline(y=lcl, line_color="red", line_dash="dash",
                      annotation_text=f"LCL={lcl:.2f}")
        ooc = (y_data > ucl) | (y_data < lcl)
        if ooc.any():
            fig.add_trace(go.Scatter(
                x=df[x_col][ooc], y=y_data[ooc], mode="markers",
                marker=dict(color="red", size=10, symbol="diamond"),
                name="Out of Control",
            ))
        return fig
