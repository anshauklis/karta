import plotly.express as px
from api.renderers.base import BaseRenderer, ChartCapabilities


class HeatmapRenderer(BaseRenderer):
    chart_type = "heatmap"
    capabilities = ChartCapabilities(supports_color=True)

    def render(self, df, x_col, y, color, config, df_melted):
        y_cols = config.get("y_columns", [])
        color_col = config.get("color_column") or None
        text_auto = bool(config.get("show_values"))
        y_col_heat = color_col or (y_cols[1] if len(y_cols) > 1 else None)
        if y_col_heat:
            pivot_df = df.pivot_table(index=y_col_heat, columns=x_col,
                                      values=y_cols[0], aggfunc="sum").fillna(0)
            fig = px.imshow(pivot_df, text_auto=text_auto, aspect="auto",
                            color_continuous_scale="Blues")
        else:
            fig = px.imshow(df.set_index(x_col)[y_cols], text_auto=text_auto,
                            aspect="auto", color_continuous_scale="Blues")
        return fig
