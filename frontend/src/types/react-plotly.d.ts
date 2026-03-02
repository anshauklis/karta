declare module "react-plotly.js" {
  import { Component } from "react";

  /** Plotly figure object containing data, layout, and frames */
  interface PlotlyFigure {
    data: Record<string, unknown>[];
    layout: Record<string, unknown>;
    frames?: Record<string, unknown>[];
  }

  /** Plotly event object passed to click/hover/select callbacks */
  interface PlotlyEvent {
    points: Array<{
      x?: unknown;
      y?: unknown;
      z?: unknown;
      label?: string;
      text?: string;
      data?: Record<string, unknown>;
      pointIndex?: number;
      curveNumber?: number;
    }>;
    event?: MouseEvent;
  }

  interface PlotParams {
    data: Record<string, unknown>[];
    layout?: Record<string, unknown>;
    config?: Record<string, unknown>;
    frames?: Record<string, unknown>[];
    useResizeHandler?: boolean;
    style?: React.CSSProperties;
    className?: string;
    onInitialized?: (figure: PlotlyFigure, graphDiv: HTMLElement) => void;
    onUpdate?: (figure: PlotlyFigure, graphDiv: HTMLElement) => void;
    onPurge?: (figure: PlotlyFigure, graphDiv: HTMLElement) => void;
    onError?: (err: Error) => void;
    onClick?: (event: PlotlyEvent) => void;
    onHover?: (event: PlotlyEvent) => void;
    onUnhover?: (event: PlotlyEvent) => void;
    onSelected?: (event: PlotlyEvent | null) => void;
    onRelayout?: (update: Record<string, unknown>) => void;
    onRestyle?: (update: Record<string, unknown>) => void;
    onRedraw?: () => void;
    onAnimated?: () => void;
    revision?: number;
    divId?: string;
  }

  class Plot extends Component<PlotParams> {}
  export default Plot;
}

declare module "react-plotly.js/factory" {
  import Plot from "react-plotly.js";
  function createPlotlyComponent(plotly: unknown): typeof Plot;
  export default createPlotlyComponent;
}
