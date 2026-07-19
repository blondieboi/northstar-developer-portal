import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  Circle,
  Database,
  ExternalLink,
  GitBranch,
  Radar,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { safeExternalUrl } from "./safe-url";

type SetupState = {
  checks: Record<string, boolean>;
  complete: boolean;
  stats: { users: number; services: number; syncs: number };
  installationId: number | null;
  webhookUrl: string;
  webhookUrlPublic: boolean;
  missingDeployment: string[];
  configSource: {
    status: string;
    error: string | null;
    appliedSha: string | null;
  };
};

const setupGuide =
  "https://blondieboi.github.io/perongen-developer-portal/admin/deployment";

const gates = [
  {
    id: "foundation",
    title: "Secure the foundation",
    body: "Verify the deployment connections and the canonical configuration revision.",
    keys: [
      "database",
      "githubApp",
      "oauth",
      "webhookSecret",
      "configRepository",
      "configRevision",
    ],
    icon: Database,
  },
  {
    id: "identity",
    title: "Connect GitHub",
    body: "Confirm the bootstrap administrator and choose the GitHub App installation Perongen should inspect.",
    keys: ["administrator", "installation"],
    icon: ShieldCheck,
  },
  {
    id: "catalog",
    title: "Catalog one service",
    body: "Synchronize repository metadata or use Application Intake to open the first onboarding pull request.",
    keys: ["firstSync", "firstService"],
    icon: Radar,
  },
  {
    id: "experience",
    title: "See the first standard",
    body: "Confirm that at least one enabled scorecard is evaluating the catalog. Workflows can be published later.",
    keys: ["scorecard"],
    icon: Sparkles,
  },
];

async function readJson(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || fallback);
  return body;
}

function checkLabel(key: string) {
  const labels: Record<string, string> = {
    database: "Database connection",
    githubApp: "GitHub App credentials",
    oauth: "GitHub sign-in",
    webhookSecret: "Webhook signature secret",
    configRepository: "Configuration repository",
    configRevision: "Validated configuration revision",
    administrator: "Bootstrap administrator",
    installation: "Catalog installation",
    firstSync: "First catalog synchronization",
    firstService: "First service registered",
    scorecard: "Enabled scorecard",
  };
  return labels[key] || key.replace(/([A-Z])/g, " $1");
}

