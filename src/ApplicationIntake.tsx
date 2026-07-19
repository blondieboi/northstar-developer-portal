import {
  AlertTriangle,
  Check,
  ChevronRight,
  ExternalLink,
  FileCode2,
  GitBranch,
  GitPullRequest,
  LoaderCircle,
  Radar,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { IntakeDraft as Draft } from "./intake-contract";
import {
  useApplicationIntake,
  type IntakeEvidence as Evidence,
} from "./useApplicationIntake";
import { safeExternalUrl } from "./safe-url";

function EvidenceNote({ item }: { item?: Evidence }) {
  if (!item) return null;
  return (
    <span className={`intake-evidence ${item.confidence}`}>
      <i />
      <b>{item.confidence}</b>
      {item.source} · {item.detail}
    </span>
  );
}

function Field({ label, evidence, children }: { label: string; evidence?: Evidence; children: React.ReactNode }) {
  return (
    <label className="intake-field">
      <span>{label}</span>
      {children}
      <EvidenceNote item={evidence} />
    </label>
  );
}

export function ApplicationIntake() {
  const {
    data, selected, draft, query, yaml, loading, previewing, working,
    scanError, proposalError, result, candidate, evidence, filtered, missing, setQuery, scan, update,
    choose, onboard,
  } = useApplicationIntake();

  return (
    <div className="page intake-page">
      <header className="intake-thesis">
        <div>
          <p className="eyebrow">APPLICATION INTAKE</p>
          <h1>Find what is shipping<br />before it becomes invisible.</h1>
          <p>Perongen reads repository evidence, asks you to confirm what it cannot know, and opens one reviewable catalog pull request.</p>
        </div>
        <div className="intake-thesis-status">
          <Radar size={25} />
          <strong>{loading ? "Scanning" : data.candidates.length}</strong>
          <span>{loading ? "Reading installed repositories" : `uncatalogued repositories · ${data.cached ? "cached" : "just scanned"}`}</span>
          <button onClick={() => scan(true)} disabled={loading}><RefreshCw size={13} className={loading ? "spin" : ""} /> Scan again</button>
        </div>
      </header>

      {scanError && <div className="intake-global-error" role="alert"><AlertTriangle size={16} /> <span><strong>{candidate ? "Repository scan could not be refreshed" : "Application Intake is unavailable"}</strong>{scanError}</span></div>}
      {loading ? (
        <div className="intake-loading" role="status"><LoaderCircle className="spin" size={22} /><strong>Reading repository evidence</strong><span>File names, manifests, topics, and ownership signals are being inspected.</span></div>
      ) : !data.candidates.length ? (
        <div className="intake-empty"><Check size={24} /><h2>Every installed repository is accounted for.</h2><p>New repositories will appear here until their catalog metadata is merged.</p></div>
      ) : (
        <div className="intake-workbench">
          <aside className="intake-queue">
            <div className="intake-queue-head">
              <div><span>DISCOVERY QUEUE</span><strong>{data.candidates.length} repositories</strong></div>
              <label><Search size={14} /><input aria-label="Search repositories" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find repository" /></label>
            </div>
            <div className="intake-queue-list">
              {filtered.map((item) => (
                <button key={item.repository} aria-pressed={item.repository === selected} className={item.repository === selected ? "active" : ""} onClick={() => choose(item)}>
                  <GitBranch size={14} />
                  <span><strong>{item.repository.split("/")[1]}</strong><small>{item.repository.split("/")[0]} · {item.archived ? "archived · " : item.fork ? "fork · " : ""}{item.readiness}% evidenced</small></span>
                  <i className={`readiness ${item.readiness >= 70 ? "high" : item.readiness >= 45 ? "medium" : "low"}`} />
                  <ChevronRight size={14} />
                </button>
              ))}
              {!filtered.length && <p className="intake-queue-empty">No repositories match “{query}”.</p>}
            </div>
          </aside>

          {candidate && draft && (
            <section className="intake-dossier">
              <header className="intake-dossier-head">
                <div><p className="eyebrow">EVIDENCE DOSSIER</p><h2>{candidate.repository}</h2><span>{candidate.readiness}% of fields supported before review</span></div>
                <a href={safeExternalUrl(candidate.url) || undefined} target="_blank" rel="noopener noreferrer">Open repository <ExternalLink size={12} /></a>
              </header>
              {candidate.scanError && <div className="intake-scan-warning"><AlertTriangle size={14} /><span><strong>Some repository evidence could not be read.</strong>{candidate.scanError}</span></div>}

              <div className="intake-section">
                <div className="intake-section-title"><FileCode2 size={15} /><span><strong>Identity</strong><small>Repository-owned catalog identity</small></span></div>
                <div className="intake-form-grid">
                  <Field label="Service name" evidence={evidence.name}><input aria-label="Service name" value={draft.name} onChange={(event) => update("name", event.target.value)} /></Field>
                  <Field label="Display title"><input aria-label="Display title" value={draft.title} onChange={(event) => update("title", event.target.value)} /></Field>
                  <Field label="Description" evidence={evidence.description}><textarea aria-label="Description" value={draft.description} onChange={(event) => update("description", event.target.value)} /></Field>
                  <Field label="Accountable owner" evidence={evidence.owner}>
                    <input aria-label="Accountable owner" list="intake-teams" value={draft.owner} onChange={(event) => update("owner", event.target.value)} placeholder="team:platform" />
                    <datalist id="intake-teams">{data.teams.map((team) => <option key={team.name} value={`team:${team.name}`}>{team.title}</option>)}</datalist>
                  </Field>
                </div>
              </div>

              <div className="intake-section">
                <div className="intake-section-title"><Sparkles size={15} /><span><strong>Classification</strong><small>Placement in the software catalog</small></span></div>
                <div className="intake-form-grid three">
                  <Field label="Lifecycle" evidence={evidence.lifecycle}><select aria-label="Lifecycle" value={draft.lifecycle} onChange={(event) => update("lifecycle", event.target.value)}><option value="">Confirm lifecycle…</option>{data.catalog.lifecycles.map((item) => <option key={item}>{item}</option>)}</select></Field>
                  <Field label="Service type" evidence={evidence.type}><select aria-label="Service type" value={draft.type} onChange={(event) => update("type", event.target.value)}><option value="">Unclassified</option>{data.catalog.types.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field>
                  <Field label="Tier" evidence={evidence.tier}><select aria-label="Tier" value={draft.tier} onChange={(event) => update("tier", event.target.value)}><option value="">Unclassified</option>{data.catalog.tiers.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field>
                  <Field label="System" evidence={evidence.system}><input aria-label="System" value={draft.system} onChange={(event) => update("system", event.target.value)} placeholder="Optional" /></Field>
                  <Field label="Language" evidence={evidence.language}><input aria-label="Language" value={draft.language} onChange={(event) => update("language", event.target.value)} /></Field>
                  {draft.lifecycle === "experimental" && <Field label="Experiment expires"><input aria-label="Experiment expires" type="date" value={draft.expiresAt} onChange={(event) => update("expiresAt", event.target.value)} /></Field>}
                </div>
              </div>

              <div className="intake-section risk-confirmation">
                <div className="intake-section-title"><ShieldCheck size={15} /><span><strong>Risk facts</strong><small>Required confirmation—Perongen will not guess</small></span></div>
                <div className="intake-form-grid three">
                  <Field label="Exposure" evidence={evidence.exposure}><select aria-label="Exposure" value={draft.exposure} onChange={(event) => update("exposure", event.target.value as Draft["exposure"])}><option value="">Confirm…</option><option value="internal">Internal</option><option value="public">Public</option></select></Field>
                  <Field label="Data sensitivity" evidence={evidence.dataSensitivity}><select aria-label="Data sensitivity" value={draft.dataSensitivity} onChange={(event) => update("dataSensitivity", event.target.value as Draft["dataSensitivity"])}><option value="">Confirm…</option><option value="none">None</option><option value="internal">Internal</option><option value="confidential">Confidential</option><option value="restricted">Restricted</option></select></Field>
                  <Field label="Authentication" evidence={evidence.authentication}><select aria-label="Authentication" value={draft.authentication} onChange={(event) => update("authentication", event.target.value as Draft["authentication"])}><option value="">Confirm…</option><option value="none">None</option><option value="optional">Optional</option><option value="required">Required</option></select></Field>
                </div>
              </div>

              <div className="intake-section">
                <div className="intake-section-title"><GitBranch size={15} /><span><strong>Repository context</strong><small>Documentation and catalog relationships</small></span></div>
                <div className="intake-form-grid">
                  <Field label="Documentation directory" evidence={evidence.docsPath}><input aria-label="Documentation directory" value={draft.docsPath} onChange={(event) => update("docsPath", event.target.value)} placeholder="docs" /></Field>
                  <Field label="Depends on" evidence={evidence.dependsOn}><input aria-label="Depends on" value={draft.dependsOn} onChange={(event) => update("dependsOn", event.target.value)} placeholder="service:inventory, api:pricing" /></Field>
                </div>
              </div>

              <div className="intake-output-grid">
                <section className="intake-plugin-plan">
                  <header><ShieldCheck size={15} /><span><strong>Guardrails after merge</strong><small>Enabled plugins begin collecting evidence automatically.</small></span></header>
                  {candidate.plugins.filter((plugin) => plugin.recommended).map((plugin) => (
                    <div key={plugin.id}><i className={plugin.enabled ? "enabled" : "disabled"}>{plugin.enabled ? <Check size={11} /> : "—"}</i><span><strong>{plugin.title}</strong><small>{plugin.reason}</small></span><em>{plugin.enabled ? "Enabled" : "Enable in settings"}</em></div>
                  ))}
                </section>
                <section className="intake-yaml">
                  <header><GitPullRequest size={15} /><span><strong>{data.metadataPath}</strong><small>{previewing ? "Validating proposal…" : yaml ? "Validated proposal" : "Needs confirmation"}</small></span></header>
                  <pre>{yaml || "# Complete the required fields to generate valid metadata."}</pre>
                </section>
              </div>

              <footer className="intake-commit-bar">
                <div>
                  {missing.length ? <span className="error" role="status"><AlertTriangle size={14} />Review required: {missing.join(", ")}</span> : proposalError ? <span className="error" role="alert"><AlertTriangle size={14} />{proposalError}</span> : <span><Check size={14} />No repository changes occur until you open the pull request.</span>}
                  {result?.url && safeExternalUrl(result.url) && <a href={safeExternalUrl(result.url)!} target="_blank" rel="noopener noreferrer">Pull request #{result.number} opened <ExternalLink size={12} /></a>}
                  {result?.alreadyCataloged && <span>Metadata already exists. Scan again to refresh the queue.</span>}
                </div>
                <button className="primary-button" disabled={!yaml || previewing || working || Boolean(result)} onClick={onboard}>{working ? <><LoaderCircle className="spin" size={14} /> Opening pull request…</> : <><GitPullRequest size={14} /> Open onboarding pull request</>}</button>
              </footer>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
