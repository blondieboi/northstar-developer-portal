import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Check,
  ExternalLink,
  GitPullRequest,
  Megaphone,
  Play,
  RefreshCw,
  ShieldCheck,
  Target,
  Users,
  X,
} from "lucide-react";

const jsonValue = (value: string) => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

async function api(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || `${url} returned ${response.status}`);
  return data;
}

type Campaign = Record<string, any>;

export function CampaignsPage({
  services,
  tiers,
  types,
}: {
  services: any[];
  tiers: any[];
  types: any[];
}) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [waivers, setWaivers] = useState<any[]>([]);
  const [preview, setPreview] = useState<any[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    title: "",
    description: "",
    fieldPath: "spec.tier",
    strategy: "explicit" as "explicit" | "infer",
    desiredValue: "standard",
    owner: "",
    tier: "",
    type: "",
    lifecycle: "",
    service: "",
  });
  const [batchSize, setBatchSize] = useState(10);
  const filters = {
    ...(form.owner ? { owners: [form.owner] } : {}),
    ...(form.tier ? { tiers: [form.tier] } : {}),
    ...(form.type ? { types: [form.type] } : {}),
    ...(form.lifecycle ? { lifecycles: [form.lifecycle] } : {}),
    ...(form.service ? { services: [form.service] } : {}),
  };
  const payload = {
    title: form.title,
    description: form.description,
    fieldPath: form.fieldPath,
    strategy: form.strategy,
    desiredValue: jsonValue(form.desiredValue),
    filters,
  };
  const refresh = () =>
    Promise.all([api("/api/admin/campaigns"), api("/api/admin/waivers")])
      .then(([campaignData, waiverData]) => {
        setCampaigns(campaignData.campaigns || []);
        setWaivers(waiverData.waivers || []);
      })
      .catch((cause) => setError((cause as Error).message));
  useEffect(() => {
    void refresh();
  }, []);
  const loadCampaign = (id: string) => {
    setBusy("load");
    api(`/api/admin/campaigns/${id}`)
      .then((data) => setSelected(data.campaign))
      .catch((cause) => setError((cause as Error).message))
      .finally(() => setBusy(""));
  };
  const runPreview = () => {
    setBusy("preview");
    setError("");
    api("/api/admin/campaigns/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((data) => setPreview(data.targets || []))
      .catch((cause) => setError((cause as Error).message))
      .finally(() => setBusy(""));
  };
  const create = () => {
    setBusy("create");
    setError("");
    api("/api/admin/campaigns", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((data) => {
        setPreview([]);
        refresh();
        return loadCampaign(String(data.campaign.id));
      })
      .catch((cause) => setError((cause as Error).message))
      .finally(() => setBusy(""));
  };
  const launch = () => {
    if (!selected) return;
    setBusy("launch");
    setError("");
    api(`/api/admin/campaigns/${selected.id}/launch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ limit: batchSize }),
    })
      .then(() => {
        refresh();
        loadCampaign(String(selected.id));
      })
      .catch((cause) => setError((cause as Error).message))
      .finally(() => setBusy(""));
  };
  const exclude = async (target: any) => {
    const reason = window.prompt(
      `Why should ${target.service_name} be excluded from this campaign?`,
    );
    if (!reason) return;
    await api(`/api/admin/campaigns/${selected!.id}/targets/${target.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ excluded: true, reason }),
    });
    loadCampaign(String(selected!.id));
  };
  const decide = async (waiver: any, status: "approved" | "rejected") => {
    await api(`/api/admin/waivers/${waiver.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    refresh();
  };
  if (selected)
    return (
      <div className="page campaign-detail">
        <button className="service-back" onClick={() => setSelected(null)}>
          <ArrowLeft size={14} /> All campaigns
        </button>
        <section className="campaign-detail-head">
          <div>
            <p className="eyebrow">METADATA CAMPAIGN #{selected.id}</p>
            <h1>{selected.title}</h1>
            <p>{selected.description || "No campaign description."}</p>
          </div>
          <div className="campaign-detail-actions">
            <span className={`campaign-status ${selected.status}`}>
              {selected.status}
            </span>
            <label className="batch-size">
              Batch
              <input
                type="number"
                min="1"
                max="100"
                value={batchSize}
                onChange={(event) => setBatchSize(Number(event.target.value))}
              />
            </label>
            <button
              className="primary-button"
              disabled={busy === "launch"}
              onClick={launch}
            >
              <Play size={14} />
              {selected.status === "draft"
                ? "Open rollout PRs"
                : "Retry failures"}
            </button>
          </div>
        </section>
        <div className="campaign-progress">
          <span>
            <strong>{selected.completed_count}</strong> merged
          </span>
          <span>
            <strong>{selected.active_count}</strong> open PRs
          </span>
          <span>
            <strong>{selected.failed_count}</strong> failed
          </span>
          <span>
            <strong>{selected.excluded_count}</strong> excluded
          </span>
          <div>
            <i
              style={{
                width: `${selected.target_count ? ((selected.completed_count + selected.excluded_count) / selected.target_count) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
        <section className="campaign-field-summary">
          <span>
            Metadata field <code>{selected.field_path}</code>
          </span>
          <span>
            Desired value <code>{JSON.stringify(selected.desired_value)}</code>
          </span>
          <span>Created by @{selected.created_by}</span>
        </section>
        <div className="campaign-targets">
          {selected.targets?.map((target: any) => (
            <article key={target.id}>
              <span className={`target-state ${target.status}`}>
                {target.status === "completed" ? (
                  <Check size={14} />
                ) : target.status === "failed" ? (
                  <X size={14} />
                ) : (
                  <GitPullRequest size={14} />
                )}
              </span>
              <div>
                <strong>{target.service_name}</strong>
                <small>{target.repository}</small>
              </div>
              <code>
                {JSON.stringify(target.before_value)} →{" "}
                {JSON.stringify(target.after_value)}
              </code>
              <span className="confidence-chip">{target.confidence}</span>
              {target.pr_url ? (
                <a href={target.pr_url} target="_blank" rel="noopener">
                  PR #{target.pr_number} <ExternalLink size={12} />
                </a>
              ) : target.error ? (
                <em title={target.error}>{target.error}</em>
              ) : target.exclusion_reason ? (
                <em>{target.exclusion_reason}</em>
              ) : (
                <button className="text-button" onClick={() => exclude(target)}>
                  Exclude
                </button>
              )}
            </article>
          ))}
        </div>
      </div>
    );
  const owners = [...new Set(services.map((service) => service.owner))].sort();
  const lifecycles = [...new Set(services.map((service) => service.lifecycle).filter(Boolean))].sort();
  return (
    <div className="page campaigns-page">
      <section className="page-intro campaign-intro">
        <div>
          <p className="eyebrow">CATALOG OPERATIONS</p>
          <h1>Move metadata as a coordinated change</h1>
          <p>
            Preview repository diffs, open reviewable GitHub pull requests, and
            track every rollout exception without moving source of truth into
            the portal.
          </p>
        </div>
        <div className="campaign-kpis">
          <span>
            <strong>{campaigns.length}</strong> campaigns
          </span>
          <span>
            <strong>
              {campaigns.reduce(
                (sum, campaign) => sum + Number(campaign.active_count || 0),
                0,
              )}
            </strong>{" "}
            open PRs
          </span>
        </div>
      </section>
      {error && (
        <div className="global-error" role="alert">
          <AlertTriangle size={15} /> {error}
        </div>
      )}
      <div className="campaign-compose-layout">
        <section className="campaign-composer">
          <div className="record-section-head">
            <div>
              <p className="eyebrow">NEW CAMPAIGN</p>
              <h2>Define the desired metadata state</h2>
            </div>
          </div>
          <div className="campaign-form">
            <label>
              Campaign title
              <input
                value={form.title}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
                placeholder="Classify every production service"
              />
            </label>
            <label className="span-two">
              Why this change is needed
              <textarea
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
                placeholder="Explain the standard and what reviewers should verify."
              />
            </label>
            <label>
              Metadata field
              <input
                value={form.fieldPath}
                onChange={(event) =>
                  setForm({ ...form, fieldPath: event.target.value })
                }
                placeholder="spec.tier"
              />
            </label>
            <label>
              Value strategy
              <select
                value={form.strategy}
                onChange={(event) =>
                  setForm({
                    ...form,
                    strategy: event.target.value as "explicit" | "infer",
                  })
                }
              >
                <option value="explicit">Use one explicit value</option>
                <option value="infer">Infer per repository</option>
              </select>
            </label>
            {form.strategy === "explicit" && (
              <label className="span-two">
                Desired value
                <input
                  value={form.desiredValue}
                  onChange={(event) =>
                    setForm({ ...form, desiredValue: event.target.value })
                  }
                  placeholder='Text or JSON, for example ["api","critical"]'
                />
              </label>
            )}
            <label>
              Owner scope
              <select
                value={form.owner}
                onChange={(event) =>
                  setForm({ ...form, owner: event.target.value })
                }
              >
                <option value="">All owners</option>
                {owners.map((owner) => (
                  <option value={owner} key={owner}>
                    {owner}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Existing tier
              <select
                value={form.tier}
                onChange={(event) =>
                  setForm({ ...form, tier: event.target.value })
                }
              >
                <option value="">All tiers</option>
                {tiers.map((tier) => (
                  <option value={tier.id} key={tier.id}>
                    {tier.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Service type
              <select
                value={form.type}
                onChange={(event) =>
                  setForm({ ...form, type: event.target.value })
                }
              >
                <option value="">All service types</option>
                {types.map((type) => (
                  <option value={type.id} key={type.id}>
                    {type.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Lifecycle
              <select
                value={form.lifecycle}
                onChange={(event) => setForm({ ...form, lifecycle: event.target.value })}
              >
                <option value="">All lifecycles</option>
                {lifecycles.map((lifecycle) => (
                  <option value={lifecycle} key={lifecycle}>{lifecycle}</option>
                ))}
              </select>
            </label>
            <label>
              Specific service
              <select
                value={form.service}
                onChange={(event) => setForm({ ...form, service: event.target.value })}
              >
                <option value="">All matching services</option>
                {[...services].sort((a, b) => a.name.localeCompare(b.name)).map((service) => (
                  <option value={service.name} key={service.name}>{service.name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="campaign-form-actions">
            <button
              className="ghost-button"
              disabled={!form.fieldPath || busy === "preview"}
              onClick={runPreview}
            >
              <Target size={14} /> Preview affected repositories
            </button>
            <button
              className="primary-button"
              disabled={!preview.length || !form.title || busy === "create"}
              onClick={create}
            >
              <Megaphone size={14} /> Save campaign
            </button>
          </div>
        </section>
        <aside className="campaign-preview">
          <p className="eyebrow">DRY RUN</p>
          <h2>{preview.length} repository changes</h2>
          <p>No branches or pull requests are created during preview.</p>
          <div>
            {preview.slice(0, 20).map((target) => (
              <article key={target.repository}>
                <strong>{target.serviceName}</strong>
                <small>{target.repository}</small>
                <code>
                  {JSON.stringify(target.beforeValue)} →{" "}
                  {JSON.stringify(target.afterValue)}
                </code>
                <span>{target.confidence}</span>
              </article>
            ))}
            {!preview.length && (
              <div className="record-empty">
                <Target size={18} />
                <div>
                  <strong>Run a preview before saving</strong>
                  <p>The dry run lists every proposed repository patch.</p>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
      <section className="campaign-ledger-section">
        <div className="record-section-head">
          <div>
            <p className="eyebrow">ROLLOUTS</p>
            <h2>Campaign ledger</h2>
          </div>
          <button className="text-button" onClick={refresh}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
        <div className="campaign-ledger">
          {campaigns.map((campaign) => (
            <button onClick={() => loadCampaign(campaign.id)} key={campaign.id}>
              <span className={`campaign-status ${campaign.status}`}>
                {campaign.status}
              </span>
              <span>
                <strong>{campaign.title}</strong>
                <small>
                  <code>{campaign.field_path}</code> · @{campaign.created_by}
                </small>
              </span>
              <span>
                {campaign.completed_count}/{campaign.target_count} complete
              </span>
            </button>
          ))}
          {!campaigns.length && <p>No metadata campaigns created yet.</p>}
        </div>
      </section>
      <section className="waiver-review-section">
        <div className="record-section-head">
          <div>
            <p className="eyebrow">EXCEPTIONS</p>
            <h2>Waivers awaiting review</h2>
          </div>
        </div>
        <div className="waiver-review-list">
          {waivers
            .filter((waiver) => waiver.status === "requested")
            .map((waiver) => (
              <article key={waiver.id}>
                <ShieldCheck size={17} />
                <span>
                  <strong>
                    {waiver.service_name} · {waiver.rule_id}
                  </strong>
                  <small>
                    @{waiver.requested_by} · expires{" "}
                    {new Date(waiver.expires_at).toLocaleDateString()}
                  </small>
                  <p>{waiver.reason}</p>
                </span>
                <button
                  className="ghost-button"
                  onClick={() => decide(waiver, "approved")}
                >
                  <Check size={13} /> Approve
                </button>
                <button
                  className="text-button"
                  onClick={() => decide(waiver, "rejected")}
                >
                  <X size={13} /> Reject
                </button>
              </article>
            ))}
          {!waivers.some((waiver) => waiver.status === "requested") && (
            <p>No waiver requests need a decision.</p>
          )}
        </div>
      </section>
    </div>
  );
}

export function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const [analytics, setAnalytics] = useState<any>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api(`/api/admin/analytics?days=${days}`)
      .then((data) => setAnalytics(data.analytics))
      .catch((cause) => setError((cause as Error).message));
  }, [days]);
  const maxEvents = useMemo(
    () =>
      Math.max(
        1,
        ...(analytics?.daily || []).map((point: any) => Number(point.events)),
      ),
    [analytics],
  );
  return (
    <div className="page analytics-page">
      <section className="page-intro analytics-intro">
        <div>
          <p className="eyebrow">PORTAL EFFECTIVENESS</p>
          <h1>Measure whether the portal removes work</h1>
          <p>
            Follow adoption, failed searches, remediation throughput, and the
            paths engineers actually use—not vanity page totals alone.
          </p>
        </div>
        <select
          value={days}
          onChange={(event) => setDays(Number(event.target.value))}
        >
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>
      </section>
      {error && <div className="global-error">{error}</div>}
      {!analytics ? (
        <div className="record-empty">
          <Activity size={18} /> Loading effectiveness signals…
        </div>
      ) : (
        <>
          <div className="analytics-kpis">
            <span>
              <BarChart3 size={18} />
              <strong>{analytics.totals.events}</strong>
              <small>Recorded interactions</small>
            </span>
            <span>
              <Users size={18} />
              <strong>{analytics.totals.activeUsers}</strong>
              <small>Active signed-in users</small>
            </span>
            <span>
              <Activity size={18} />
              <strong>{analytics.totals.pageViews}</strong>
              <small>Page views</small>
            </span>
            <span>
              <GitPullRequest size={18} />
              <strong>{analytics.totals.actions}</strong>
              <small>Actions and fix PRs</small>
            </span>
          </div>
          <div className="analytics-grid">
            <section className="analytics-trend">
              <div className="record-section-head">
                <div>
                  <p className="eyebrow">ADOPTION</p>
                  <h2>Daily useful activity</h2>
                </div>
              </div>
              <div className="analytics-bars">
                {(analytics.daily || []).map((point: any) => (
                  <span key={point.event_day}>
                    <i
                      style={{
                        height: `${Math.max(4, (Number(point.events) / maxEvents) * 100)}%`,
                      }}
                      title={`${point.events} events`}
                    />
                    <small>
                      {new Date(point.event_day).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </small>
                  </span>
                ))}
                {!analytics.daily?.length && <p>No activity recorded yet.</p>}
              </div>
            </section>
            <section className="analytics-list">
              <p className="eyebrow">DISCOVERY GAPS</p>
              <h2>Searches with no answer</h2>
              {(analytics.searchesWithoutResults || []).map((item: any) => (
                <div key={item.query}>
                  <strong>{item.query}</strong>
                  <span>{item.count} searches</span>
                </div>
              ))}
              {!analytics.searchesWithoutResults?.length && (
                <p>No empty searches in this period.</p>
              )}
            </section>
            <section className="analytics-list">
              <p className="eyebrow">NAVIGATION</p>
              <h2>Most useful destinations</h2>
              {(analytics.popularPaths || []).map((item: any) => (
                <div key={item.path}>
                  <code>{item.path || "/"}</code>
                  <span>{item.views} views</span>
                </div>
              ))}
            </section>
            <section className="analytics-list">
              <p className="eyebrow">REMEDIATION</p>
              <h2>Campaign target outcomes</h2>
              {(analytics.campaignOutcomes || []).map((item: any) => (
                <div key={item.status}>
                  <strong>{item.status}</strong>
                  <span>{item.count}</span>
                </div>
              ))}
              {!analytics.campaignOutcomes?.length && (
                <p>No campaign targets yet.</p>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
