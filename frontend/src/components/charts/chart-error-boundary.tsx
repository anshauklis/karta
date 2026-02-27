"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  chartTitle?: string;
  onRetry?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary that wraps individual chart cards on the dashboard.
 * Prevents a single chart crash from taking down the entire dashboard.
 */
export class ChartErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(
      `[ChartErrorBoundary] ${this.props.chartTitle ?? "Chart"} crashed:`,
      error,
      info.componentStack
    );
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-border bg-card p-4">
          <AlertTriangle className="h-8 w-8 text-red-400" />
          <p className="text-center text-sm font-medium text-foreground">
            {this.props.chartTitle
              ? `"${this.props.chartTitle}" failed to render`
              : "Chart failed to render"}
          </p>
          <p className="text-center text-xs text-muted-foreground max-w-xs">
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs mt-1"
            onClick={this.handleReset}
          >
            <RefreshCw className="mr-1 h-3 w-3" />
            Retry
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