export function OnboardingGate({
  user,
  onRefresh,
  onOpenSettings,
  onOpenIntake,
}: {
  user: any;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onOpenIntake: () => void;
}) {
  const [state, setState] = useState<SetupState | null>(null);
  const [open, setOpen] = useState(false);
  const [selectedGate, setSelectedGate] = useState<number | null>(null);
  const [installation, setInstallation] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [documentationUrl, setDocumentationUrl] = useState(setupGuide);

  async function load() {
    setLoadError("");
    try {
      const [nextState, portal] = await Promise.all([
        fetch("/api/onboarding").then((response) =>
          readJson(response, "Setup readiness could not be checked"),
        ),
        fetch("/api/portal").then((response) =>
          readJson(response, "Portal configuration could not be loaded"),
        ),
      ]);
      const typedState = nextState as SetupState;
      setState(typedState);
      setInstallation(
        typedState.installationId
          ? String(typedState.installationId)
          : "",
      );
      const docsRoot = String(portal?.general?.documentationUrl || "").replace(
        /\/$/,
        "",
      );
      setDocumentationUrl(docsRoot || setupGuide);
      if (
        user?.role === "admin" &&
        !typedState.complete &&
        !sessionStorage.getItem("perongen-onboarding-dismissed")
      )
        setOpen(true);
    } catch (error) {
      setLoadError((error as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, [user?.role]);

  const nextIncomplete = useMemo(
    () =>
      state
        ? Math.max(
            0,
            gates.findIndex((gate) =>
              gate.keys.some((key) => !state.checks[key]),
            ),
          )
        : 0,
    [state],
  );
  const active = selectedGate ?? nextIncomplete;
  const completedGates = state
    ? gates.filter((gate) => gate.keys.every((key) => state.checks[key])).length
    : 0;
  const validInstallation = /^\d+$/.test(installation) && Number(installation) > 0;

  async function synchronize(saveInstallation: boolean) {
    if (!validInstallation) return;
    setWorking(true);
    setMessage("");
    try {
      if (saveInstallation) {
        const config = await fetch("/api/admin/config").then((response) =>
          readJson(response, "Catalog settings could not be loaded"),
        );
        const value = {
          ...config.effective.catalog,
          installationId: Number(installation),
        };
        await fetch("/api/admin/config/catalog", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ value }),
        }).then((response) =>
          readJson(response, "The GitHub installation could not be saved"),
        );
      }
      const result = await fetch("/api/github/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ installationId: Number(installation) }),
      }).then((response) =>
        readJson(response, "The catalog could not be synchronized"),
      );
      setMessage(
        result.registered
          ? `Registered ${result.registered} service${result.registered === 1 ? "" : "s"}.`
          : "Synchronization finished. No repository metadata was found yet.",
      );
      setSelectedGate(null);
      await load();
      onRefresh();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setWorking(false);
    }
  }

  if (user?.role !== "admin" || state?.complete) return null;
  if (!state)
    return loadError ? (
      <button className="setup-launcher setup-launcher-error" onClick={load}>
        <Radar size={15} />
        <span>Retry setup check</span>
      </button>
    ) : null;

  const gate = gates[active];
  return (
    <>
      {!open && (
        <button className="setup-launcher" onClick={() => setOpen(true)}>
          <Radar size={15} />
          <span>Finish portal setup</span>
          <b>
            {completedGates}/{gates.length}
          </b>
        </button>
      )}
      {open && (
        <div className="onboarding-wrap">
          <div className="onboarding-scrim" />
          <section
            className="onboarding"
            role="dialog"
            aria-modal="true"
            aria-labelledby="onboarding-title"
          >
            <button
              className="onboarding-close"
              aria-label="Close setup"
              onClick={() => {
                sessionStorage.setItem("perongen-onboarding-dismissed", "1");
                setOpen(false);
              }}
            >
              <X size={18} />
            </button>
            <header className="onboarding-head">
              <div className="flight-mark">
                <Radar size={24} />
              </div>
              <div>
                <p className="eyebrow">FIRST-RUN SETUP</p>
                <h1 id="onboarding-title">Bring Perongen online.</h1>
                <p>
                  Four live gates take you from deployment to the first scored
                  repository.
                </p>
              </div>
            </header>
            <div className="flight-path" aria-label="Setup gates">
              {gates.map((item, index) => {
                const done = item.keys.every((key) => state.checks[key]);
                const Icon = item.icon;
                return (
                  <button
                    className={`${done ? "done" : ""} ${active === index ? "active" : ""}`}
                    aria-current={active === index ? "step" : undefined}
                    onClick={() => setSelectedGate(index)}
                    key={item.id}
                  >
                    <span>{done ? <Check size={14} /> : <Icon size={14} />}</span>
                    <small>Gate {index + 1}</small>
                    <strong>{item.title}</strong>
                  </button>
                );
              })}
            </div>
            <div className="gate-detail">
              <div className="gate-copy">
                <p className="eyebrow">GATE {active + 1}</p>
                <h2>{gate.title}</h2>
                <p>{gate.body}</p>
                {gate.keys.map((key) => (
                  <div
                    className={`readiness-row ${state.checks[key] ? "ready" : "pending"}`}
                    key={key}
                  >
                    {state.checks[key] ? (
                      <Check size={15} />
                    ) : (
                      <Circle size={15} />
                    )}
                    <span>{checkLabel(key)}</span>
                    <strong>
                      {state.checks[key] ? "Ready" : "Needs attention"}
                    </strong>
                  </div>
                ))}
              </div>
              <aside className="gate-action">
                {active === 0 && <Foundation state={state} checkAgain={load} />}
                {active === 1 && (
                  <>
                    <ShieldCheck size={28} />
                    <h3>Catalog installation</h3>
                    <p>
                      Use the number at the end of the GitHub App installation
                      URL. Perongen saves it to catalog configuration and runs
                      the first synchronization.
                    </p>
                    <label className="gate-input-label" htmlFor="setup-installation">
                      Installation ID
                    </label>
                    <input
                      id="setup-installation"
                      value={installation}
                      onChange={(event) =>
                        setInstallation(event.target.value.replace(/\D/g, ""))
                      }
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="145753228"
                    />
                    <button
                      className="primary"
                      disabled={!validInstallation || working}
                      onClick={() => synchronize(true)}
                    >
                      {working ? "Connecting…" : "Save and synchronize"}{" "}
                      <ArrowRight size={14} />
                    </button>
                  </>
                )}
                {active === 2 && (
                  <>
                    <Radar size={28} />
                    <h3>Register the first service</h3>
                    <p>
                      Synchronize repositories that already contain metadata,
                      or let Application Intake prepare a reviewed onboarding
                      pull request from repository evidence.
                    </p>
                    <div className="gate-action-stack">
                      <button
                        className="primary"
                        onClick={() => {
                          setOpen(false);
                          onOpenIntake();
                        }}
                      >
                        Open Application Intake <ArrowRight size={14} />
                      </button>
                      <button
                        className="ghost-button"
                        disabled={!validInstallation || working}
                        onClick={() => synchronize(false)}
                      >
                        {working ? "Synchronizing…" : "Synchronize again"}
                      </button>
                    </div>
                  </>
                )}
                {active === 3 && (
                  <>
                    <Sparkles size={28} />
                    <h3>Make the standard yours</h3>
                    <p>
                      Perongen ships with metadata quality enabled. Review its
                      checks, then add repository standards or publish a
                      workflow when the team is ready.
                    </p>
                    <button
                      className="primary"
                      onClick={() => {
                        setOpen(false);
                        onOpenSettings();
                      }}
                    >
                      Review scorecards <ArrowRight size={14} />
                    </button>
                  </>
                )}
                <a
                  className="onboarding-doc-link"
                  href={safeExternalUrl(documentationUrl) || undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open setup documentation <ExternalLink size={12} />
                </a>
                {message && (
                  <div className="onboarding-message" role="status">
                    {message}
                  </div>
                )}
              </aside>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function Foundation({
  state,
  checkAgain,
}: {
  state: SetupState;
  checkAgain: () => void;
}) {
  const configBlocked = state.configSource.status !== "ready";
  return (
    <>
      <GitBranch size={28} />
      <h3>
        {state.missingDeployment.length === 1
          ? "One deployment setting is missing"
          : state.missingDeployment.length
            ? "Deployment settings are missing"
            : configBlocked
              ? "Configuration needs attention"
              : "Deployment foundation is ready"}
      </h3>
      {state.missingDeployment.length ? (
        <>
          <p>Add these values to Perongen’s deployment environment:</p>
          <ul className="deployment-missing-list">
            {state.missingDeployment.map((name) => (
              <li key={name}>
                <code>{name}</code>
              </li>
            ))}
          </ul>
          {state.missingDeployment.includes("GITHUB_WEBHOOK_SECRET") && (
            <p>
              Use the same strong value in the deployment and the GitHub App’s
              webhook settings.
            </p>
          )}
        </>
      ) : configBlocked ? (
        <div className="configuration-diagnostic" role="alert">
          <strong>Configuration status: {state.configSource.status}</strong>
          <span>
            {state.configSource.error ||
              "Perongen has not applied a valid configuration revision yet."}
          </span>
        </div>
      ) : (
        <p>
          Deployment settings are available and revision{" "}
          <code>{state.configSource.appliedSha?.slice(0, 7)}</code> is active.
        </p>
      )}
      <div className="webhook-address">
        <small>GitHub App webhook URL</small>
        <code>{state.webhookUrl}</code>
      </div>
      {!state.webhookUrlPublic && (
        <p>
          <strong>This localhost URL is not reachable by GitHub.</strong> Set{" "}
          <code>PUBLIC_URL</code> to a public HTTPS tunnel or deployment URL.
        </p>
      )}
      <p>
        Subscribe the GitHub App to <strong>Push</strong>,{" "}
        <strong>Pull request</strong>, and <strong>Workflow run</strong> events,
        restart Perongen after environment changes, then check again.
      </p>
      <button className="ghost-button" onClick={checkAgain}>
        Check again
      </button>
    </>
  );
}
