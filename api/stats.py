import numpy as np
import pandas as pd
from scipy import stats as sp_stats


def linear_trendline(x_numeric: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, float, float]:
    """Returns (y_predicted, slope, r_squared)."""
    slope, intercept, r, _, _ = sp_stats.linregress(x_numeric, y)
    return slope * x_numeric + intercept, slope, r ** 2


def polynomial_trendline(x_numeric: np.ndarray, y: np.ndarray, degree: int = 2) -> np.ndarray:
    """Returns y_predicted for polynomial fit."""
    coeffs = np.polyfit(x_numeric, y, degree)
    return np.polyval(coeffs, x_numeric)


def moving_average(y: pd.Series, window: int = 7) -> pd.Series:
    """Simple moving average."""
    return y.rolling(window=window, min_periods=1).mean()


def exponential_moving_average(y: pd.Series, span: int = 7) -> pd.Series:
    """EMA."""
    return y.ewm(span=span, min_periods=1).mean()


def confidence_band(y: pd.Series, window: int = 7, n_std: float = 2.0) -> tuple[pd.Series, pd.Series]:
    """Rolling mean +/- n_std * rolling std."""
    rolling_mean = y.rolling(window=window, min_periods=1).mean()
    rolling_std = y.rolling(window=window, min_periods=1).std().fillna(0)
    return rolling_mean - n_std * rolling_std, rolling_mean + n_std * rolling_std


def detect_anomalies(y: pd.Series, window: int = 14, threshold: float = 2.5) -> pd.Series:
    """Returns boolean mask where values are > threshold std from rolling mean."""
    rolling_mean = y.rolling(window=window, min_periods=1).mean()
    rolling_std = y.rolling(window=window, min_periods=1).std().fillna(0)
    z_scores = ((y - rolling_mean) / rolling_std.replace(0, 1)).abs()
    return z_scores > threshold


def percent_change(y: pd.Series) -> pd.Series:
    """Period-over-period percent change."""
    return y.pct_change() * 100


def cumulative_sum(y: pd.Series) -> pd.Series:
    """Running cumulative sum."""
    return y.cumsum()


def z_score(y: pd.Series) -> pd.Series:
    """Standard Z-score."""
    return (y - y.mean()) / y.std()


def control_limits(y: pd.Series) -> tuple[float, float, float]:
    """Returns (mean, UCL, LCL) using +/-3 sigma."""
    mean = y.mean()
    std = y.std()
    return mean, mean + 3 * std, mean - 3 * std


def linear_forecast(y: pd.Series, periods: int = 7) -> pd.Series:
    """Extend series with linear extrapolation."""
    x = np.arange(len(y))
    slope, intercept, _, _, _ = sp_stats.linregress(x, y.values)
    future_x = np.arange(len(y), len(y) + periods)
    return pd.Series(slope * future_x + intercept)


def holt_winters_forecast(y: pd.Series, periods: int = 7, alpha: float = 0.3) -> pd.Series:
    """Simple exponential smoothing forecast (Holt's method)."""
    values = y.to_numpy(dtype=float)
    level = values[0]
    trend = (values[-1] - values[0]) / len(values) if len(values) > 1 else 0.0
    for val in values:
        prev_level = level
        level = alpha * val + (1 - alpha) * (level + trend)
        trend = alpha * (level - prev_level) + (1 - alpha) * trend
    forecast = []
    for _ in range(periods):
        forecast.append(level + trend)
        level += trend
    return pd.Series(forecast)
