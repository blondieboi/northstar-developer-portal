import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BellRing,
  CheckCircle2,
  ExternalLink,
  Gauge,
  LifeBuoy,
  Rocket,
  ShieldAlert,
  WalletCards,
} from "lucide-react";

type Snapshot = {
  onCall?: string | null;
  runbookUrl?: string | null;
  dashboardUrl?: string | null;
  sloUrl?: string | null;
  costUrl?: string | null;
  latestDeploymentState?: string | null;
  openSecurityAlerts?: number | null;
  criticalSecurityAlerts?: number | null;
  openIncidents: number;
  deployments: Array<{
    id: string;
    environment: string;
    state: string;
    createdAt: string;
    url: string;
    ref?: string;
  }>;
  timeline: Array<{
    type: string;
    title: string;
    status: string;
    occurredAt: string;
    url?: string;
  }>;
};

const relative = (value: string) => {
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
  if (days > 0) return `${days}d ago`;
  const hours = Math.floor((Date.now() - new Date(value).getTime()) / 3600000);
  return hours > 0 ? `${hours}h ago` : "Recently";
};

export function ServiceOperations({ serviceName }: { serviceName: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  useEffect(() => {
    fetch(`/api/services/${encodeURIComponent(serviceName)}/operations`)
      .then((response) => (response.ok ? response.json() : null))
      .then(setSnapshot)
      .catch(() => {});
  }, [serviceName]);
  if (!snapshot)
    return (
      <section className="record-section operations-cockpit">
        <div className="record-section-head">
          <div>
            <p className="eyebrow">OPERATIONS</p>
            <h2>Service cockpit</h2>
          </div>
        </div>
        <div className="record-empty">
          <Activity size={18} />
          <div>
            <strong>Operational context is being assembled</strong>
            <p>Refresh GitHub integrations to populate the service timeline.</p>
          </div>
        </div>
      </section>
    );
  const links = [
    [snapshot.runbookUrl, "Runbook", LifeBuoy],
    [snapshot.dashboardUrl, "Dashboard", Gauge],
    [snapshot.sloUrl, "SLOs", Activity],
    [snapshot.costUrl, "Cost", WalletCards],
  ] as const;
  const environments = new Map<string, Snapshot["deployments"][number]>();
  snapshot.deployments.forEach((deployment) => {
    if (!environments.has(deployment.environment))
      environments.set(deployment.environment, deployment);
  });
  return (
    <section className="record-section operations-cockpit">
      <div className="record-section-head">
        <div>
          <p className="eyebrow">OPERATIONS</p>
          <h2>Service cockpit</h2>
          <p>Current state and the changes immediately preceding it</p>
        </div>
        <span
          className={
            snapshot.openIncidents || snapshot.criticalSecurityAlerts
              ? "cockpit-state attention"
              : "cockpit-state"
          }
        >
          {snapshot.openIncidents || snapshot.criticalSecurityAlerts ? (
            <AlertTriangle size={14} />
          ) : (
            <CheckCircle2 size={14} />
          )}
          {snapshot.openIncidents || snapshot.criticalSecurityAlerts
            ? "Attention needed"
            : "No critical signals"}
        </span>
      </div>
      <div className="cockpit-vitals">
        <div>
          <Rocket size={17} />
          <span>
            <strong>{snapshot.latestDeploymentState || "Unknown"}</strong>
            <small>Latest deployment</small>
          </span>
        </div>
        <div>
          <BellRing size={17} />
          <span>
            <strong>{snapshot.openIncidents}</strong>
            <small>Open incidents</small>
          </span>
        </div>
        <div>
          <ShieldAlert size={17} />
          <span>
            <strong>{snapshot.openSecurityAlerts ?? "—"}</strong>
            <small>Security findings</small>
          </span>
        </div>
        <div>
          <LifeBuoy size={17} />
          <span>
            <strong>{snapshot.onCall || "Not declared"}</strong>
            <small>On-call owner</small>
          </span>
        </div>
      </div>
      <div className="cockpit-links">
        {links.map(([url, label, Icon]) =>
          url ? (
            <a href={url} target="_blank" rel="noopener" key={label}>
              <Icon size={15} /> {label} <ExternalLink size={12} />
            </a>
          ) : (
            <span className="missing" key={label}>
              <Icon size={15} /> {label} not declared
            </span>
          ),
        )}
      </div>
      <div className="cockpit-grid">
        <div>
          <h3>Environment state</h3>
          <div className="environment-list">
            {[...environments.values()].map((deployment) => (
              <a
                href={deployment.url}
                target="_blank"
                rel="noopener"
                key={deployment.environment}
              >
                <span className={`environment-state ${deployment.state}`} />
                <span>
                  <strong>{deployment.environment}</strong>
                  <small>
                    {deployment.ref || "default ref"} ·{" "}
                    {relative(deployment.createdAt)}
                  </small>
                </span>
                <em>{deployment.state}</em>
              </a>
            ))}
            {!environments.size && <p>No deployments returned by GitHub.</p>}
          </div>
        </div>
        <div>
          <h3>Change timeline</h3>
          <div className="operations-timeline">
            {snapshot.timeline.slice(0, 10).map((event, index) => (
              <a
                href={event.url || "#"}
                target={event.url ? "_blank" : undefined}
                rel="noopener"
                key={`${event.type}-${event.occurredAt}-${index}`}
              >
                <i />
                <span>
                  <small>{event.type}</small>
                  <strong>{event.title}</strong>
                  <em>
                    {event.status} · {relative(event.occurredAt)}
                  </em>
                </span>
              </a>
            ))}
            {!snapshot.timeline.length && <p>No recent operational events.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
