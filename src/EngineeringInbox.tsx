import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  GitPullRequest,
  PackageCheck,
  Rocket,
  ShieldAlert,
  Users,
  Workflow,
} from "lucide-react";
import { useMemo, useState } from "react";

type Attention = {
  id: string;
  severity: "urgent" | "warning" | "info";
  category: string;
  title: string;
  body: string;
  service?: any;
  icon: typeof AlertTriangle;
};

export function EngineeringInbox({
  services,
  teams,
  activity,
  openService,
}: {
  services: any[];
  teams: any[];
  activity: any[];
  openService: (service: any) => void;
}) {
  const [category, setCategory] = useState("all");
  const items = useMemo<Attention[]>(() => {
    const result: Attention[] = [];
    for (const service of services) {
      const plugins = service.plugins || {};
      const security = plugins["github-security"];
      const prs = plugins["github-pull-requests"];
      const actions = plugins["github-actions"];
      const standards = plugins["github-repository-standards"];
      const deployments = plugins["github-deployments"];
      const maintenance = plugins["github-maintenance"];
      if (security?.criticalAlerts)
        result.push({
          id: `security-${service.name}`,
          severity: "urgent",
          category: "Security",
          title: `${service.name} has ${security.criticalAlerts} high-priority security alert${security.criticalAlerts === 1 ? "" : "s"}`,
          body: `${security.openAlerts} total security alerts are open.`,
          service,
          icon: ShieldAlert,
        });
      if (actions?.runs?.[0]?.conclusion === "failure")
        result.push({
          id: `actions-${service.name}`,
          severity: "urgent",
          category: "Delivery",
          title: `${service.name} latest workflow failed`,
          body: actions.runs[0].name,
          service,
          icon: Workflow,
        });
      if (
        deployments?.latestDeploymentState &&
        ["failure", "error", "inactive"].includes(
          deployments.latestDeploymentState,
        )
      )
        result.push({
          id: `deploy-${service.name}`,
          severity: "urgent",
          category: "Delivery",
          title: `${service.name} latest deployment is ${deployments.latestDeploymentState}`,
          body: "Open the service dossier for the deployment link and environment.",
          service,
          icon: Rocket,
        });
      if (prs?.staleCount)
        result.push({
          id: `prs-${service.name}`,
          severity: "warning",
          category: "Collaboration",
          title: `${service.name} has ${prs.staleCount} stale pull request${prs.staleCount === 1 ? "" : "s"}`,
          body: `${prs.waitingForReview} currently waiting for review.`,
          service,
          icon: GitPullRequest,
        });
      if (standards && standards.coverage < 75)
        result.push({
          id: `standards-${service.name}`,
          severity: "warning",
          category: "Standards",
          title: `${service.name} repository standards are ${standards.coverage}% complete`,
          body: "Review missing repository safeguards and community files.",
          service,
          icon: PackageCheck,
        });
      if (service.score < 100)
        result.push({
          id: `score-${service.name}`,
          severity: service.score < 60 ? "urgent" : "warning",
          category: "Standards",
          title: `${service.name} scores ${service.score}/100`,
          body: "One or more applicable engineering standards need attention.",
          service,
          icon: AlertTriangle,
        });
      if (!service.tier || !service.service_type)
        result.push({
          id: `classification-${service.name}`,
          severity: "info",
          category: "Catalog",
          title: `${service.name} is missing classification`,
          body: `Add ${!service.tier ? "spec.tier" : ""}${!service.tier && !service.service_type ? " and " : ""}${!service.service_type ? "spec.type" : ""} to .portal/service.yaml.`,
          service,
          icon: PackageCheck,
        });
      if (maintenance?.daysSinceCommit > 90)
        result.push({
          id: `maintenance-${service.name}`,
          severity: "info",
          category: "Maintenance",
          title: `${service.name} has had no commit for ${maintenance.daysSinceCommit} days`,
          body: "Confirm whether the service is maintained or should be archived.",
          service,
          icon: AlertTriangle,
        });
    }
    for (const team of teams)
      if (!team.member_count)
        result.push({
          id: `team-${team.name}`,
          severity: "warning",
          category: "Ownership",
          title: `${team.title} has no members`,
          body: `${team.service_count} service${team.service_count === 1 ? " is" : "s are"} assigned to this team.`,
          icon: Users,
        });
    for (const run of activity) {
      for (const entry of run.results || [])
        if (entry.status === "invalid")
          result.push({
            id: `sync-${run.created_at}-${entry.repository}`,
            severity: "urgent",
            category: "Catalog",
            title: `${entry.repository} metadata is invalid`,
            body:
              entry.error ||
              "Validate .portal/service.yaml against the catalog contract.",
            icon: PackageCheck,
          });
    }
    return result.sort(
      (a, b) =>
        ({ urgent: 0, warning: 1, info: 2 })[a.severity] -
        { urgent: 0, warning: 1, info: 2 }[b.severity],
    );
  }, [services, teams, activity]);
  const categories = ["all", ...new Set(items.map((item) => item.category))];
  const visible =
    category === "all"
      ? items
      : items.filter((item) => item.category === category);
  const urgent = items.filter((item) => item.severity === "urgent").length;
  return (
    <div className="page inbox-page">
      <div className="page-intro">
        <div>
          <p className="eyebrow">ATTENTION QUEUE</p>
          <h1>Engineering inbox</h1>
          <p>
            One place for delivery, security, ownership, catalog, and standards
            work.
          </p>
        </div>
        <div className={urgent ? "inbox-pulse urgent" : "inbox-pulse"}>
          <strong>{urgent}</strong>
          <span>urgent</span>
        </div>
      </div>
      <div className="inbox-summary">
        <div>
          <strong>{items.length}</strong>
          <span>Open signals</span>
        </div>
        <div>
          <strong>{services.length}</strong>
          <span>Services watched</span>
        </div>
        <div>
          <strong>
            {items.filter((item) => item.category === "Ownership").length}
          </strong>
          <span>Ownership gaps</span>
        </div>
      </div>
      <div className="inbox-filters" aria-label="Filter attention queue">
        {categories.map((value) => (
          <button
            className={category === value ? "active" : ""}
            onClick={() => setCategory(value)}
            key={value}
          >
            {value === "all" ? "All work" : value}
            <span>
              {value === "all"
                ? items.length
                : items.filter((item) => item.category === value).length}
            </span>
          </button>
        ))}
      </div>
      {visible.length ? (
        <div className="attention-list">
          {visible.map((item) => {
            const Icon = item.icon;
            return (
              <article
                className={`attention-row ${item.severity}`}
                key={item.id}
              >
                <span className="attention-icon">
                  <Icon size={17} />
                </span>
                <div>
                  <span className="attention-meta">
                    {item.severity} · {item.category}
                  </span>
                  <h2>{item.title}</h2>
                  <p>{item.body}</p>
                </div>
                {item.service && (
                  <button onClick={() => openService(item.service)}>
                    Open service <ArrowRight size={14} />
                  </button>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="inbox-clear">
          <CheckCircle2 size={28} />
          <h2>Nothing needs attention</h2>
          <p>This view will update as catalog and GitHub signals change.</p>
        </div>
      )}
    </div>
  );
}
