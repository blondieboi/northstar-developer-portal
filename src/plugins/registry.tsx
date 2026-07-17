import {
  Activity,
  AlertTriangle,
  Check,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  PackageCheck,
  Rocket,
  ShieldAlert,
  Workflow,
  X,
} from "lucide-react";
import type { ComponentType } from "react";

export type PublicPlugin = {
  id: string;
  title: string;
  description: string;
  version: string;
  surfaces: string[];
  defaultScorecards?: Array<{ id: string; title: string }>;
  enabled: boolean;
  config: Record<string, unknown>;
  health: {
    status: "disabled" | "ready" | "stale" | "degraded";
    message: string;
    observedAt?: string | null;
  };
};
type ServicePluginProps = { data: any };

function Waiting({ icon: Icon = Workflow }: { icon?: typeof Workflow }) {
  return (
    <div className="record-empty">
      <Icon size={18} />
      <div>
        <strong>Waiting for GitHub data</strong>
        <p>
          Refresh integrations after confirming that the GitHub App can access
          this repository.
        </p>
      </div>
    </div>
  );
}
function Metrics({
  items,
}: {
  items: Array<{ value: string | number; label: string }>;
}) {
  return (
    <div className="workflow-summary plugin-metrics">
      {items.map((item) => (
        <div key={item.label}>
          <strong>{item.value}</strong>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}
function Section({
  eyebrow,
  title,
  rate,
  children,
}: {
  eyebrow: string;
  title: string;
  rate?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="record-section plugin-service-section">
      <div className="record-section-head">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        {rate && <span className="plugin-rate">{rate}</span>}
      </div>
      {children}
    </section>
  );
}

function GitHubActionsServicePanel({ data }: ServicePluginProps) {
  return (
    <Section
      eyebrow="GITHUB ACTIONS"
      title="Workflow activity"
      rate={
        data &&
        (data.successRate === null
          ? "No completed runs"
          : `${data.successRate}% successful`)
      }
    >
      {!data ? (
        <Waiting />
      ) : (
        <>
          <Metrics
            items={[
              { value: data.totalRuns, label: "Runs in lookback window" },
              { value: data.workflows?.length || 0, label: "Active workflows" },
              {
                value: data.medianDurationMinutes === null ? "—" : `${data.medianDurationMinutes}m`,
                label: "Median duration",
              },
              {
                value: data.lastSuccessfulRunAt
                  ? new Date(data.lastSuccessfulRunAt).toLocaleDateString()
                  : "—",
                label: "Last successful run",
              },
            ]}
          />
          {data.failureStreak > 0 && (
            <div className="plugin-attention-note">
              <X size={13} /> {data.failureStreak} consecutive failed run{data.failureStreak === 1 ? "" : "s"}
            </div>
          )}
          {data.runs?.length ? (
            <div className="workflow-runs">
              {data.runs.slice(0, 6).map((run: any) => (
                <a href={run.url} target="_blank" rel="noopener" key={run.id}>
                  <span
                    className={`workflow-conclusion ${run.conclusion || run.status}`}
                  >
                    {run.conclusion === "success" ? (
                      <Check size={14} />
                    ) : run.conclusion === "failure" ? (
                      <X size={14} />
                    ) : (
                      <Activity size={14} />
                    )}
                  </span>
                  <span>
                    <strong>{run.name}</strong>
                    <small>
                      <GitBranch size={12} />
                      {run.branch || "detached"} · {run.event}
                    </small>
                  </span>
                  <em>{run.conclusion || run.status}</em>
                  <time>{new Date(run.updatedAt).toLocaleString()}</time>
                  <ExternalLink size={14} />
                </a>
              ))}
            </div>
          ) : (
            <Waiting />
          )}
        </>
      )}
    </Section>
  );
}

function PullRequestsPanel({ data }: ServicePluginProps) {
  return (
    <Section
      eyebrow="COLLABORATION"
      title="Pull request queue"
      rate={data && `${data.waitingForReview} waiting for review`}
    >
      {!data ? (
        <Waiting icon={GitPullRequest} />
      ) : (
        <>
          <Metrics
            items={[
              { value: data.openCount, label: "Open pull requests" },
              { value: data.staleCount, label: "Stale pull requests" },
              { value: data.oldestAgeDays ?? "—", label: "Oldest age in days" },
            ]}
          />
          {data.pullRequests?.length ? (
            <div className="plugin-ledger">
              {data.pullRequests.slice(0, 6).map((pr: any) => (
                <a href={pr.url} target="_blank" rel="noopener" key={pr.number}>
                  <GitPullRequest size={16} />
                  <span>
                    <strong>
                      #{pr.number} {pr.title}
                    </strong>
                    <small>
                      {pr.author ? `@${pr.author}` : "Unknown author"} ·{" "}
                      {pr.draft
                        ? "Draft"
                        : pr.reviewRequested
                          ? "Review requested"
                          : "Open"}{" "}
                      · {pr.ageDays}d old
                    </small>
                  </span>
                  <ExternalLink size={14} />
                </a>
              ))}
            </div>
          ) : (
            <div className="record-empty">
              <Check size={18} />
              <div>
                <strong>Pull request queue is clear</strong>
                <p>No open pull requests were returned for this repository.</p>
              </div>
            </div>
          )}
        </>
      )}
    </Section>
  );
}

function StandardsPanel({ data }: ServicePluginProps) {
  const labels: Record<string, string> = {
    codeowners: "CODEOWNERS",
    readme: "README",
    contributing: "Contributing guide",
    securityPolicy: "Security policy",
    branchProtection: "Branch protection",
    issuesEnabled: "Issues enabled",
    description: "Repository description",
    topics: "Repository topics",
  };
  return (
    <Section
      eyebrow="REPOSITORY"
      title="Repository standards"
      rate={data && `${data.coverage}% covered`}
    >
      {!data ? (
        <Waiting icon={PackageCheck} />
      ) : (
        <>
          <Metrics
            items={[
              {
                value: `${data.passed}/${data.total}`,
                label: "Standards present",
              },
              { value: data.defaultBranch, label: "Default branch" },
              { value: data.visibility, label: "Visibility" },
            ]}
          />
          <div className="standards-grid">
            {Object.entries(data.checks || {}).map(([key, value]) => (
              <div className={value ? "pass" : "warn"} key={key}>
                {value ? <Check size={15} /> : <X size={15} />}
                <span>{labels[key] || key}</span>
              </div>
            ))}
          </div>
          {(data.governanceSource || data.codeownersErrors?.length > 0) && (
            <div className="repository-governance-detail">
              {data.governanceSource && (
                <p>
                  Default-branch governance: <strong>{data.governanceSource}</strong>
                  {data.activeRules?.length
                    ? ` · ${data.activeRules.length} active rules`
                    : ""}
                </p>
              )}
              {data.codeownersErrors?.map((error: any, index: number) => (
                <p className="warn" key={`${error.line}-${index}`}>
                  CODEOWNERS line {error.line}: {error.message}
                </p>
              ))}
            </div>
          )}
        </>
      )}
    </Section>
  );
}

function DeploymentsPanel({ data }: ServicePluginProps) {
  return (
    <Section
      eyebrow="DELIVERY"
      title="Deployments and releases"
      rate={data?.latestDeploymentState || undefined}
    >
      {!data ? (
        <Waiting icon={Rocket} />
      ) : (
        <>
          <Metrics
            items={[
              { value: data.totalDeployments, label: "Recent deployments" },
              {
                value: data.successfulDeployments,
                label: "Successful deployments",
              },
              {
                value: data.latestRelease?.tag || "—",
                label: "Latest release",
              },
            ]}
          />
          {data.deployments?.length ? (
            <div className="plugin-ledger">
              {data.deployments.slice(0, 5).map((deployment: any) => (
                <a
                  href={deployment.url}
                  target="_blank"
                  rel="noopener"
                  key={deployment.id}
                >
                  <Rocket size={16} />
                  <span>
                    <strong>{deployment.environment}</strong>
                    <small>
                      {deployment.ref} · {deployment.state} ·{" "}
                      {new Date(deployment.createdAt).toLocaleString()}
                    </small>
                  </span>
                  <ExternalLink size={14} />
                </a>
              ))}
            </div>
          ) : (
            <div className="record-empty">
              <Rocket size={18} />
              <div>
                <strong>No deployments reported</strong>
                <p>
                  {data.deploymentsReason ||
                    "GitHub has no recent deployments for this repository."}
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </Section>
  );
}

function SecurityPanel({ data }: ServicePluginProps) {
  const signals = [
    ["Dependabot", data?.dependabot],
    ["Code scanning", data?.codeScanning],
    ["Secret scanning", data?.secretScanning],
  ];
  return (
    <Section
      eyebrow="SECURITY"
      title="Security posture"
      rate={data && `${data.openAlerts} open alerts`}
    >
      {!data ? (
        <Waiting icon={ShieldAlert} />
      ) : (
        <>
          <Metrics
            items={[
              { value: data.openAlerts, label: "Open alerts" },
              { value: data.criticalAlerts, label: "High-priority alerts" },
              { value: `${data.coverage}/3`, label: "Signals available" },
            ]}
          />
          <div className="security-signals">
            {signals.map(([label, signal]: any) => (
              <div
                className={
                  !signal.available
                    ? "unavailable"
                    : signal.count
                      ? "warn"
                      : "pass"
                }
                key={label}
              >
                <span>
                  {signal.available ? (
                    signal.count ? (
                      <AlertTriangle size={15} />
                    ) : (
                      <Check size={15} />
                    )
                  ) : (
                    <X size={15} />
                  )}
                </span>
                <p>
                  <strong>{label}</strong>
                  <small>
                    {signal.available ? `${signal.count} open` : signal.reason}
                  </small>
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </Section>
  );
}

function MaintenancePanel({ data }: ServicePluginProps) {
  return (
    <Section
      eyebrow="MAINTENANCE"
      title="Repository activity"
      rate={
        data?.daysSinceCommit === null
          ? undefined
          : `Last commit ${data?.daysSinceCommit}d ago`
      }
    >
      {!data ? (
        <Waiting icon={Activity} />
      ) : (
        <>
          <Metrics
            items={[
              { value: data.openIssues, label: "Open issues sampled" },
              { value: data.staleIssues, label: "Stale issues" },
              {
                value: data.activeContributors ?? "—",
                label: "Active contributors",
              },
            ]}
          />
          {data.issues?.length ? (
            <div className="plugin-ledger">
              {data.issues.slice(0, 5).map((issue: any) => (
                <a
                  href={issue.url}
                  target="_blank"
                  rel="noopener"
                  key={issue.number}
                >
                  <AlertTriangle size={16} />
                  <span>
                    <strong>
                      #{issue.number} {issue.title}
                    </strong>
                    <small>
                      {issue.ageDays}d old · updated {issue.updatedDays}d ago
                    </small>
                  </span>
                  <ExternalLink size={14} />
                </a>
              ))}
            </div>
          ) : (
            <div className="record-empty">
              <Check size={18} />
              <div>
                <strong>Issue queue is clear</strong>
                <p>No open issues were returned for this repository.</p>
              </div>
            </div>
          )}
        </>
      )}
    </Section>
  );
}

const serviceSurfaces: Record<string, ComponentType<ServicePluginProps>> = {
  "github-actions": GitHubActionsServicePanel,
  "github-pull-requests": PullRequestsPanel,
  "github-repository-standards": StandardsPanel,
  "github-deployments": DeploymentsPanel,
  "github-security": SecurityPanel,
  "github-maintenance": MaintenancePanel,
};

export function PluginServiceSections({
  plugins,
  states = {},
  enabled,
}: {
  plugins: Record<string, unknown>;
  states?: Record<string, any>;
  enabled: PublicPlugin[];
}) {
  return (
    <>
      {enabled
        .filter(
          (plugin) => plugin.enabled && plugin.surfaces.includes("service"),
        )
        .map((plugin) => {
          const Component = serviceSurfaces[plugin.id];
          const state = states[plugin.id];
          return Component ? (
            <div className="plugin-surface" key={plugin.id}>
              <Component data={plugins?.[plugin.id]} />
              <div className={`plugin-freshness ${state?.status || "waiting"}`}>
                <span>
                  {state?.status === "degraded"
                    ? "Last refresh failed"
                    : state?.observedAt
                      ? `Observed ${new Date(state.observedAt).toLocaleString()}`
                      : "Waiting for first refresh"}
                </span>
                {state?.error && <small>{state.error}</small>}
              </div>
            </div>
          ) : null;
        })}
    </>
  );
}
