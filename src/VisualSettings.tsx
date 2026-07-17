import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Check,
  ExternalLink,
  GitBranch,
  Link2,
  Plus,
  RotateCcw,
  Settings,
  ShieldCheck,
  Trash2,
  Users,
  Webhook,
  X,
} from "lucide-react";
import { evaluateRule, ruleApplies } from "./scorecards";

type Section =
  "general" | "catalog" | "scorecards" | "actions" | "tools" | "integrations";
const sectionNames: Section[] = [
  "general",
  "catalog",
  "scorecards",
  "actions",
  "tools",
  "integrations",
];
const formatTime = (v: string) => new Date(v).toLocaleString();
async function jsonFetch(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

export function VisualSettings({ onRefresh }: { onRefresh: () => void }) {
  const [tab, setTab] = useState("general");
  const [config, setConfig] = useState<any>(null);
  const [draft, setDraft] = useState<any>(null);
  const [draftSection, setDraftSection] = useState<Section | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [status, setStatus] = useState<any>({});
  const [services, setServices] = useState<any[]>([]);
  const [pluginCatalog, setPluginCatalog] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false),
    dirtyRef = useRef(false);
  const [remoteConflict, setRemoteConflict] = useState(false),
    [saving, setSaving] = useState(false);
  const [syncingCatalog, setSyncingCatalog] = useState(false);
  const markDirty = (value: any) => {
    setDraft(value);
    setDirty(true);
    dirtyRef.current = true;
  };
  const setCleanDraft = (section: Section, c: any) => {
    setDraft(structuredClone(c.effective[section]));
    setDraftSection(section);
    setDirty(false);
    dirtyRef.current = false;
    setRemoteConflict(false);
  };
  async function load(forceDraft = false) {
    const [c, u, a, w, s, summary, plugins] = await Promise.all([
      jsonFetch("/api/admin/config"),
      jsonFetch("/api/admin/users"),
      jsonFetch("/api/admin/audit"),
      jsonFetch("/api/admin/webhooks"),
      jsonFetch("/api/github/status"),
      jsonFetch("/api/summary"),
      jsonFetch("/api/plugins"),
    ]);
    const changed = Boolean(
      config?.source?.appliedSha &&
      config.source.appliedSha !== c.source?.appliedSha,
    );
    setConfig(c);
    setUsers(u.users || []);
    setAudit(a.events || []);
    setWebhooks(w.deliveries || []);
    setStatus(s);
    setServices(summary.services || []);
    setPluginCatalog(plugins.plugins || []);
    if (sectionNames.includes(tab as Section)) {
      if (forceDraft || !dirtyRef.current || draftSection !== tab)
        setCleanDraft(tab as Section, c);
      else if (changed) setRemoteConflict(true);
    }
  }
  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, []);
  useEffect(() => {
    if (config && sectionNames.includes(tab as Section))
      setCleanDraft(tab as Section, config);
  }, [tab]);
  useEffect(() => {
    const check = () =>
      jsonFetch("/api/config/revision")
        .then((revision) => {
          if (
            config?.source &&
            (revision.appliedSha !== config.source.appliedSha ||
              revision.status !== config.source.status)
          )
            return load();
        })
        .catch(() => {});
    const timer = setInterval(check, 15000);
    addEventListener("focus", check);
    return () => {
      clearInterval(timer);
      removeEventListener("focus", check);
    };
  }, [config?.source?.appliedSha, config?.source?.status, tab]);
  async function save() {
    setSaving(true);
    try {
      const addsPluginScorecard =
        tab === "integrations" &&
        pluginCatalog.some(
          (manifest) =>
            manifest.defaultScorecards?.some(
              (card: any) =>
                !config.effective.scorecards.cards.some(
                  (candidate: any) => candidate.id === card.id,
                ),
            ) &&
            draft.plugins?.some(
              (plugin: any) =>
                plugin.id === manifest.id && Boolean(plugin.enabled),
            ),
        );
      await jsonFetch(`/api/admin/config/${tab}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          value: draft,
          expectedBlobSha: config.source.files[tab]?.sha,
        }),
      });
      setMessage(
        addsPluginScorecard
          ? "Plugin and default scorecard committed to GitHub and applied."
          : "Committed to GitHub and applied.",
      );
      await load(true);
      onRefresh();
    } catch (e) {
      const error = (e as Error).message;
      setMessage(error);
      if (error.includes("changed in GitHub")) setRemoteConflict(true);
    } finally {
      setSaving(false);
    }
  }
  async function reset() {
    setSaving(true);
    try {
      await jsonFetch(`/api/admin/config/${tab}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedBlobSha: config.source.files[tab]?.sha,
        }),
      });
      setMessage("Product defaults committed to GitHub.");
      await load(true);
      onRefresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function changeRole(login: string, role: string) {
    try {
      await jsonFetch(`/api/admin/users/${login}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          role,
          expectedBlobSha: config.source.files.access.sha,
        }),
      });
      setMessage("Access configuration committed to GitHub.");
      await load(true);
      onRefresh();
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  async function syncCatalog() {
    setSyncingCatalog(true);
    try {
      const result = await jsonFetch("/api/github/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      setMessage(
        `Catalog synchronized: ${result.registered} registered, ${result.unregistered} unregistered across ${result.results.length} repositories.`,
      );
      await load();
      onRefresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setSyncingCatalog(false);
    }
  }
  if (!config || !draft)
    return <div className="page">Loading control plane…</div>;
  return (
    <div className="page settings-page">
      <div className="page-intro">
        <div>
          <p className="eyebrow">ADMINISTRATION</p>
          <h1>Control plane</h1>
          <p>
            Shape the portal through guided controls—no configuration syntax
            required.
          </p>
        </div>
      </div>
      <div className={`config-source-banner ${config.source.status}`}>
        <GitBranch size={17} />
        <div>
          <strong>
            {config.source.repository} · {config.source.branch}
          </strong>
          <small>
            {config.source.directory} ·{" "}
            {config.source.status === "ready"
              ? `Applied ${config.source.appliedSha?.slice(0, 7)}`
              : `Using ${config.source.appliedSha?.slice(0, 7) || "no cached revision"} — ${config.source.error}`}
          </small>
        </div>
        {config.source.appliedSha && (
          <a
            href={`https://github.com/${config.source.repository}/commit/${config.source.appliedSha}`}
            target="_blank"
            rel="noreferrer"
          >
            View commit <ExternalLink size={13} />
          </a>
        )}
      </div>
      <div className="control-ledger">
        <aside className="settings-rail">
          {[...sectionNames, "users", "audit"].map((item) => (
            <button
              className={tab === item ? "active" : ""}
              onClick={() => setTab(item)}
              key={item}
            >
              {item === "users" ? (
                <Users size={15} />
              ) : item === "integrations" ? (
                <Webhook size={15} />
              ) : (
                <Settings size={15} />
              )}
              <span>{item}</span>
            </button>
          ))}
        </aside>
        <section className="config-sheet">
          {sectionNames.includes(tab as Section) && draftSection !== tab && (
            <div className="settings-panel-loading">
              Loading {tab} settings…
            </div>
          )}
          {sectionNames.includes(tab as Section) && draftSection === tab && (
            <>
              <SheetHeader section={tab} source={config.source} />
              {remoteConflict && (
                <div className="config-conflict">
                  <strong>A newer Git revision is available.</strong>
                  <span>
                    Your unsaved draft was preserved. Reload before applying it
                    to the new revision.
                  </span>
                  <button onClick={() => load(true)}>Reload from Git</button>
                </div>
              )}
              {tab === "general" && (
                <GeneralBuilder value={draft} change={markDirty} />
              )}
              {tab === "catalog" && (
                <CatalogBuilder
                  value={draft}
                  change={markDirty}
                  sync={syncCatalog}
                  syncing={syncingCatalog}
                  canSync={!dirty && config.source.status === "ready"}
                />
              )}
              {tab === "scorecards" && (
                <ScorecardBuilder
                  value={draft}
                  change={markDirty}
                  services={services}
                  tiers={config.effective.catalog.tiers || []}
                  types={config.effective.catalog.types || []}
                  plugins={pluginCatalog}
                />
              )}
              {tab === "actions" && (
                <ActionBuilder value={draft} change={markDirty} />
              )}
              {tab === "tools" && (
                <ToolBuilder value={draft} change={markDirty} />
              )}
              {tab === "integrations" && (
                <>
                  <IntegrationBuilder
                    value={draft}
                    change={markDirty}
                    available={pluginCatalog}
                    scorecards={config.effective.scorecards.cards || []}
                  />
                  <IntegrationPanel status={status} deliveries={webhooks} />
                </>
              )}
              <div className="sheet-actions">
                <button
                  className="primary"
                  disabled={
                    !dirty ||
                    saving ||
                    config.source.status !== "ready" ||
                    remoteConflict
                  }
                  onClick={save}
                >
                  {saving ? "Committing…" : "Commit changes"}
                </button>
                <button
                  className="ghost-button"
                  disabled={saving || config.source.status !== "ready"}
                  onClick={reset}
                >
                  <RotateCcw size={14} />
                  Restore defaults
                </button>
              </div>
            </>
          )}
          {tab === "users" && (
            <UserPanel users={users} changeRole={changeRole} />
          )}
          {tab === "audit" && <AuditPanel events={audit} />}
          {message && (
            <div className="settings-message">
              {message}
              <button onClick={() => setMessage("")}>
                <X size={13} />
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SheetHeader({ section, source }: { section: string; source: any }) {
  return (
    <div className="sheet-head">
      <div>
        <p className="eyebrow">{section}</p>
        <h2>{section[0].toUpperCase() + section.slice(1)} configuration</h2>
      </div>
      <span
        className={`source-badge ${source.status === "ready" ? "" : "override"}`}
      >
        {source.status === "ready"
          ? source.files[section]?.sha
            ? `Git · ${source.files[section].sha.slice(0, 7)}`
            : "Git · new file"
          : "Last-known-good"}
      </span>
    </div>
  );
}
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: any;
}) {
  return (
    <label className="visual-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function GeneralBuilder({
  value,
  change,
}: {
  value: any;
  change: (x: any) => void;
}) {
  const set = (k: string, v: any) => change({ ...value, [k]: v });
  return (
    <div className="field-grid">
      <Field label="Portal name">
        <input
          value={value.name}
          onChange={(e) => set("name", e.target.value)}
        />
      </Field>
      <Field label="Accent color">
        <div className="color-field">
          <input
            type="color"
            value={value.accentColor}
            onChange={(e) => set("accentColor", e.target.value)}
          />
          <input
            value={value.accentColor}
            onChange={(e) => set("accentColor", e.target.value)}
          />
        </div>
      </Field>
      <Field label="Logo URL" hint="Leave empty to use the Perongen wordmark.">
        <input
          value={value.logoUrl}
          onChange={(e) => set("logoUrl", e.target.value)}
        />
      </Field>
      <Field label="Support URL">
        <input
          value={value.supportUrl}
          onChange={(e) => set("supportUrl", e.target.value)}
        />
      </Field>
      <Field label="Documentation URL">
        <input
          value={value.documentationUrl}
          onChange={(e) => set("documentationUrl", e.target.value)}
        />
      </Field>
    </div>
  );
}
function CatalogBuilder({
  value,
  change,
  sync,
  syncing,
  canSync,
}: {
  value: any;
  change: (x: any) => void;
  sync: () => void;
  syncing: boolean;
  canSync: boolean;
}) {
  const set = (k: string, v: any) => change({ ...value, [k]: v });
  const tiers = value.tiers || [];
  const types = value.types || [];
  const updateTier = (i: number, k: string, v: string) =>
    set(
      "tiers",
      tiers.map((tier: any, n: number) =>
        n === i ? { ...tier, [k]: v } : tier,
      ),
    );
  const updateType = (i: number, k: string, v: string) =>
    set(
      "types",
      types.map((type: any, n: number) =>
        n === i ? { ...type, [k]: v } : type,
      ),
    );
  return (
    <>
      <div className="field-grid">
        <Field
          label="Service metadata path"
          hint="Path within every installed repository."
        >
          <input
            value={value.serviceMetadataPath}
            onChange={(e) => set("serviceMetadataPath", e.target.value)}
          />
        </Field>
        <Field label="Team metadata path">
          <input
            value={value.teamMetadataPath}
            onChange={(e) => set("teamMetadataPath", e.target.value)}
          />
        </Field>
        <Field label="Accepted lifecycles" hint="Separate values with commas.">
          <input
            value={value.lifecycles.join(", ")}
            onChange={(e) =>
              set(
                "lifecycles",
                e.target.value
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean),
              )
            }
          />
        </Field>
        <Field
          label="GitHub installation ID"
          hint="Optional when GITHUB_INSTALLATION_ID is set at deployment."
        >
          <input
            type="number"
            value={value.installationId || ""}
            onChange={(e) =>
              set(
                "installationId",
                e.target.value ? Number(e.target.value) : null,
              )
            }
          />
        </Field>
      </div>
      <div className="tier-builder">
        <div className="input-builder-head">
          <div>
            <strong>Service tiers</strong>
            <small>
              Order tiers from highest to lowest operational criticality.
            </small>
          </div>
          <button
            className="text-button"
            onClick={() =>
              set("tiers", [
                ...tiers,
                {
                  id: `tier-${tiers.length + 1}`,
                  title: "New tier",
                  description: "",
                },
              ])
            }
          >
            <Plus size={13} />
            Add tier
          </button>
        </div>
        {tiers.length ? (
          tiers.map((tier: any, i: number) => (
            <div className="tier-definition" key={i}>
              <span className="tier-order">
                {String(i + 1).padStart(2, "0")}
              </span>
              <input
                aria-label="Tier ID"
                value={tier.id}
                placeholder="critical"
                onChange={(e) => updateTier(i, "id", e.target.value)}
              />
              <input
                aria-label="Tier title"
                value={tier.title}
                placeholder="Critical"
                onChange={(e) => updateTier(i, "title", e.target.value)}
              />
              <input
                aria-label="Tier description"
                value={tier.description}
                placeholder="Operational impact"
                onChange={(e) => updateTier(i, "description", e.target.value)}
              />
              <button
                className="delete-button"
                aria-label={`Delete ${tier.title}`}
                onClick={() =>
                  set(
                    "tiers",
                    tiers.filter((_: any, n: number) => n !== i),
                  )
                }
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        ) : (
          <div className="empty-inline">
            <ShieldCheck size={18} />
            <span>
              <strong>Tiering is disabled</strong>
              <small>
                Add a tier to classify services and scope scorecard checks.
              </small>
            </span>
          </div>
        )}
      </div>
      <div className="type-builder">
        <div className="input-builder-head">
          <div>
            <strong>Service types</strong>
            <small>Describe the architectural role of each service.</small>
          </div>
          <button
            className="text-button"
            onClick={() =>
              set("types", [
                ...types,
                {
                  id: `type-${types.length + 1}`,
                  title: "New type",
                  description: "",
                },
              ])
            }
          >
            <Plus size={13} />
            Add type
          </button>
        </div>
        {types.length ? (
          types.map((type: any, i: number) => (
            <div className="type-definition" key={i}>
              <input
                aria-label="Service type ID"
                value={type.id}
                placeholder="backend"
                onChange={(e) => updateType(i, "id", e.target.value)}
              />
              <input
                aria-label="Service type title"
                value={type.title}
                placeholder="Backend"
                onChange={(e) => updateType(i, "title", e.target.value)}
              />
              <input
                aria-label="Service type description"
                value={type.description}
                placeholder="Server-side service or API"
                onChange={(e) => updateType(i, "description", e.target.value)}
              />
              <button
                className="delete-button"
                aria-label={`Delete ${type.title}`}
                onClick={() =>
                  set(
                    "types",
                    types.filter((_: any, n: number) => n !== i),
                  )
                }
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        ) : (
          <div className="empty-inline">
            <ShieldCheck size={18} />
            <span>
              <strong>Service types are disabled</strong>
              <small>
                Add a type to classify services and scope scorecard checks.
              </small>
            </span>
          </div>
        )}
      </div>
      <div className="catalog-sync-card">
        <span>
          <Activity size={18} />
          <span>
            <strong>Synchronize installed repositories</strong>
            <small>
              Fetch the latest service and team metadata using the saved
              installation or deployment fallback.
            </small>
          </span>
        </span>
        <button
          className="ghost-button"
          disabled={!canSync || syncing}
          onClick={sync}
        >
          {syncing ? "Synchronizing…" : "Synchronize now"}
        </button>
        {!canSync && !syncing && (
          <em>Save or reload configuration changes before synchronizing.</em>
        )}
      </div>
    </>
  );
}

function ScorecardBuilder({
  value,
  change,
  services,
  tiers,
  types,
  plugins,
}: {
  value: any;
  change: (x: any) => void;
  services: any[];
  tiers: any[];
  types: any[];
  plugins: any[];
}) {
  const [selected, setSelected] = useState(0);
  const cards = value.cards || [];
  useEffect(() => {
    if (selected >= cards.length) setSelected(Math.max(0, cards.length - 1));
  }, [cards.length, selected]);
  const card = cards[selected];
  const setCards = (next: any[]) => change({ cards: next });
  const updateCard = (key: string, next: any) =>
    setCards(
      cards.map((item: any, index: number) =>
        index === selected ? { ...item, [key]: next } : item,
      ),
    );
  const updateRule = (index: number, key: string, next: any) =>
    updateCard(
      "rules",
      card.rules.map((rule: any, n: number) =>
        n === index ? { ...rule, [key]: next } : rule,
      ),
    );
  const toggleScope = (
    index: number,
    rule: any,
    key: "tiers" | "types",
    id: string,
  ) => {
    const current = rule[key] || [];
    const next = current.includes(id)
      ? current.filter((item: string) => item !== id)
      : [...current, id];
    updateRule(index, key, next.length ? next : undefined);
  };
  const addCard = () => {
    setCards([
      ...cards,
      {
        id: `scorecard-${cards.length + 1}`,
        title: "New scorecard",
        description: "",
        enabled: true,
        primary: cards.length === 0,
        rules: [],
      },
    ]);
    setSelected(cards.length);
  };
  const removeCard = () => {
    if (cards.length === 1) return;
    const wasPrimary = card.primary;
    const next = cards.filter((_: any, index: number) => index !== selected);
    if (wasPrimary) next[0] = { ...next[0], primary: true };
    setCards(next);
    setSelected(Math.max(0, selected - 1));
  };
  if (!card)
    return (
      <button className="ghost-button" onClick={addCard}>
        <Plus size={14} />
        Create scorecard
      </button>
    );
  return (
    <div className="scorecard-builder">
      <div className="scorecard-builder-tabs">
        {cards.map((item: any, index: number) => (
          <button
            className={index === selected ? "active" : ""}
            onClick={() => setSelected(index)}
            key={index}
          >
            <span>{item.primary ? "Primary" : "Scorecard"}</span>
            <strong>{item.title}</strong>
            <small>{item.rules.length} checks</small>
          </button>
        ))}
        <button className="add-scorecard" onClick={addCard}>
          <Plus size={15} />
          New scorecard
        </button>
      </div>
      <section className="scorecard-definition">
        <div className="field-grid">
          <Field label="Scorecard ID">
            <input
              value={card.id}
              onChange={(event) => updateCard("id", event.target.value)}
            />
          </Field>
          <Field label="Title">
            <input
              value={card.title}
              onChange={(event) => updateCard("title", event.target.value)}
            />
          </Field>
          <Field label="Description">
            <input
              value={card.description}
              onChange={(event) =>
                updateCard("description", event.target.value)
              }
            />
          </Field>
          <label className="toggle-field">
            <input
              type="checkbox"
              checked={card.enabled}
              disabled={card.primary}
              onChange={(event) => updateCard("enabled", event.target.checked)}
            />
            <span />
            Enabled
          </label>
        </div>
        <div className="scorecard-definition-actions">
          {card.primary ? (
            <span className="status-chip">
              <ShieldCheck size={13} />
              Primary catalog score
            </span>
          ) : (
            <button
              className="text-button"
              onClick={() =>
                setCards(
                  cards.map((item: any, index: number) => ({
                    ...item,
                    primary: index === selected,
                  })),
                )
              }
            >
              Make primary
            </button>
          )}
          <button
            className="delete-button labeled"
            disabled={cards.length === 1}
            onClick={removeCard}
          >
            <Trash2 size={13} />
            Delete scorecard
          </button>
        </div>
      </section>
      <div className="builder-list">
        <div className="builder-intro">
          <div>
            <ShieldCheck size={20} />
            <span>
              <strong>{card.title}</strong>
              <small>
                {card.rules.filter((rule: any) => rule.enabled).length} active
                rules · weights normalize per service
              </small>
            </span>
          </div>
          <button
            className="ghost-button"
            onClick={() =>
              updateCard("rules", [
                ...card.rules,
                {
                  id: `rule-${Date.now()}`,
                  title: "New check",
                  description: "",
                  path: "spec.owner",
                  operator: "present",
                  weight: 1,
                  severity: "recommended",
                  enabled: true,
                },
              ])
            }
          >
            <Plus size={14} />
            Add rule
          </button>
        </div>
        {card.rules.map((rule: any, index: number) => {
          const eligible = services.filter((service) =>
            ruleApplies(service.metadata, rule, service.plugins),
          );
          const passing = eligible.filter((service) =>
            evaluateRule(service.metadata, rule, service.plugins),
          ).length;
          return (
            <article className="builder-card" key={index}>
              <div className="builder-card-head">
                <div
                  className={rule.enabled ? "rule-state pass" : "rule-state"}
                >
                  {rule.enabled ? <Check size={14} /> : <Activity size={14} />}
                </div>
                <input
                  className="title-input"
                  value={rule.title}
                  onChange={(event) =>
                    updateRule(index, "title", event.target.value)
                  }
                />
                <span className="live-preview">
                  {eligible.length
                    ? `${passing}/${eligible.length} passing`
                    : "No applicable services"}
                </span>
                <button
                  className="delete-button"
                  onClick={() =>
                    updateCard(
                      "rules",
                      card.rules.filter((_: any, n: number) => n !== index),
                    )
                  }
                  aria-label="Delete rule"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="builder-fields">
                <Field label="Rule ID">
                  <input
                    value={rule.id}
                    onChange={(event) =>
                      updateRule(index, "id", event.target.value)
                    }
                  />
                </Field>
                <Field label="Data source">
                  <select
                    value={
                      rule.source?.kind === "plugin"
                        ? rule.source.plugin
                        : "metadata"
                    }
                    onChange={(event) =>
                      updateRule(
                        index,
                        "source",
                        event.target.value === "metadata"
                          ? undefined
                          : { kind: "plugin", plugin: event.target.value },
                      )
                    }
                  >
                    <option value="metadata">Service metadata</option>
                    {plugins
                      .filter((plugin) =>
                        plugin.surfaces?.includes("scorecards"),
                      )
                      .map((plugin) => (
                        <option value={plugin.id} key={plugin.id}>
                          {plugin.title}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Data field">
                  <input
                    value={rule.path}
                    placeholder={
                      rule.source?.kind === "plugin"
                        ? "lastRun.conclusion"
                        : "spec.owner"
                    }
                    onChange={(event) =>
                      updateRule(index, "path", event.target.value)
                    }
                  />
                </Field>
                <Field label="Condition">
                  <select
                    value={rule.operator}
                    onChange={(event) =>
                      updateRule(index, "operator", event.target.value)
                    }
                  >
                    {[
                      ["present", "Is present"],
                      ["equals", "Equals"],
                      ["oneOf", "Is one of"],
                      ["minLength", "Minimum length"],
                      ["contains", "Collection contains"],
                    ].map(([value, label]) => (
                      <option value={value} key={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                {rule.operator !== "present" && (
                  <Field label="Expected value">
                    <input
                      value={
                        Array.isArray(rule.value)
                          ? rule.value.join(", ")
                          : (rule.value ?? "")
                      }
                      onChange={(event) =>
                        updateRule(
                          index,
                          "value",
                          rule.operator === "oneOf"
                            ? event.target.value
                                .split(",")
                                .map((item) => item.trim())
                            : rule.operator === "minLength" ||
                                typeof rule.value === "number"
                              ? Number(event.target.value)
                              : event.target.value,
                        )
                      }
                    />
                  </Field>
                )}
                <Field label="Weight">
                  <input
                    type="number"
                    min="1"
                    value={rule.weight}
                    onChange={(event) =>
                      updateRule(index, "weight", Number(event.target.value))
                    }
                  />
                </Field>
                <Field label="Severity">
                  <select
                    value={rule.severity}
                    onChange={(event) =>
                      updateRule(index, "severity", event.target.value)
                    }
                  >
                    <option value="required">Required</option>
                    <option value="recommended">Recommended</option>
                  </select>
                </Field>
                <label className="toggle-field">
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={(event) =>
                      updateRule(index, "enabled", event.target.checked)
                    }
                  />
                  <span />
                  Enabled
                </label>
                <Field label="How to fix">
                  <input
                    value={rule.remediation?.guidance || ""}
                    placeholder="Explain the smallest safe change"
                    onChange={(event) =>
                      updateRule(
                        index,
                        "remediation",
                        event.target.value
                          ? {
                              ...(rule.remediation || {}),
                              guidance: event.target.value,
                            }
                          : undefined,
                      )
                    }
                  />
                </Field>
                {rule.remediation && (
                  <>
                    <Field label="Remediation documentation">
                      <input
                        type="url"
                        value={rule.remediation.docsUrl || ""}
                        placeholder="https://docs.example.com/standard"
                        onChange={(event) =>
                          updateRule(index, "remediation", {
                            ...rule.remediation,
                            docsUrl: event.target.value || undefined,
                          })
                        }
                      />
                    </Field>
                    {rule.source?.kind !== "plugin" && (
                      <Field label="Automatic fix value">
                        <input
                          value={
                            rule.remediation.suggestedValue === undefined
                              ? ""
                              : String(rule.remediation.suggestedValue)
                          }
                          placeholder="Optional value for a GitHub fix PR"
                          onChange={(event) =>
                            updateRule(index, "remediation", {
                              ...rule.remediation,
                              suggestedValue:
                                event.target.value === ""
                                  ? undefined
                                  : event.target.value,
                            })
                          }
                        />
                      </Field>
                    )}
                  </>
                )}
                {tiers.length > 0 && (
                  <div className="tier-scope-picker">
                    <span>Tier scope</span>
                    <label className={!rule.tiers?.length ? "selected" : ""}>
                      <input
                        type="checkbox"
                        checked={!rule.tiers?.length}
                        onChange={() => updateRule(index, "tiers", undefined)}
                      />
                      All tiers
                    </label>
                    {tiers.map((tier) => (
                      <label
                        className={
                          rule.tiers?.includes(tier.id) ? "selected" : ""
                        }
                        key={tier.id}
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(rule.tiers?.includes(tier.id))}
                          onChange={() =>
                            toggleScope(index, rule, "tiers", tier.id)
                          }
                        />
                        {tier.title}
                      </label>
                    ))}
                  </div>
                )}
                {types.length > 0 && (
                  <div className="type-scope-picker">
                    <span>Type scope</span>
                    <label className={!rule.types?.length ? "selected" : ""}>
                      <input
                        type="checkbox"
                        checked={!rule.types?.length}
                        onChange={() => updateRule(index, "types", undefined)}
                      />
                      All types
                    </label>
                    {types.map((type) => (
                      <label
                        className={
                          rule.types?.includes(type.id) ? "selected" : ""
                        }
                        key={type.id}
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(rule.types?.includes(type.id))}
                          onChange={() =>
                            toggleScope(index, rule, "types", type.id)
                          }
                        />
                        {type.title}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function ActionBuilder({
  value,
  change,
}: {
  value: any;
  change: (x: any) => void;
}) {
  const update = (i: number, k: string, v: any) =>
    change({
      definitions: value.definitions.map((a: any, n: number) =>
        n === i ? { ...a, [k]: v, version: a.version + 1 } : a,
      ),
    });
  const updateInput = (i: number, j: number, k: string, v: any) =>
    update(
      i,
      "inputs",
      value.definitions[i].inputs.map((x: any, n: number) =>
        n === j ? { ...x, [k]: v } : x,
      ),
    );
  return (
    <div className="builder-list">
      <div className="builder-intro">
        <div>
          <GitBranch size={20} />
          <span>
            <strong>GitHub workflow actions</strong>
            <small>Only enabled and published actions appear to members.</small>
          </span>
        </div>
        <button
          className="ghost-button"
          onClick={() =>
            change({
              definitions: [
                ...value.definitions,
                {
                  id: `action-${Date.now()}`,
                  title: "New workflow action",
                  description: "",
                  repository: "org/repo",
                  workflow: "workflow.yml",
                  confirmation: "Run this action?",
                  enabled: true,
                  published: false,
                  inputs: [],
                  version: 1,
                },
              ],
            })
          }
        >
          <Plus size={14} />
          Add action
        </button>
      </div>
      {value.definitions.map((a: any, i: number) => (
        <article className="builder-card action-builder" key={`${a.id}-${i}`}>
          <div className="builder-card-head">
            <div className="action-monogram">
              {a.title.slice(0, 2).toUpperCase()}
            </div>
            <input
              className="title-input"
              value={a.title}
              onChange={(e) => update(i, "title", e.target.value)}
            />
            <span className={`publish-state ${a.published ? "live" : ""}`}>
              {a.published ? "Published" : "Draft"}
            </span>
            <button
              className="delete-button"
              onClick={() =>
                change({
                  definitions: value.definitions.filter(
                    (_: any, n: number) => n !== i,
                  ),
                })
              }
            >
              <Trash2 size={14} />
            </button>
          </div>
          <div className="builder-fields">
            <Field label="Action ID">
              <input
                value={a.id}
                onChange={(e) => update(i, "id", e.target.value)}
              />
            </Field>
            <Field label="Repository">
              <input
                value={a.repository}
                placeholder="org/repository"
                onChange={(e) => update(i, "repository", e.target.value)}
              />
            </Field>
            <Field label="Workflow file">
              <input
                value={a.workflow}
                placeholder="provision.yml"
                onChange={(e) => update(i, "workflow", e.target.value)}
              />
            </Field>
            <Field label="Confirmation message">
              <input
                value={a.confirmation}
                onChange={(e) => update(i, "confirmation", e.target.value)}
              />
            </Field>
            <label className="toggle-field">
              <input
                type="checkbox"
                checked={a.enabled}
                onChange={(e) => update(i, "enabled", e.target.checked)}
              />
              <span />
              Enabled
            </label>
            <label className="toggle-field">
              <input
                type="checkbox"
                checked={a.published}
                onChange={(e) => update(i, "published", e.target.checked)}
              />
              <span />
              Published
            </label>
          </div>
          <Field label="Description">
            <textarea
              value={a.description}
              onChange={(e) => update(i, "description", e.target.value)}
            />
          </Field>
          <div className="input-builder-head">
            <strong>Workflow inputs</strong>
            <button
              className="text-button"
              onClick={() =>
                update(i, "inputs", [
                  ...a.inputs,
                  {
                    id: `input${a.inputs.length + 1}`,
                    label: "New input",
                    type: "text",
                    required: false,
                    placeholder: "",
                  },
                ])
              }
            >
              <Plus size={13} />
              Add input
            </button>
          </div>
          {a.inputs.map((input: any, j: number) => (
            <div className="action-input-row" key={j}>
              <input
                value={input.label}
                aria-label="Input label"
                onChange={(e) => updateInput(i, j, "label", e.target.value)}
              />
              <input
                value={input.id}
                aria-label="Workflow input name"
                onChange={(e) => updateInput(i, j, "id", e.target.value)}
              />
              <select
                value={input.type}
                onChange={(e) => updateInput(i, j, "type", e.target.value)}
              >
                {["text", "multiline", "number", "boolean", "select"].map(
                  (t) => (
                    <option key={t}>{t}</option>
                  ),
                )}
              </select>
              {input.type === "select" && (
                <input
                  value={(input.options || []).join(", ")}
                  placeholder="Options"
                  onChange={(e) =>
                    updateInput(
                      i,
                      j,
                      "options",
                      e.target.value
                        .split(",")
                        .map((x) => x.trim())
                        .filter(Boolean),
                    )
                  }
                />
              )}
              <label className="mini-check">
                <input
                  type="checkbox"
                  checked={input.required}
                  onChange={(e) =>
                    updateInput(i, j, "required", e.target.checked)
                  }
                />
                Required
              </label>
              <button
                className="delete-button"
                onClick={() =>
                  update(
                    i,
                    "inputs",
                    a.inputs.filter((_: any, n: number) => n !== j),
                  )
                }
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </article>
      ))}
    </div>
  );
}

function ToolBuilder({
  value,
  change,
}: {
  value: any;
  change: (x: any) => void;
}) {
  const update = (i: number, k: string, v: any) =>
    change({
      items: value.items.map((tool: any, n: number) =>
        n === i ? { ...tool, [k]: v } : tool,
      ),
    });
  const updateDestination = (i: number, j: number, k: string, v: string) =>
    update(
      i,
      "destinations",
      value.items[i].destinations.map((destination: any, n: number) =>
        n === j ? { ...destination, [k]: v } : destination,
      ),
    );
  return (
    <div className="builder-list">
      <div className="builder-intro">
        <div>
          <Link2 size={20} />
          <span>
            <strong>Shared developer tools</strong>
            <small>Global destinations shown to everyone in the portal.</small>
          </span>
        </div>
        <button
          className="ghost-button"
          onClick={() =>
            change({
              items: [
                ...value.items,
                {
                  id: `tool-${Date.now()}`,
                  name: "New tool",
                  description: "",
                  iconUrl: "",
                  destinations: [
                    { label: "Open tool", url: "https://example.com" },
                  ],
                },
              ],
            })
          }
        >
          <Plus size={14} />
          Add tool
        </button>
      </div>
      {value.items.map((tool: any, i: number) => (
        <article className="builder-card tool-builder" key={`${tool.id}-${i}`}>
          <div className="builder-card-head">
            <div className="action-monogram">
              {tool.name
                .split(/\s+/)
                .map((part: string) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <input
              className="title-input"
              value={tool.name}
              aria-label="Tool name"
              onChange={(e) => update(i, "name", e.target.value)}
            />
            <button
              className="delete-button"
              aria-label={`Delete ${tool.name}`}
              onClick={() =>
                change({
                  items: value.items.filter((_: any, n: number) => n !== i),
                })
              }
            >
              <Trash2 size={14} />
            </button>
          </div>
          <div className="builder-fields tool-fields">
            <Field label="Tool ID">
              <input
                value={tool.id}
                onChange={(e) => update(i, "id", e.target.value)}
              />
            </Field>
            <Field
              label="Custom icon URL"
              hint="Optional. The generated monogram is used when empty."
            >
              <input
                value={tool.iconUrl}
                placeholder="https://…"
                onChange={(e) => update(i, "iconUrl", e.target.value)}
              />
            </Field>
          </div>
          <Field label="Description">
            <textarea
              value={tool.description}
              onChange={(e) => update(i, "description", e.target.value)}
            />
          </Field>
          <div className="input-builder-head">
            <div>
              <strong>Destinations</strong>
              <small>
                Use labels such as Development, Staging, or Production.
              </small>
            </div>
            <button
              className="text-button"
              onClick={() =>
                update(i, "destinations", [
                  ...tool.destinations,
                  { label: "New destination", url: "https://example.com" },
                ])
              }
            >
              <Plus size={13} />
              Add destination
            </button>
          </div>
          {tool.destinations.map((destination: any, j: number) => (
            <div className="tool-destination-row" key={j}>
              <input
                value={destination.label}
                aria-label="Destination label"
                placeholder="Production"
                onChange={(e) =>
                  updateDestination(i, j, "label", e.target.value)
                }
              />
              <input
                value={destination.url}
                aria-label="Destination URL"
                placeholder="https://…"
                onChange={(e) => updateDestination(i, j, "url", e.target.value)}
              />
              <button
                className="delete-button"
                aria-label={`Delete ${destination.label}`}
                disabled={tool.destinations.length === 1}
                onClick={() =>
                  update(
                    i,
                    "destinations",
                    tool.destinations.filter((_: any, n: number) => n !== j),
                  )
                }
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </article>
      ))}
    </div>
  );
}

function IntegrationBuilder({
  value,
  change,
  available,
  scorecards,
}: {
  value: any;
  change: (x: any) => void;
  available: any[];
  scorecards: any[];
}) {
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState("");
  const [preparedScorecards, setPreparedScorecards] = useState<string[]>([]);
  const refresh = async () => {
    setRefreshing(true);
    setRefreshMessage("");
    try {
      await jsonFetch("/api/admin/plugins/refresh", { method: "POST" });
      setRefreshMessage("Plugin data refreshed.");
    } catch (error) {
      setRefreshMessage((error as Error).message);
    } finally {
      setRefreshing(false);
    }
  };
  const configured = value.plugins || [];
  const setPlugin = (id: string, next: any) => {
    const exists = configured.some((plugin: any) => plugin.id === id);
    change({
      plugins: exists
        ? configured.map((plugin: any) => (plugin.id === id ? next : plugin))
        : [...configured, next],
    });
  };
  const pluginFields: Record<
    string,
    Array<{
      key: string;
      label: string;
      hint: string;
      defaultValue: number;
      max: number;
    }>
  > = {
    "github-actions": [
      {
        key: "lookbackDays",
        label: "Lookback period",
        hint: "Days of workflow history to include.",
        defaultValue: 30,
        max: 365,
      },
      {
        key: "maximumRuns",
        label: "Maximum runs",
        hint: "Recent runs retained per service.",
        defaultValue: 20,
        max: 100,
      },
    ],
    "github-pull-requests": [
      {
        key: "staleAfterDays",
        label: "Stale after",
        hint: "Days without an update before a pull request needs attention.",
        defaultValue: 14,
        max: 365,
      },
      {
        key: "maximumPullRequests",
        label: "Maximum pull requests",
        hint: "Open pull requests retained per service.",
        defaultValue: 30,
        max: 100,
      },
    ],
    "github-deployments": [
      {
        key: "maximumDeployments",
        label: "Maximum deployments",
        hint: "Recent deployments retained per service.",
        defaultValue: 20,
        max: 100,
      },
    ],
    "github-maintenance": [
      {
        key: "staleAfterDays",
        label: "Stale issue threshold",
        hint: "Days without an update before an issue is stale.",
        defaultValue: 30,
        max: 365,
      },
    ],
  };
  return (
    <div className="plugin-admin">
      <div className="plugin-admin-intro">
        <div>
          <p className="eyebrow">PLUGIN CATALOG</p>
          <h3>Connected signals</h3>
          <p>
            Enable contained providers and choose where operational data enters
            the portal.
          </p>
        </div>
        <div className="signal-rail">
          <span>Health</span>
          <i />
          <span>Services</span>
          <i />
          <span>Scorecards</span>
          <button
            className="text-button"
            disabled={refreshing}
            onClick={refresh}
          >
            {refreshing ? "Refreshing…" : "Refresh data"}
          </button>
        </div>
      </div>
      {refreshMessage && (
        <div className="settings-message inline">{refreshMessage}</div>
      )}
      {available.map((manifest) => {
        const current = configured.find(
          (plugin: any) => plugin.id === manifest.id,
        ) || {
          id: manifest.id,
          enabled: false,
          config: manifest.defaults || manifest.config || {},
        };
        const updateConfig = (key: string, next: number) =>
          setPlugin(manifest.id, {
            ...current,
            config: { ...current.config, [key]: next },
          });
        return (
          <article
            className={`plugin-admin-card ${current.enabled ? "enabled" : ""}`}
            key={manifest.id}
          >
            <div className="plugin-admin-mark">
              <GitBranch size={20} />
            </div>
            <div className="plugin-admin-copy">
              <div>
                <span>{manifest.version}</span>
                <h4>{manifest.title}</h4>
                <p>{manifest.description}</p>
                {manifest.defaultScorecards?.map((card: any) => {
                  const configured = scorecards.some(
                    (candidate: any) => candidate.id === card.id,
                  );
                  return (
                    <div className="plugin-contribution" key={card.id}>
                      <ShieldCheck size={13} />
                      <span>
                        {configured
                          ? `${card.title} scorecard configured`
                          : preparedScorecards.includes(card.id)
                            ? `${card.title} will be added with this commit`
                            : current.enabled
                              ? `${card.title} is not in scorecards.yaml`
                              : `Adds the ${card.title} scorecard when enabled`}
                      </span>
                      {current.enabled &&
                        !configured &&
                        !preparedScorecards.includes(card.id) && (
                          <button
                            className="text-button"
                            onClick={() => {
                              setPreparedScorecards((items) => [
                                ...new Set([...items, card.id]),
                              ]);
                              change({ ...value });
                            }}
                          >
                            Add on commit
                          </button>
                        )}
                    </div>
                  );
                })}
              </div>
              <div className="plugin-surfaces">
                {manifest.surfaces.map((surface: string) => (
                  <span key={surface}>{surface}</span>
                ))}
              </div>
            </div>
            <div
              className={`plugin-health ${manifest.health?.status || "disabled"}`}
            >
              <i />
              <span>
                <strong>{manifest.health?.status || "disabled"}</strong>
                <small>{manifest.health?.message}</small>
              </span>
            </div>
            <label className="plugin-switch">
              <input
                type="checkbox"
                checked={current.enabled}
                onChange={(event) =>
                  setPlugin(manifest.id, {
                    ...current,
                    enabled: event.target.checked,
                  })
                }
              />
              <span />
              {current.enabled ? "Enabled" : "Disabled"}
            </label>
            {current.enabled && Boolean(pluginFields[manifest.id]?.length) && (
              <div className="plugin-config-fields">
                {pluginFields[manifest.id].map((field) => (
                  <Field label={field.label} hint={field.hint} key={field.key}>
                    <input
                      type="number"
                      min="1"
                      max={field.max}
                      value={current.config[field.key] ?? field.defaultValue}
                      onChange={(event) =>
                        updateConfig(field.key, Number(event.target.value))
                      }
                    />
                  </Field>
                ))}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function IntegrationPanel({
  status,
  deliveries,
}: {
  status: any;
  deliveries: any[];
}) {
  return (
    <>
      <div className="sheet-head">
        <div>
          <p className="eyebrow">CONNECTIONS</p>
          <h2>Integration health</h2>
        </div>
      </div>
      <div className="integration-gates">
        {[
          ["Database", status.database],
          ["GitHub App", status.configured],
          ["GitHub OAuth", status.oauth],
        ].map(([name, ok]) => (
          <div className="secret-status" key={String(name)}>
            <span className={ok ? "pulse" : "pulse offline"} />
            <div>
              <strong>{name}</strong>
              <small>
                {ok ? "Configured securely" : "Missing deployment secret"}
              </small>
            </div>
          </div>
        ))}
      </div>
      <div className="subsection-head">
        <div>
          <h3>Webhook deliveries</h3>
          <p>Recent repository events received from GitHub.</p>
        </div>
        <code>/api/github/webhook</code>
      </div>
      {deliveries.length ? (
        deliveries.map((d) => (
          <div className="webhook-row" key={d.id}>
            <span className={`delivery-state ${d.status}`}>{d.status}</span>
            <div>
              <strong>
                {d.event} · {d.repository || "GitHub App"}
              </strong>
              <small>
                {d.action || "event"}
                {d.message ? ` — ${d.message}` : ""}
              </small>
            </div>
            <time>{formatTime(d.created_at)}</time>
          </div>
        ))
      ) : (
        <div className="empty-inline">
          <Webhook size={18} />
          <span>
            <strong>No deliveries received</strong>
            <small>
              Configure the URL and webhook secret in your GitHub App.
            </small>
          </span>
        </div>
      )}
    </>
  );
}
function UserPanel({
  users,
  changeRole,
}: {
  users: any[];
  changeRole: (l: string, r: string) => void;
}) {
  return (
    <>
      <div className="sheet-head">
        <div>
          <p className="eyebrow">ACCESS</p>
          <h2>Portal users</h2>
        </div>
      </div>
      {users.map((u) => (
        <div className="admin-user" key={u.login}>
          <img src={u.avatar_url} />
          <div>
            <strong>{u.name}</strong>
            <small>
              @{u.login}
              {u.breakGlass ? " · deployment break-glass" : ""}
            </small>
          </div>
          <select
            value={u.role}
            disabled={u.breakGlass}
            onChange={(e) => changeRole(u.login, e.target.value)}
          >
            <option value="member">Member</option>
            <option value="admin">Administrator</option>
          </select>
        </div>
      ))}
    </>
  );
}
function AuditPanel({ events }: { events: any[] }) {
  return (
    <>
      <div className="sheet-head">
        <div>
          <p className="eyebrow">GOVERNANCE</p>
          <h2>Audit ledger</h2>
        </div>
      </div>
      {events.map((e) => (
        <div className="audit-row" key={e.id}>
          <span>{e.category}</span>
          <div>
            <strong>{e.action}</strong>
            <small>
              {e.actor_login} · {e.target}
            </small>
          </div>
          <time>{formatTime(e.created_at)}</time>
        </div>
      ))}
    </>
  );
}
