import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Database,
  Network,
  Search,
  ServerCog,
} from "lucide-react";

type Node = {
  id: string;
  kind: string;
  key: string;
  title: string;
  owner?: string;
  tier?: string;
  lifecycle?: string;
  score?: number;
};
type Edge = { id: string; source: string; target: string; type: string };
type Service = { name: string };

const kindIcon = (kind: string) =>
  kind === "service" ? ServerCog : kind === "system" ? Boxes : Database;

export function ResourceGraph({
  services,
  openService,
}: {
  services: Service[];
  openService: (service: any) => void;
}) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/graph")
      .then(async (response) => {
        if (!response.ok)
          throw new Error("The catalog graph could not be loaded");
        return response.json();
      })
      .then((data) => {
        setNodes(data.nodes || []);
        setEdges(data.edges || []);
        setSelected((current) => current || data.nodes?.[0]?.id || "");
      })
      .catch((cause) => setError((cause as Error).message));
  }, []);
  const selectedNode = nodes.find((node) => node.id === selected);
  const relationships = edges.filter(
    (edge) => edge.source === selected || edge.target === selected,
  );
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return nodes;
    const direct = new Set(
      nodes
        .filter((node) =>
          `${node.title} ${node.kind} ${node.owner || ""}`
            .toLowerCase()
            .includes(needle),
        )
        .map((node) => node.id),
    );
    edges.forEach((edge) => {
      if (direct.has(edge.source)) direct.add(edge.target);
      if (direct.has(edge.target)) direct.add(edge.source);
    });
    return nodes.filter((node) => direct.has(node.id));
  }, [nodes, edges, query]);
  const kinds = [...new Set(visible.map((node) => node.kind))];
  const positions = new Map<string, { x: number; y: number }>();
  const width = 780;
  const largestColumn = Math.max(
    1,
    ...kinds.map((kind) => visible.filter((node) => node.kind === kind).length),
  );
  const height = Math.max(360, largestColumn * 96 + 112);
  kinds.forEach((kind, column) => {
    const columnNodes = visible.filter((node) => node.kind === kind);
    const x =
      kinds.length === 1
        ? width / 2
        : 142 + column * ((width - 284) / (kinds.length - 1));
    const columnHeight = (columnNodes.length - 1) * 96;
    columnNodes.forEach((node, row) =>
      positions.set(node.id, {
        x,
        y: height / 2 - columnHeight / 2 + row * 96 + 18,
      }),
    );
  });
  return (
    <div className="page graph-page">
      <section className="page-intro graph-intro">
        <div>
          <p className="eyebrow">SOFTWARE MAP</p>
          <h1>Follow impact, not inventory</h1>
          <p>
            Trace services through systems, APIs, and infrastructure resources.
            Select any node to see what depends on it and what it depends on.
          </p>
        </div>
        <label className="search-box graph-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a service or resource"
          />
        </label>
      </section>
      {error ? (
        <div className="global-error" role="alert">
          <AlertTriangle size={17} /> {error}
        </div>
      ) : !nodes.length ? (
        <section className="record-empty graph-empty">
          <Network size={22} />
          <div>
            <strong>No relationships have been synchronized</strong>
            <p>
              Add <code>dependsOn</code>, <code>providesApis</code>,{" "}
              <code>consumesApis</code>, or <code>resources</code> to service
              metadata.
            </p>
          </div>
        </section>
      ) : (
        <div className="graph-layout">
          <section
            className="graph-canvas"
            aria-label="Catalog relationship map"
          >
            <div className="graph-scroll">
              <svg viewBox={`0 0 ${width} ${height}`} role="img">
                <title>Software catalog relationship graph</title>
                <defs>
                  <marker
                    id="graph-arrow"
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="5"
                    markerHeight="5"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" />
                  </marker>
                </defs>
                {kinds.map((kind, column) => (
                  <text
                    className="graph-column-label"
                    x={
                      kinds.length === 1
                        ? width / 2
                        : 142 + column * ((width - 284) / (kinds.length - 1))
                    }
                    y="34"
                    textAnchor="middle"
                    key={kind}
                  >
                    {kind.toUpperCase()}
                  </text>
                ))}
                {edges.map((edge) => {
                  const source = positions.get(edge.source);
                  const target = positions.get(edge.target);
                  if (!source || !target) return null;
                  return (
                    <g key={edge.id}>
                      <line
                        className={
                          edge.source === selected || edge.target === selected
                            ? "graph-edge active"
                            : "graph-edge"
                        }
                        x1={source.x}
                        y1={source.y}
                        x2={target.x}
                        y2={target.y}
                        markerEnd="url(#graph-arrow)"
                      />
                      <text
                        className="graph-edge-label"
                        x={(source.x + target.x) / 2}
                        y={(source.y + target.y) / 2 - 6}
                        textAnchor="middle"
                      >
                        {edge.type}
                      </text>
                    </g>
                  );
                })}
                {visible.map((node) => {
                  const point = positions.get(node.id)!;
                  return (
                    <g
                      className={
                        node.id === selected
                          ? "graph-node selected"
                          : "graph-node"
                      }
                      transform={`translate(${point.x - 94} ${point.y - 30})`}
                      onClick={() => setSelected(node.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ")
                          setSelected(node.id);
                      }}
                      key={node.id}
                    >
                      <rect width="188" height="60" rx="5" />
                      <text x="14" y="25">
                        {node.title}
                      </text>
                      <text className="graph-node-meta" x="14" y="45">
                        {node.kind === "service"
                          ? node.owner || "No owner"
                          : node.kind}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </section>
          <aside className="graph-inspector">
            {selectedNode && (
              <>
                <div className="graph-inspector-title">
                  {(() => {
                    const Icon = kindIcon(selectedNode.kind);
                    return <Icon size={19} />;
                  })()}
                  <div>
                    <span>{selectedNode.kind}</span>
                    <h2>{selectedNode.title}</h2>
                  </div>
                </div>
                {selectedNode.kind === "service" && (
                  <dl>
                    <div>
                      <dt>Owner</dt>
                      <dd>{selectedNode.owner || "Unassigned"}</dd>
                    </div>
                    <div>
                      <dt>Tier</dt>
                      <dd>{selectedNode.tier || "Unclassified"}</dd>
                    </div>
                    <div>
                      <dt>Standards</dt>
                      <dd>{selectedNode.score ?? 0}%</dd>
                    </div>
                  </dl>
                )}
                <h3>Impact paths</h3>
                <div className="graph-relations">
                  {relationships.map((edge) => {
                    const outbound = edge.source === selectedNode.id;
                    const other = nodes.find(
                      (node) =>
                        node.id === (outbound ? edge.target : edge.source),
                    );
                    return (
                      <button
                        onClick={() => other && setSelected(other.id)}
                        key={edge.id}
                      >
                        <span>
                          {outbound ? edge.type : `used by · ${edge.type}`}
                        </span>
                        <strong>{other?.title || "Unknown"}</strong>
                        <ArrowRight size={13} />
                      </button>
                    );
                  })}
                  {!relationships.length && <p>No connected entities.</p>}
                </div>
                {selectedNode.kind === "service" && (
                  <button
                    className="primary-button graph-open-service"
                    onClick={() => {
                      const service = services.find(
                        (candidate) => candidate.name === selectedNode.key,
                      );
                      if (service) openService(service);
                    }}
                  >
                    Open service dossier <ArrowRight size={14} />
                  </button>
                )}
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
