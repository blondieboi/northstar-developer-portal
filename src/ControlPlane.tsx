import { useEffect, useState, type CSSProperties } from "react";
import {
  Activity,
  Check,
  CheckCircle2,
  FileCode2,
  GitBranch,
  ShieldCheck,
  TerminalSquare,
  X,
  Zap,
} from "lucide-react";
import { evaluateRule, ruleApplies, scorecardApplies } from "./scorecards";
import { PageIntro } from "./ui/PageIntro";

const rel = (value: string) => new Date(value).toLocaleString();
const ring = (score: number) => (
  <div
    className="score-ring"
    style={{ "--score": `${score * 3.6}deg` } as CSSProperties}
  >
    <div>
      <strong>{score}</strong>
      <span>/100</span>
    </div>
  </div>
);
export function ConfiguredScorecards({
  services,
  cards,
  tiers,
  types,
}: {
  services: any[];
  cards: any[];
  tiers: any[];
  types: any[];
}) {
  const [selected, setSelected] = useState(
    cards.find((card) => card.primary)?.id || cards[0]?.id || "",
  );
  useEffect(() => {
    if (!cards.some((card) => card.id === selected))
      setSelected(cards.find((card) => card.primary)?.id || cards[0]?.id || "");
  }, [cards, selected]);
  const card = cards.find((item) => item.id === selected) || cards[0];
  if (!card)
    return (
      <div className="page">
        <div className="empty-state">
          <ShieldCheck size={20} />
          <h3>No scorecards configured</h3>
          <p>An administrator can create the first scorecard in Settings.</p>
        </div>
      </div>
    );
  const active = card.rules.filter((rule: any) => rule.enabled);
  const scopedServices = services.filter((service) =>
    scorecardApplies(service.metadata, card),
  );
  const evaluations = active.reduce(
    (sum: number, rule: any) =>
      sum +
      scopedServices.filter((service) =>
        ruleApplies(service.metadata, rule, service.plugins),
      ).length,
    0,
  );
  const avg = scopedServices.length
    ? Math.round(
        scopedServices.reduce(
          (sum, service) =>
            sum +
            (service.scorecards?.[card.id] ??
              (card.primary ? service.score : 100)),
          0,
        ) / scopedServices.length,
      )
    : 0;
  const tierTitle = (id: string) =>
    tiers.find((tier) => tier.id === id)?.title || id;
  const typeTitle = (id: string) =>
    types.find((type) => type.id === id)?.title || id;
  return (
    <div className="page">
      <PageIntro
        eyebrow="STANDARDS"
        title="Scorecards"
        description="Independent standards views can combine catalog metadata and plugin signals."
      />
      <div className="scorecard-tabs" role="tablist">
        {cards
          .filter((item) => item.enabled)
          .map((item) => (
            <button
              role="tab"
              aria-selected={item.id === card.id}
              className={item.id === card.id ? "active" : ""}
              onClick={() => setSelected(item.id)}
              key={item.id}
            >
              <span>{item.primary ? "Primary" : "Scorecard"}</span>
              <strong>{item.title}</strong>
              <small>
                {item.rules.filter((rule: any) => rule.enabled).length} checks
                {item.risks?.length ? ` · ${item.risks.join(", ")} risk` : ""}
              </small>
            </button>
          ))}
      </div>
      <section className="score-hero">
        <div>
          <span className="status-chip">
            <ShieldCheck size={14} />
            {card.primary ? "Primary scorecard" : "Active scorecard"}
          </span>
          <h2>{card.title}</h2>
          <p>
            {card.description || "Weighted checks across applicable services."}
          </p>
          <div className="hero-meta" aria-label="Scorecard scope">
            <span>
              <strong>{active.length}</strong>
              checks
            </span>
            <span>
              <strong>{scopedServices.length}</strong>
              services
            </span>
            <span>
              <strong>{evaluations}</strong>
              evaluations
            </span>
          </div>
        </div>
        <div className="score-hero-score">
          {ring(avg)}
          <span>Average coverage</span>
        </div>
      </section>
      <div className="score-layout">
        <section className="rules">
          <div className="rules-head">
            <h3>Checks</h3>
            <span>Metadata and plugin signals</span>
          </div>
          {active.map((rule: any) => {
            const eligible = scopedServices.filter((service) =>
              ruleApplies(service.metadata, rule, service.plugins),
            );
            const passing = eligible.filter((service) =>
              evaluateRule(
                service.metadata,
                rule,
                service.plugins,
                service.pluginStates,
              ),
            ).length;
            return (
              <div className="rule" key={rule.id}>
                <div
                  className={
                    eligible.length > 0 && passing === eligible.length
                      ? "rule-state pass"
                      : "rule-state warn"
                  }
                >
                  {eligible.length > 0 && passing === eligible.length ? (
                    <Check size={16} />
                  ) : (
                    <Activity size={16} />
                  )}
                </div>
                <div className="rule-main">
                  <div>
                    <strong>{rule.title}</strong>
                    <span>{rule.severity}</span>
                  </div>
                  <p>
                    {rule.description || rule.path} · weight {rule.weight}
                  </p>
                  <div className="rule-source">
                    {rule.source?.kind === "plugin"
                      ? `Plugin · ${rule.source.plugin}${rule.maxEvidenceAgeHours ? ` · evidence ≤ ${rule.maxEvidenceAgeHours}h` : ""}`
                      : "Service metadata"}
                  </div>
                  <div className="scope-matrix">
                    <div>
                      <small>Tier</small>
                      {rule.tiers?.length ? (
                        rule.tiers.map((id: string) => (
                          <span className="tier-chip" key={id}>
                            {tierTitle(id)}
                          </span>
                        ))
                      ) : (
                        <span className="tier-chip global">All</span>
                      )}
                    </div>
                    <div>
                      <small>Type</small>
                      {rule.types?.length ? (
                        rule.types.map((id: string) => (
                          <span className="type-chip" key={id}>
                            {typeTitle(id)}
                          </span>
                        ))
                      ) : (
                        <span className="type-chip global">All</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="rule-result">
                  <strong>
                    {eligible.length ? `${passing}/${eligible.length}` : "—"}
                  </strong>
                  <small>
                    {eligible.length ? "passing" : "not applicable"}
                  </small>
                </div>
              </div>
            );
          })}
        </section>
        <aside className="standards-aside">
          <h3>Coverage</h3>
          <p>{card.title} by service.</p>
          {scopedServices.map((service) => {
            const score =
              service.scorecards?.[card.id] ??
              (card.primary ? service.score : 100);
            return (
              <div className="coverage" key={service.name}>
                <span>
                  {service.name}
                  <small className="coverage-tier">
                    {[
                      service.tier && tierTitle(service.tier),
                      service.service_type && typeTitle(service.service_type),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </span>
                <div>
                  <b style={{ width: `${score}%` }} />
                  <em>{score}%</em>
                </div>
              </div>
            );
          })}
        </aside>
      </div>
    </div>
  );
}

export function ConfiguredActions({
  runs,
  actions,
  user,
}: {
  runs: any[];
  actions: any[];
  user: any;
}) {
  const [selected, setSelected] = useState<any>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  async function run() {
    const r = await fetch("/api/actions/dispatch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actionId: selected.id, inputs: values }),
    });
    const data = await r.json();
    setMessage(r.ok ? "Workflow dispatched." : data.error);
  }
  return (
    <div className="page">
      <PageIntro
        eyebrow="SELF-SERVICE"
        title="Actions"
        description="Published workflows prepared by your portal administrators."
      />
      <div className="configured-actions">
        {actions.map((a) => (
          <article className="action-feature" key={a.id}>
            <div className="action-art">
              <TerminalSquare size={38} />
              <span>{a.workflow}</span>
            </div>
            <div>
              <span className="status-chip">Published</span>
              <h2>{a.title}</h2>
              <p>{a.description}</p>
              <div className="action-details">
                <span>
                  <GitBranch size={15} />
                  {a.repository}
                </span>
                <span>
                  <FileCode2 size={15} />
                  {a.inputs.length} inputs
                </span>
              </div>
              <button
                className="primary"
                onClick={() =>
                  user ? setSelected(a) : location.assign("/api/auth/login")
                }
              >
                {user ? "Run action" : "Sign in to run"}
              </button>
            </div>
          </article>
        ))}
      </div>
      {!actions.length && (
        <div className="empty-state">
          <div>
            <Zap size={20} />
          </div>
          <h3>No published actions</h3>
          <p>An administrator can publish workflow actions in Settings.</p>
        </div>
      )}
      <section className="panel run-history">
        <h3>Recent runs</h3>
        {runs.map((r) => (
          <div className="run-row" key={r.id}>
            <CheckCircle2 size={18} />
            <div>
              <strong>{r.action_id}</strong>
              <small>{r.repository}</small>
            </div>
            <span>{r.status}</span>
            <time>{rel(r.created_at)}</time>
          </div>
        ))}
      </section>
      {selected && (
        <div className="drawer-wrap">
          <div className="drawer-scrim" onClick={() => setSelected(null)} />
          <aside className="drawer action-drawer">
            <button className="drawer-close" onClick={() => setSelected(null)}>
              <X size={18} />
            </button>
            <p className="eyebrow">WORKFLOW ACTION</p>
            <h2>{selected.title}</h2>
            <p className="drawer-desc">{selected.confirmation}</p>
            {selected.inputs.map((i: any) => (
              <label key={i.id}>
                {i.label}
                {i.type === "select" ? (
                  <select
                    onChange={(e) =>
                      setValues({ ...values, [i.id]: e.target.value })
                    }
                  >
                    <option value="">Choose…</option>
                    {i.options?.map((o: string) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                ) : i.type === "boolean" ? (
                  <select
                    onChange={(e) =>
                      setValues({ ...values, [i.id]: e.target.value })
                    }
                  >
                    <option value="">Choose…</option>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                ) : i.type === "multiline" ? (
                  <textarea
                    onChange={(e) =>
                      setValues({ ...values, [i.id]: e.target.value })
                    }
                  />
                ) : (
                  <input
                    type={i.type === "number" ? "number" : "text"}
                    onChange={(e) =>
                      setValues({ ...values, [i.id]: e.target.value })
                    }
                  />
                )}
              </label>
            ))}
            {message && <div className="action-result">{message}</div>}
            <button className="primary action-submit" onClick={run}>
              Run action
            </button>
          </aside>
        </div>
      )}
    </div>
  );
}
