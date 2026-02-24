import plotly.express as px
from api.renderers.base import BaseRenderer, ChartCapabilities


class PieRenderer(BaseRenderer):
    chart_type = "pie"
    aliases = ["donut"]
    capabilities = ChartCapabilities(needs_x=True, needs_y=True)

    def pre_transform(self, config):
        if config.get("_original_type") == "donut":
            return {**config, "donut_hole": config.get("donut_hole", 0.4)}
        return config

    def render(self, df, x_col, y, color, config, df_melted):
        y_cols = config.get("y_columns", [])
        donut_hole = config.get("donut_hole", 0)
        fig = px.pie(df, values=y_cols[0], names=x_col, hole=donut_hole)
        if config.get("show_values"):
            fig.update_traces(textinfo="label+percent+value")
        return fig
