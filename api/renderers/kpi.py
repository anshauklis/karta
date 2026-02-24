import plotly.graph_objects as go
from api.renderers.base import BaseRenderer, ChartCapabilities


class KPIRenderer(BaseRenderer):
    chart_type = "kpi"
    capabilities = ChartCapabilities(
        needs_x=False, needs_y=True, supports_styling=False,
    )

    def render(self, df, x_col, y, color, config, df_melted):
        y_cols = config.get("y_columns", [])
        value = df[y_cols[0]].sum() if len(df) > 0 else 0
        kpi_target = config.get("kpi_target")
        kpi_prefix = config.get("kpi_prefix", "")
        kpi_suffix = config.get("kpi_suffix", "")
        x_label = config.get("x_axis_label", "")
        ind_mode = "number"
        if kpi_target is not None:
            ind_mode += "+delta"
        fig = go.Figure(go.Indicator(
            mode=ind_mode,
            value=value,
            delta={"reference": float(kpi_target)} if kpi_target is not None else None,
            number={"prefix": kpi_prefix, "suffix": kpi_suffix},
            title={"text": x_label or (x_col if x_col else y_cols[0])},
        ))
        return fig
