import numpy as np
import pandas as pd
from datetime import datetime
from dataclasses import dataclass

HOURLY_TIME_FACTORS = {
    0: 0.025, 1: 0.033, 2: 0.036, 3: 0.041, 4: 0.055, 5: 0.076,
    6: 0.091, 7: 0.126, 8: 0.159, 9: 0.196, 10: 0.257, 11: 0.316,
    12: 0.386, 13: 0.467, 14: 0.544, 15: 0.625, 16: 0.702, 17: 0.781,
    18: 0.851, 19: 0.927, 20: 1.000, 21: 1.111, 22: 1.064, 23: 1.044,
}


@dataclass
class AnomalyResult:
    is_anomaly: bool
    severity: str  # 'info' | 'warning' | 'critical'
    current_value: float
    message: str
    details: dict


def check_anomaly(df: pd.DataFrame, config: dict) -> AnomalyResult:
    """Check for anomalies using IQR and/or 3-sigma methods.

    Expects df to have historical values. The LAST row is the current value,
    all preceding rows are the baseline.
    """
    col = config.get("metric_column", "")
    if col not in df.columns:
        return AnomalyResult(False, "info", 0, f"Column '{col}' not found", {})

    values = pd.to_numeric(df[col], errors="coerce").dropna()
    if len(values) < 4:
        return AnomalyResult(False, "info", 0, "Not enough data for baseline", {})

    current_value = float(values.iloc[-1])
    historical = values.iloc[:-1]

    methods = config.get("detection_methods", ["iqr"])
    time_adjusted = config.get("time_adjusted", False)
    check_lower = config.get("check_lower", True)
    check_upper = config.get("check_upper", True)

    # Compute statistics
    q1 = float(historical.quantile(0.25))
    q3 = float(historical.quantile(0.75))
    iqr = q3 - q1
    median = float(historical.median())
    mean = float(historical.mean())
    std = float(historical.std())

    # Time adjustment
    time_factor = 1.0
    current_hour = datetime.now().hour
    if time_adjusted:
        time_factor = HOURLY_TIME_FACTORS.get(current_hour, 0.5)

    details = {
        "q1": q1, "q3": q3, "iqr": iqr, "median": median,
        "mean": mean, "std": std, "sample_size": len(historical),
        "time_factor": time_factor, "current_hour": current_hour,
        "methods": methods,
    }

    # Check each method
    worst_severity = "info"
    messages = []

    if "iqr" in methods:
        w_mult = config.get("warning_multiplier_iqr", 1.5)
        c_mult = config.get("critical_multiplier_iqr", 2.5)

        adj_q1 = q1 * time_factor
        adj_q3 = q3 * time_factor
        adj_iqr = iqr * time_factor

        w_lower = adj_q1 - w_mult * adj_iqr
        w_upper = adj_q3 + w_mult * adj_iqr
        c_lower = adj_q1 - c_mult * adj_iqr
        c_upper = adj_q3 + c_mult * adj_iqr

        details["iqr_warning_range"] = [w_lower, w_upper]
        details["iqr_critical_range"] = [c_lower, c_upper]

        if check_lower and current_value < c_lower:
            worst_severity = "critical"
            messages.append(f"IQR: value {current_value:.2f} below critical lower bound {c_lower:.2f}")
        elif check_upper and current_value > c_upper:
            worst_severity = "critical"
            messages.append(f"IQR: value {current_value:.2f} above critical upper bound {c_upper:.2f}")
        elif check_lower and current_value < w_lower:
            worst_severity = max(worst_severity, "warning", key=_sev_order)
            messages.append(f"IQR: value {current_value:.2f} below warning lower bound {w_lower:.2f}")
        elif check_upper and current_value > w_upper:
            worst_severity = max(worst_severity, "warning", key=_sev_order)
            messages.append(f"IQR: value {current_value:.2f} above warning upper bound {w_upper:.2f}")

    if "3sigma" in methods:
        w_mult = config.get("warning_multiplier_sigma", 2.0)
        c_mult = config.get("critical_multiplier_sigma", 3.0)

        adj_mean = mean * time_factor
        adj_std = std * time_factor

        w_lower = adj_mean - w_mult * adj_std
        w_upper = adj_mean + w_mult * adj_std
        c_lower = adj_mean - c_mult * adj_std
        c_upper = adj_mean + c_mult * adj_std

        details["sigma_warning_range"] = [w_lower, w_upper]
        details["sigma_critical_range"] = [c_lower, c_upper]

        if check_lower and current_value < c_lower:
            worst_severity = "critical"
            messages.append(f"3σ: value {current_value:.2f} below critical lower bound {c_lower:.2f}")
        elif check_upper and current_value > c_upper:
            worst_severity = "critical"
            messages.append(f"3σ: value {current_value:.2f} above critical upper bound {c_upper:.2f}")
        elif check_lower and current_value < w_lower:
            worst_severity = max(worst_severity, "warning", key=_sev_order)
            messages.append(f"3σ: value {current_value:.2f} below warning lower bound {w_lower:.2f}")
        elif check_upper and current_value > w_upper:
            worst_severity = max(worst_severity, "warning", key=_sev_order)
            messages.append(f"3σ: value {current_value:.2f} above warning upper bound {w_upper:.2f}")

    is_anomaly = worst_severity in ("warning", "critical")
    message = "; ".join(messages) if messages else "No anomaly detected"

    return AnomalyResult(
        is_anomaly=is_anomaly,
        severity=worst_severity,
        current_value=current_value,
        message=message,
        details=details,
    )


def _sev_order(s: str) -> int:
    return {"info": 0, "warning": 1, "critical": 2}.get(s, 0)
