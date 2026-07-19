import { useState } from "react";
import { Archive, ArrowRight, CalendarClock, ExternalLink, ShieldCheck, Sparkles } from "lucide-react";
import { experimentStatus, riskProfile } from "./governance";
import { safeExternalUrl } from "./safe-url";

type LifecycleAction = "extend" | "promote" | "archive";

export function LifecycleGuardrails({ service, signedIn }: { service: any; signedIn: boolean }) {
  const risk = riskProfile(service.metadata);
  const experiment = experimentStatus(service.metadata);
  const states = Object.values(service.pluginStates || {}) as any[];
  const fresh = states.filter(
    (state) => state.status === "ready" && (!state.expiresAt || new Date(state.expiresAt).getTime() >= Date.now()),
  ).length;
  const [action, setAction] = useState<LifecycleAction | null>(null);
  const [expiresAt, setExpiresAt] = useState(
    new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
  );
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const proposal = action
    ? action === "extend"
      ? { field: "spec.experiment.expiresAt", value: expiresAt, verb: "Extend experiment" }
      : action === "promote"
        ? { field: "spec.lifecycle", value: "production", verb: "Promote to production" }
        : { field: "spec.lifecycle", value: "deprecated", verb: "Archive experiment" }
    : null;

  async function run() {
    if (!action) return;
    setBusy(true);
    setError("");
    const response = await fetch(`/api/services/${encodeURIComponent(service.name)}/lifecycle-actions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, expiresAt: action === "extend" ? expiresAt : undefined }),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) return setError(data.error || "Lifecycle pull request could not be opened");
    setResult(data.pullRequest);
    setAction(null);
  }

  return (
    <section className="guardrail-ledger" aria-label="Application guardrail posture">
      <div className="guardrail-ledger-title">
        <p className="eyebrow">GUARDRAIL POSTURE</p>
        <strong>Catalog evidence, not a separate checklist</strong>
      </div>
      <div className={`guardrail-fact risk-${risk.level}`}>
        <ShieldCheck size={15} />
        <span><small>Derived risk</small><strong>{risk.level}</strong><em>{risk.reasons[0]}</em></span>
      </div>
      <div className={`guardrail-fact experiment-${experiment.status}`}>
        <CalendarClock size={15} />
        <span>
          <small>Lifecycle clock</small>
          <strong>
            {!experiment.applicable
              ? service.lifecycle
              : experiment.status === "missing"
                ? "No expiry"
                : experiment.status === "expired"
                  ? `Expired ${Math.abs(experiment.daysRemaining!)}d ago`
                  : `${experiment.daysRemaining}d remaining`}
          </strong>
          <em>{experiment.expiresAt || "Managed lifecycle"}</em>
        </span>
      </div>
      <div className="guardrail-fact">
        <Sparkles size={15} />
        <span><small>Provider evidence</small><strong>{states.length ? `${fresh}/${states.length} current` : "Metadata only"}</strong><em>{states.length && fresh < states.length ? "Refresh needed" : "Evidence available"}</em></span>
      </div>
      {experiment.applicable && signedIn && (
        <div className="guardrail-actions">
          <button onClick={() => setAction("extend")}><CalendarClock size={13} /> Extend</button>
          <button onClick={() => setAction("promote")}><ArrowRight size={13} /> Promote</button>
          <button onClick={() => setAction("archive")}><Archive size={13} /> Archive</button>
        </div>
      )}
      {proposal && (
        <div className="guardrail-proposal">
          <div><small>Proposed metadata change</small><strong>{proposal.verb}</strong><code>{proposal.field} → {proposal.value}</code></div>
          {action === "extend" && <label>New expiry<input type="date" min={new Date().toISOString().slice(0, 10)} value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></label>}
          <button className="primary-button" disabled={busy} onClick={run}>{busy ? "Opening PR…" : "Confirm and open PR"}</button>
          <button className="text-button" onClick={() => setAction(null)}>Cancel</button>
        </div>
      )}
      {safeExternalUrl(result?.url) && <a className="guardrail-result" href={safeExternalUrl(result.url)!} target="_blank" rel="noopener noreferrer">Pull request #{result.number} opened <ExternalLink size={12} /></a>}
      {result?.alreadySatisfied && <p className="guardrail-result">Metadata already matches this lifecycle state.</p>}
      {error && <p className="guardrail-error">{error}</p>}
    </section>
  );
}
