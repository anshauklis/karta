import plotly.express as px
from api.renderers.base import BaseRenderer, ChartCapabilities
from api.renderers.palettes import palette_sequence


class BarRenderer(BaseRenderer):
    chart_type = "bar"
    aliases = ["bar_h"]
    capabilities = ChartCapabilities(
        supports_color=True, supports_stack=True,
        supports_sort=True, supports_overlays=True,
    )

    def pre_transform(self, config):
        if config.get("_original_type") == "bar_h":
            return {**config, "orientation": "horizontal"}
        return config

    def render(self, df, x_col, y, color, config, df_melted):
        stack_mode = config.get("stack_mode", "none")
        barmode = "stack" if stack_mode in ("stacked", "percent") else "group"
        text_auto = bool(config.get("show_values"))
        orientation = config.get("orientation", "vertical")
        seq = palette_sequence(config)
        if orientation == "horizontal":
            fig = px.bar(df_melted, x=y, y=x_col, color=color,
                         barmode=barmode, orientation="h", text_auto=text_auto,
                         color_discrete_sequence=seq)
        else:
            fig = px.bar(df_melted, x=x_col, y=y, color=color,
                         barmode=barmode, text_auto=text_auto,
                         color_discrete_sequence=seq)
        if stack_mode == "percent":
            fig.update_layout(barnorm="percent")
        return fig
