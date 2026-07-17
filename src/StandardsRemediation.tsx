import { useEffect, useState } from "react";
import {
  Check,
  ExternalLink,
  FileWarning,
  GitPullRequest,
  ShieldQuestion,
  X,
} from "lucide-react";
import { evidenceFreshness, evaluateRule, type ScorecardRule } from "./scorecards";

type Waiver = {
  id: string;
  scorecard_id: string;
  rule_id: string;
  reason: string;
  status: string;
  requested_by: string;
  expires_at: string;
};
type Remediation = {
  id: string;
  rule_id: string;
  status: "pr-open" | "completed" | "closed";
  pr_number: number;
  pr_url: string;
};

export function StandardsChecks({
  service,
  scorecardId,
  checks,
  signedIn,
  pluginStates = {},
}: {
  service: any;
  scorecardId: string;
  checks: ScorecardRule[];
  signedIn: boolean;
  pluginStates?: Record<string, any>;
}) {
  const [waivers, setWaivers] = useState<Waiver[]>([]);
  const [remediations, setRemediations] = useState<Remediation[]>([]);
  const [fixPreview, setFixPreview] = useState<any>(null);
  const [requesting, setRequesting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [expiry, setExpiry] = useState(
    new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  );
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const refresh = () =>
    Promise.all([
      fetch(`/api/standards/waivers?service=${encodeURIComponent(service.name)}`).then((response) =>
        response.ok ? response.json() : { waivers: [] },
      ),
      fetch(`/api/services/${encodeURIComponent(service.name)}/remediations`).then((response) =>
        response.ok ? response.json() : { remediations: [] },
      ),
    ])
      .then(([waiverData, remediationData]) => {
        setWaivers(waiverData.waivers || []);
        setRemediations(remediationData.remediations || []);
      })
      .catch(() => {});
  useEffect(() => {
    void refresh();
  }, [service.name]);
  const previewFix = async (rule: ScorecardRule) => {
    setBusy(rule.id);
    setMessage("");
    const response = await fetch(
      `/api/services/${encodeURIComponent(service.name)}/remediations/preview`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scorecardId, ruleId: rule.id }),
      },
    );
    const data = await response.json();
    setBusy("");
    if (!response.ok)
      return setMessage(data.error || "Fix preview could not be created");
    setFixPreview({ ruleId: rule.id, ...data.preview });
  };
  const openFix = async (rule: ScorecardRule) => {
    setBusy(rule.id);
    setMessage("");
    const response = await fetch(
      `/api/services/${encodeURIComponent(service.name)}/remediations`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scorecardId, ruleId: rule.id }),
      },
    );
    const data = await response.json();
    setBusy("");
    if (!response.ok)
      return setMessage(data.error || "Fix PR could not be opened");
    setFixPreview(null);
    if (data.pullRequest.alreadySatisfied)
      setMessage("The repository already contains the suggested value");
    else {
      setMessage(`Pull request #${data.pullRequest.number} opened`);
      window.open(data.pullRequest.url, "_blank", "noopener");
      void refresh();
    }
  };
  const requestWaiver = async (rule: ScorecardRule) => {
    setBusy(rule.id);
    setMessage("");
    const response = await fetch("/api/standards/waivers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        serviceName: service.name,
        scorecardId,
        ruleId: rule.id,
        reason,
        expiresAt: new Date(`${expiry}T23:59:59Z`).toISOString(),
      }),
    });
    const data = await response.json();
    setBusy("");
    if (!response.ok)
      return setMessage(data.error || "Waiver request could not be recorded");
    setRequesting(null);
    setReason("");
    setMessage("Waiver requested for administrator review");
    refresh();
  };
  return (
    <div className="service-checks standards-remediation">
      {message && <div className="standards-message">{message}</div>}
      {checks.map((check) => {
        const pass = evaluateRule(
          service.metadata,
          check,
          service.plugins,
          pluginStates,
        );
        const freshness = evidenceFreshness(check, pluginStates);
        const waiver = waivers.find(
          (candidate) =>
            candidate.scorecard_id === scorecardId &&
            candidate.rule_id === check.id &&
            candidate.status !== "rejected" &&
            new Date(candidate.expires_at) > new Date(),
        );
        const latestRemediation = remediations.find(
          (candidate) => candidate.rule_id === check.id,
        );
        return (
          <div
            className={pass ? "service-check" : "service-check needs-work"}
            key={check.id}
          >
            <span className={pass ? "check-mark pass" : "check-mark"}>
              {pass ? <Check size={14} /> : <X size={14} />}
            </span>
            <div className="check-copy">
              <strong>{check.title}</strong>
              <small>{check.description || check.path}</small>
              {check.source?.kind === "plugin" && (
                <p className={`evidence-freshness ${freshness.status}`}>
                  Evidence {freshness.status}
                  {freshness.ageHours !== null && ` · ${Math.round(freshness.ageHours)}h old`}
                  {check.maxEvidenceAgeHours && ` · limit ${check.maxEvidenceAgeHours}h`}
                </p>
              )}
              {!pass && check.remediation && (
                <p className="remediation-guidance">
                  <FileWarning size={13} /> {check.remediation.guidance}
                  {check.remediation.docsUrl && (
                    <a
                      href={check.remediation.docsUrl}
                      target="_blank"
                      rel="noopener"
                    >
                      Guidance <ExternalLink size={11} />
                    </a>
                  )}
                </p>
              )}
              {waiver && (
                <p className={`waiver-chip ${waiver.status}`}>
                  <ShieldQuestion size={12} />
                  {waiver.status === "approved" ? "Waived" : "Waiver pending"}
                  {" · until "}
                  {new Date(waiver.expires_at).toLocaleDateString()}
                </p>
              )}
              {latestRemediation && (
                <a
                  className={`remediation-history ${latestRemediation.status}`}
                  href={latestRemediation.pr_url}
                  target="_blank"
                  rel="noopener"
                >
                  <GitPullRequest size={12} /> PR #{latestRemediation.pr_number} ·{" "}
                  {latestRemediation.status === "pr-open"
                    ? "review in progress"
                    : latestRemediation.status}
                </a>
              )}
              {!pass && fixPreview?.ruleId === check.id && (
                <div className="remediation-preview">
                  <span>Proposed metadata change</span>
                  <strong>{fixPreview.fieldPath}</strong>
                  <div>
                    <code>{JSON.stringify(fixPreview.beforeValue)}</code>
                    <span>→</span>
                    <code>{JSON.stringify(fixPreview.afterValue)}</code>
                  </div>
                  <small>{fixPreview.repository}/{fixPreview.metadataPath}</small>
                  <button
                    className="primary-button"
                    disabled={busy === check.id}
                    onClick={() => openFix(check)}
                  >
                    Confirm and open PR
                  </button>
                  <button className="text-button" onClick={() => setFixPreview(null)}>
                    Cancel
                  </button>
                </div>
              )}
              {!pass && requesting === check.id && (
                <div className="waiver-form">
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Why is an exception necessary, and what replaces this control?"
                  />
                  <label>
                    Expires
                    <input
                      type="date"
                      min={new Date().toISOString().slice(0, 10)}
                      value={expiry}
                      onChange={(event) => setExpiry(event.target.value)}
                    />
                  </label>
                  <button
                    className="primary-button"
                    disabled={!reason.trim() || busy === check.id}
                    onClick={() => requestWaiver(check)}
                  >
                    Request waiver
                  </button>
                  <button
                    className="text-button"
                    onClick={() => setRequesting(null)}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
            <div className="check-actions">
              <em>
                {pass
                  ? "Passing"
                  : waiver?.status === "approved"
                    ? "Exception active"
                    : "Needs attention"}
              </em>
              {!pass && signedIn && (
                <>
                  {check.remediation?.suggestedValue !== undefined && (
                    <button
                      className="text-button"
                      disabled={busy === check.id}
                      onClick={() => previewFix(check)}
                    >
                      <GitPullRequest size={13} /> Preview fix PR
                    </button>
                  )}
                  {!waiver && requesting !== check.id && (
                    <button
                      className="text-button"
                      onClick={() => setRequesting(check.id)}
                    >
                      Request waiver
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
