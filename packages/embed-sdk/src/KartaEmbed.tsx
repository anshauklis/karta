import {
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
} from "react";
import { createKartaEmbed } from "./core";
import type {
  KartaEmbedInstance,
  KartaTheme,
  KartaReadyEvent,
  KartaErrorEvent,
  KartaChartClickEvent,
  KartaFilterChangeEvent,
  KartaThemeChangeEvent,
  KartaEmbedType,
} from "./types";

/** Props for the KartaEmbed React component */
export interface KartaEmbedProps {
  /** Base URL of the Karta instance */
  baseUrl: string;
  /** Share token */
  token: string;
  /** Type of content. Default: "dashboard" */
  type?: KartaEmbedType;
  /** Theme. Default: "light" */
  theme?: KartaTheme;
  /** Filter values */
  filters?: Record<string, string>;
  /** Height in px. Default: 600 */
  height?: number;
  /** Auto-resize to content */
  autoResize?: boolean;
  /** CSS class for container */
  className?: string;
  onReady?: (event: KartaReadyEvent) => void;
  onError?: (event: KartaErrorEvent) => void;
  onChartClick?: (event: KartaChartClickEvent) => void;
  onFilterChange?: (event: KartaFilterChangeEvent) => void;
  onThemeChange?: (event: KartaThemeChangeEvent) => void;
}

/** Ref handle for imperative control */
export interface KartaEmbedRef {
  setFilters(filters: Record<string, string>): void;
  setTheme(theme: KartaTheme): void;
  refresh(): void;
}

export const KartaEmbed = forwardRef<KartaEmbedRef, KartaEmbedProps>(
  function KartaEmbed(props, ref) {
    const {
      baseUrl,
      token,
      type = "dashboard",
      theme = "light",
      filters,
      height = 600,
      autoResize = false,
      className,
      onReady,
      onError,
      onChartClick,
      onFilterChange,
      onThemeChange,
    } = props;

    const containerRef = useRef<HTMLDivElement>(null);
    const instanceRef = useRef<KartaEmbedInstance | null>(null);

    // Store latest callbacks in refs to avoid re-creating embed
    const callbacksRef = useRef({ onReady, onError, onChartClick, onFilterChange, onThemeChange });
    callbacksRef.current = { onReady, onError, onChartClick, onFilterChange, onThemeChange };

    // Create/recreate embed when key props change
    useEffect(() => {
      if (!containerRef.current) return;

      instanceRef.current?.destroy();

      const instance = createKartaEmbed(containerRef.current, {
        baseUrl,
        token,
        type,
        theme,
        filters,
        height,
        autoResize,
        onReady: (e) => callbacksRef.current.onReady?.(e),
        onError: (e) => callbacksRef.current.onError?.(e),
        onChartClick: (e) => callbacksRef.current.onChartClick?.(e),
        onFilterChange: (e) => callbacksRef.current.onFilterChange?.(e),
        onThemeChange: (e) => callbacksRef.current.onThemeChange?.(e),
      });

      instanceRef.current = instance;

      return () => {
        instance.destroy();
        instanceRef.current = null;
      };
    }, [baseUrl, token, type, theme, JSON.stringify(filters), height, autoResize]);

    useImperativeHandle(ref, () => ({
      setFilters(newFilters: Record<string, string>) {
        instanceRef.current?.setFilters(newFilters);
      },
      setTheme(newTheme: KartaTheme) {
        instanceRef.current?.setTheme(newTheme);
      },
      refresh() {
        instanceRef.current?.refresh();
      },
    }), []);

    return <div ref={containerRef} className={className} />;
  }
);
