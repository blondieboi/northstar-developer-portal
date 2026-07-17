import { useEffect, useState } from "react";
import {
  Check,
  ExternalLink,
  FileWarning,
  GitPullRequest,
  ShieldQuestion,
  X,
} from "lucide-react";
import { evaluateRule, type ScorecardRule } from "./scorecards";

type Waiver = {
  id: string;
  scorecard_id: string;
  rule_id: string;
  reason: string;
  status: string;
  requested_by: string;
  expires_at: string;
};

export function StandardsChecks({
  service,
  scorecardId,
  checks,
  signedIn,
}: {
  service: any;
  scorecardId: string;
  checks: ScorecardRule[];
  signedIn: boolean;
}) {
  const [waivers, setWaivers] = useState<Waiver[]>([]);
  const [requesting, setRequesting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [expiry, setExpiry] = useState(
    new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  );
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const refresh = () =>
    fetch(`/api/standards/waivers?service=${encodeURIComponent(service.name)}`)
      .then((response) => (response.ok ? response.json() : { waivers: [] }))
      .then((data) => setWaivers(data.waivers || []))
      .catch(() => {});
  useEffect(() => {
    void refresh();
  }, [service.name]);
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
    if (data.pullRequest.alreadySatisfied)
      setMessage("The repository already contains the suggested value");
    else {
      setMessage(`Pull request #${data.pullRequest.number} opened`);
      window.open(data.pullRequest.url, "_blank", "noopener");
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
        const pass = evaluateRule(service.metadata, check, service.plugins);
        const waiver = waivers.find(
          (candidate) =>
            candidate.scorecard_id === scorecardId &&
            candidate.rule_id === check.id &&
            candidate.status !== "rejected" &&
            new Date(candidate.expires_at) > new Date(),
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
                      onClick={() => openFix(check)}
                    >
                      <GitPullRequest size={13} /> Open fix PR
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
