"use client";

import { useCallback, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  ReactFlowProvider,
  type Node,
  type Edge,
  type ReactFlowInstance,
  Position,
  type NodeProps,
  Handle,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import { useLineage } from "@/hooks/use-lineage";
import { Skeleton } from "@/components/ui/skeleton";
import {
  GitBranch,
  Database,
  BarChart3,
  LayoutDashboard,
  FileSpreadsheet,
  FileText,
  Bell,
} from "lucide-react";
import type { LineageNode, LineageEdge } from "@/types";

/* ------------------------------------------------------------------ */
/*  Type styles                                                       */
/* ------------------------------------------------------------------ */

const TYPE_STYLES: Record<
  string,
  { color: string; bg: string; border: string; icon: typeof Database }
> = {
  connection: { color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", icon: Database },
  chart: { color: "text-green-700", bg: "bg-green-50", border: "border-green-200", icon: BarChart3 },
  dashboard: { color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200", icon: LayoutDashboard },
  dataset: { color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200", icon: FileSpreadsheet },
  report: { color: "text-cyan-700", bg: "bg-cyan-50", border: "border-cyan-200", icon: FileText },
  alert: { color: "text-red-700", bg: "bg-red-50", border: "border-red-200", icon: Bell },
};

const TYPE_ORDER = ["connection", "dataset", "chart", "dashboard", "report", "alert"];

/* ------------------------------------------------------------------ */
/*  Dagre layout                                                      */
/* ------------------------------------------------------------------ */

const NODE_WIDTH = 200;
const NODE_HEIGHT = 50;

function layoutGraph(
  apiNodes: LineageNode[],
  apiEdges: LineageEdge[],
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 50, ranksep: 120 });

  for (const node of apiNodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of apiEdges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const nodes: Node[] = apiNodes.map((node) => {
    const pos = g.node(node.id);
    return {
      id: node.id,
      type: "lineageNode",
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      data: {
        label: node.name,
        entityType: node.type,
        meta: node.meta,
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
  });

  const edges: Edge[] = apiEdges.map((edge, i) => ({
    id: `e-${edge.source}-${edge.target}-${i}`,
    source: edge.source,
    target: edge.target,
    type: "smoothstep",
    animated: false,
  }));

  return { nodes, edges };
}

/* ------------------------------------------------------------------ */
/*  Custom node component                                             */
/* ------------------------------------------------------------------ */

function LineageNodeComponent({ data }: NodeProps) {
  const entityType = data.entityType as string;
  const style = TYPE_STYLES[entityType] || TYPE_STYLES.connection;
  const Icon = style.icon;
  const label = data.label as string;

  return (
    <>
      <Handle type="target" position={Position.Left} className="!bg-slate-400" />
      <div
        className={`flex items-center gap-2 rounded-md border px-3 py-2 shadow-sm cursor-pointer ${style.bg} ${style.border}`}
        style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
      >
        <Icon className={`h-4 w-4 shrink-0 ${style.color}`} />
        <span className={`truncate text-sm font-medium ${style.color}`}>{label}</span>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-slate-400" />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Node types — defined outside component to avoid re-registration   */
/* ------------------------------------------------------------------ */

const nodeTypes = { lineageNode: LineageNodeComponent };

/* ------------------------------------------------------------------ */
/*  Inner flow component (must be inside ReactFlowProvider)           */
/* ------------------------------------------------------------------ */

function LineageFlow() {
  const t = useTranslations("lineage");
  const router = useRouter();
  const { data: lineage, isLoading } = useLineage();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Layout nodes + edges via dagre (stable — only recomputes when data changes)
  const { layoutNodes, layoutEdges } = useMemo(() => {
    if (!lineage) return { layoutNodes: [], layoutEdges: [] };
    const { nodes, edges } = layoutGraph(lineage.nodes, lineage.edges);
    return { layoutNodes: nodes, layoutEdges: edges };
  }, [lineage]);

  // Build adjacency map for hover highlighting
  const adjacencyMap = useMemo(() => {
    if (!lineage) return new Map<string, Set<string>>();
    const map = new Map<string, Set<string>>();
    for (const edge of lineage.edges) {
      if (!map.has(edge.source)) map.set(edge.source, new Set());
      if (!map.has(edge.target)) map.set(edge.target, new Set());
      map.get(edge.source)!.add(edge.target);
      map.get(edge.target)!.add(edge.source);
    }
    return map;
  }, [lineage]);

  // fitView once on init — NOT as a prop (prop re-triggers on every nodes/edges change)
  const onInit = useCallback((instance: ReactFlowInstance) => {
    instance.fitView({ padding: 0.1 });
  }, []);

  // Hover: DOM manipulation instead of React state → zero re-renders, no jank
  const onNodeMouseEnter = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;

      const connected = new Set<string>();
      connected.add(node.id);
      const neighbors = adjacencyMap.get(node.id);
      if (neighbors) for (const n of neighbors) connected.add(n);

      // Dim unconnected nodes
      wrapper.querySelectorAll<HTMLElement>(".react-flow__node").forEach((el) => {
        const nid = el.dataset.id;
        el.style.opacity = nid && connected.has(nid) ? "1" : "0.2";
        el.style.transition = "opacity 0.2s";
      });

      // Dim unconnected edges
      wrapper.querySelectorAll<HTMLElement>(".react-flow__edge").forEach((el) => {
        const src = el.dataset.source;
        const tgt = el.dataset.target;
        el.style.opacity = src && tgt && connected.has(src) && connected.has(tgt) ? "1" : "0.2";
        el.style.transition = "opacity 0.2s";
      });
    },
    [adjacencyMap],
  );

  const onNodeMouseLeave = useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    wrapper.querySelectorAll<HTMLElement>(".react-flow__node, .react-flow__edge").forEach((el) => {
      el.style.opacity = "";
      el.style.transition = "";
    });
  }, []);

  // Click navigation
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const entityType = node.data.entityType as string;
      const meta = (node.data.meta || {}) as { db_id?: number; slug?: string };
      switch (entityType) {
        case "connection":
          router.push("/connections");
          break;
        case "dataset":
          router.push("/datasets");
          break;
        case "chart":
          if (meta.db_id) router.push(`/charts/${meta.db_id}`);
          else router.push("/charts");
          break;
        case "dashboard":
          if (meta.slug) router.push(`/dashboard/${meta.slug}`);
          else router.push("/");
          break;
        case "report":
          router.push("/reports");
          break;
        case "alert":
          router.push("/alerts");
          break;
      }
    },
    [router],
  );

  // Group counts for legend
  const groups = useMemo(() => {
    if (!lineage) return {} as Record<string, number>;
    const counts: Record<string, number> = {};
    for (const node of lineage.nodes) {
      counts[node.type] = (counts[node.type] || 0) + 1;
    }
    return counts;
  }, [lineage]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-7 w-48 rounded" />
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  if (!lineage) return null;

  return (
    <div className="space-y-4">
      {/* Title */}
      <div className="flex items-center gap-3">
        <GitBranch className="h-6 w-6 text-blue-600" />
        <h1 className="text-xl font-semibold text-slate-900">{t("title")}</h1>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {TYPE_ORDER.map((type) => {
          const style = TYPE_STYLES[type];
          if (!style) return null;
          const Icon = style.icon;
          return (
            <div key={type} className="flex items-center gap-1.5 text-xs">
              <div className={`rounded p-1 ${style.bg} border ${style.border}`}>
                <Icon className={`h-3 w-3 ${style.color}`} />
              </div>
              <span className="text-slate-600">
                {t(`typeLabels.${type}`)} ({groups[type] || 0})
              </span>
            </div>
          );
        })}
      </div>

      {/* Stats */}
      <div className="flex gap-4 text-sm text-slate-500">
        <span>{t("entityCount", { count: lineage.nodes.length })}</span>
        <span>{t("connectionCount", { count: lineage.edges.length })}</span>
      </div>

      {/* React Flow DAG */}
      <div ref={wrapperRef} className="h-[calc(100vh-8rem)] rounded-lg border bg-white">
        <ReactFlow
          nodes={layoutNodes}
          edges={layoutEdges}
          nodeTypes={nodeTypes}
          onInit={onInit}
          onNodeClick={onNodeClick}
          onNodeMouseEnter={onNodeMouseEnter}
          onNodeMouseLeave={onNodeMouseLeave}
          minZoom={0.3}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <MiniMap
            nodeColor={(node) => {
              const colors: Record<string, string> = {
                connection: "#dbeafe",
                dataset: "#fff7ed",
                chart: "#f0fdf4",
                dashboard: "#faf5ff",
                report: "#ecfeff",
                alert: "#fef2f2",
              };
              return colors[(node.data as Record<string, unknown>).entityType as string] || "#e2e8f0";
            }}
          />
          <Controls />
          <Background variant={BackgroundVariant.Dots} />
        </ReactFlow>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Exported page — wraps flow in provider                            */
/* ------------------------------------------------------------------ */

export default function LineagePage() {
  return (
    <ReactFlowProvider>
      <LineageFlow />
    </ReactFlowProvider>
  );
}
