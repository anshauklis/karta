import pandas as pd
import plotly.express as px
from api.renderers.base import BaseRenderer, ChartCapabilities


class CorrelationRenderer(BaseRenderer):
    chart_type = "correlation"
    capabilities = ChartCapabilities(needs_x=False, supports_styling=False)

    def render(self, df, x_col, y, color, config, df_melted):
        y_cols = config.get("y_columns", [])
        numeric_cols = y_cols if y_cols else [
            c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])
        ]
        if not numeric_cols:
            return None
        corr = df[numeric_cols].corr()
        fig = px.imshow(
            corr, text_auto=".2f", aspect="auto",
            color_continuous_scale="RdBu_r", zmin=-1, zmax=1,
        )
        return fig
