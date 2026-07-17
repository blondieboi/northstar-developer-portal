import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  BellRing,
  BookOpen,
  Box,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  Command,
  ExternalLink,
  FileCode2,
  GitBranch,
  LayoutGrid,
  Link2,
  Menu,
  Megaphone,
  Moon,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  TerminalSquare,
  Users,
  X,
  Zap,
  BarChart3,
} from "lucide-react";
import { ConfiguredActions, ConfiguredScorecards } from "./ControlPlane";
import { OnboardingGate } from "./Onboarding";
import { VisualSettings } from "./VisualSettings";
import {
  applicableRules,
  evaluateRule,
  type ScorecardDefinition,
  type ScorecardRule,
} from "./scorecards";
import { PluginServiceSections, type PublicPlugin } from "./plugins/registry";
import { CommandPalette } from "./CommandPalette";
import { EngineeringInbox } from "./EngineeringInbox";
import { ScoreHistory } from "./ScoreHistory";
import { ResourceGraph } from "./ResourceGraph";
import { DocumentationHub, ServiceDocumentation } from "./DocumentationHub";
import { ServiceOperations } from "./ServiceOperations";
import { StandardsChecks } from "./StandardsRemediation";
import { AnalyticsPage, CampaignsPage } from "./AdminPlatform";
import { trackPortalEvent } from "./telemetry";

type View =
  | "overview"
  | "inbox"
  | "catalog"
  | "map"
  | "docs"
  | "service"
  | "team"
  | "scorecards"
  | "actions"
  | "tools"
  | "teams"
  | "people"
  | "integrations"
  | "campaigns"
  | "analytics"
  | "settings";
type User = {
  id: string;
  login: string;
  name: string;
  avatar_url: string;
  avatarUrl?: string;
  email?: string;
  bio?: string;
  role: string;
  last_seen_at: string;
  primary_team?: string | null;
  primaryTeam?: string | null;
  teams: { name: string; title: string }[];
};
type Team = {
  id: string;
  name: string;
  title: string;
  description: string;
  member_count: number;
  service_count: number;
  links: { name: string; url: string }[];
  members: { login: string; name: string; avatarUrl: string }[];
};
type Service = {
  id: string;
  name: string;
  description: string;
  owner: string;
  system: string;
  lifecycle: string;
  tier: string | null;
  service_type: string | null;
  language: string;
  score: number;
  scorecards: Record<string, number>;
  plugins: Record<string, unknown>;
  pluginStates?: Record<
    string,
    {
      status: string;
      error?: string | null;
      observedAt?: string | null;
      expiresAt?: string | null;
    }
  >;
  repository: string;
  metadata: Record<string, any>;
  updated_at: string;
};
type ActivityRow = {
  type: string;
  status: string;
  registered: number;
  discovered: number;
  error?: string;
  results?: Array<{ repository?: string; status: string; error?: string }>;
  created_at: string;
};
type ActionRun = {
  id: string;
  action_id: string;
  repository: string;
  workflow: string;
  status: string;
  inputs: Record<string, string>;
  created_at: string;
};
type Summary = {
  services: Service[];
  teams: Team[];
  users: User[];
  activity: ActivityRow[];
  actions: ActionRun[];
};
type Rule = ScorecardRule;
type Tier = { id: string; title: string; description: string };
type ServiceType = { id: string; title: string; description: string };
type ActionDef = {
  id: string;
  title: string;
  description: string;
  repository: string;
  workflow: string;
  confirmation: string;
  enabled: boolean;
  published: boolean;
  version: number;
  inputs: {
    id: string;
    label: string;
    type: "text" | "multiline" | "number" | "boolean" | "select";
    required: boolean;
    options?: string[];
    placeholder?: string;
  }[];
};
type Tool = {
  id: string;
  name: string;
  description: string;
  iconUrl: string;
  destinations: { label: string; url: string }[];
};
type Portal = {
  general: {
    name: string;
    logoUrl: string;
    accentColor: string;
    supportUrl: string;
    documentationUrl: string;
  };
  catalog: { tiers: Tier[]; types: ServiceType[] };
  scorecards: { cards: ScorecardDefinition[] };
  integrations: { plugins: PublicPlugin[] };
  actions: ActionDef[];
  tools: { items: Tool[] };
};
const emptyPortal: Portal = {
  general: {
    name: "Perongen",
    logoUrl: "",
    accentColor: "#b07a32",
    supportUrl: "",
    documentationUrl: "",
  },
  catalog: { tiers: [], types: [] },
  scorecards: { cards: [] },
  integrations: { plugins: [] },
  actions: [],
  tools: { items: [] },
};
const empty: Summary = {
  services: [],
  teams: [],
  users: [],
  activity: [],
  actions: [],
};
const palette = ["#6754e8", "#137c8b", "#d27328", "#a64872", "#428654"];

function initials(value: string) {
  return value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
function relative(value: string) {
  const seconds = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
function usePortal() {
  const [data, setData] = useState<Summary>(empty);
  const [portal, setPortal] = useState<Portal>(emptyPortal);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState<string | null>(null);
  const refresh = () => {
    setError("");
    const json = async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${url} returned ${response.status}`);
      return response.json();
    };
    return Promise.all([
      json("/api/auth/me"),
      json("/api/summary"),
      json("/api/portal"),
      json("/api/config/revision"),
    ])
      .then(([auth, summary, config, source]) => {
        setData(summary);
        setPortal(config);
        setUser(auth.user);
        setRevision(source.appliedSha || null);
        setLoading(false);
      })
      .catch((cause) => {
        setError(
          (cause as Error).message || "Perongen could not load portal data.",
        );
        setLoading(false);
      });
  };
  useEffect(() => {
    refresh();
  }, []);
  useEffect(() => {
    const check = () =>
      fetch("/api/config/revision")
        .then((r) => r.json())
        .then((source) => {
          if (revision && source.appliedSha !== revision) return refresh();
        })
        .catch(() => {});
    const timer = setInterval(check, 15000);
    addEventListener("focus", check);
    return () => {
      clearInterval(timer);
      removeEventListener("focus", check);
    };
  }, [revision]);
  return { data, portal, user, loading, error, refresh };
}
function Logo({ name = "Perongen" }: { name?: string }) {
  return (
    <div className="logo">
      <span>{name}</span>
    </div>
  );
}
function ScoreRing({
  score,
  small = false,
}: {
  score: number;
  small?: boolean;
}) {
  return (
    <div
      className={small ? "score-ring small" : "score-ring"}
      style={{ "--score": `${score * 3.6}deg` } as React.CSSProperties}
    >
      <div>
        <strong>{score}</strong>
        {!small && <span>/100</span>}
      </div>
    </div>
  );
}
function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: typeof Box;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  const [documentationUrl, setDocumentationUrl] = useState("");
  useEffect(() => {
    if (action) return;
    fetch("/api/portal")
      .then((r) => r.json())
      .then((data) =>
        setDocumentationUrl(data?.general?.documentationUrl || ""),
      )
      .catch(() => {});
  }, [action]);
  return (
    <div className="empty-state">
      <div>
        <Icon size={21} />
      </div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action ||
        (documentationUrl && (
          <a
            className="empty-doc-link"
            href={documentationUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Read the documentation <ExternalLink size={12} />
          </a>
        ))}
    </div>
  );
}

function Sidebar({
  view,
  setView,
  open,
  setOpen,
  collapsed,
  setCollapsed,
  user,
  counts,
  name,
}: {
  view: View;
  setView: (v: View) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  user: User | null;
  counts: { services: number; teams: number; users: number };
  name: string;
}) {
  const go = (v: View) => {
    setView(v);
    setOpen(false);
  };
  const primary: [View, string, typeof LayoutGrid, number?][] = [
    ["overview", "Overview", LayoutGrid],
    ["inbox", "Engineering inbox", BellRing],
    ["catalog", "Catalog", Box, counts.services],
    ["map", "Software map", Network],
    ["docs", "Documentation", BookOpen],
    ["scorecards", "Scorecards", ShieldCheck],
    ["actions", "Actions", Zap],
    ["tools", "Tools", Link2],
  ];
  return (
    <>
      <aside
        className={`${open ? "sidebar open" : "sidebar"} ${collapsed ? "collapsed" : ""}`}
      >
        <div className="side-top">
          <Logo name={name} />
          <button
            className="mobile-close"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
        <nav>
          {primary.map(([id, label, Icon, count]) => (
            <button
              key={id}
              title={collapsed ? label : undefined}
              className={
                view === id || (view === "service" && id === "catalog")
                  ? "nav-link active"
                  : "nav-link"
              }
              onClick={() => go(id)}
            >
              <Icon size={18} />
              <span>{label}</span>
              {count !== undefined && <small>{count}</small>}
            </button>
          ))}
        </nav>
        <div className="nav-group">
          <p>Directory</p>
          <button
            title={collapsed ? "Teams" : undefined}
            className={
              view === "teams" || view === "team"
                ? "nav-link active"
                : "nav-link"
            }
            onClick={() => go("teams")}
          >
            <Users size={18} />
            <span>Teams</span>
            <small>{counts.teams}</small>
          </button>
          <button
            title={collapsed ? "People" : undefined}
            className={view === "people" ? "nav-link active" : "nav-link"}
            onClick={() => go("people")}
          >
            <CircleUserRound size={18} />
            <span>People</span>
            <small>{counts.users}</small>
          </button>
        </div>
        {user?.role === "admin" && (
          <div className="nav-group manage">
            <p>Manage</p>
            <button
              title={collapsed ? "Settings" : undefined}
              className={view === "settings" ? "nav-link active" : "nav-link"}
              onClick={() => go("settings")}
            >
              <Settings size={18} />
              <span>Settings</span>
            </button>
            <button
              title={collapsed ? "Campaigns" : undefined}
              className={view === "campaigns" ? "nav-link active" : "nav-link"}
              onClick={() => go("campaigns")}
            >
              <Megaphone size={18} />
              <span>Campaigns</span>
            </button>
            <button
              title={collapsed ? "Analytics" : undefined}
              className={view === "analytics" ? "nav-link active" : "nav-link"}
              onClick={() => go("analytics")}
            >
              <BarChart3 size={18} />
              <span>Analytics</span>
            </button>
          </div>
        )}
        <div className="side-bottom">
          {user ? (
            <button className="profile">
              <div className="avatar">{initials(user.name)}</div>
              <div>
                <strong>{user.name}</strong>
                <small>
                  {user.role === "admin" ? "Administrator" : "Member"}
                </small>
              </div>
              <ChevronDown size={16} />
            </button>
          ) : (
            <button
              className="profile sign-in"
              onClick={() => location.assign("/api/auth/login")}
            >
              <div className="avatar">
                <CircleUserRound size={16} />
              </div>
              <div>
                <strong>Sign in with GitHub</strong>
                <small>Use your organization account</small>
              </div>
              <ArrowRight size={15} />
            </button>
          )}
          <button
            className="collapse-control"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen size={17} />
            ) : (
              <PanelLeftClose size={17} />
            )}
            <span>{collapsed ? "" : "Collapse sidebar"}</span>
          </button>
        </div>
      </aside>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
    </>
  );
}
function Header({
  title,
  name,
  onMenu,
  onSettings,
  onSearch,
  theme,
  setTheme,
}: {
  title: string;
  name: string;
  onMenu: () => void;
  onSettings: () => void;
  onSearch: () => void;
  theme: "light" | "dark";
  setTheme: (v: "light" | "dark") => void;
}) {
  const [documentationUrl, setDocumentationUrl] = useState("");
  useEffect(() => {
    fetch("/api/portal")
      .then((r) => r.json())
      .then((data) =>
        setDocumentationUrl(data?.general?.documentationUrl || ""),
      )
      .catch(() => {});
  }, []);
  return (
    <header>
      <div className="header-title">
        <button className="menu" aria-label="Open navigation" onClick={onMenu}>
          <Menu size={20} />
        </button>
        <span className="crumb">{name}</span>
        <ChevronRight size={14} />
        <strong>{title}</strong>
      </div>
      <div className="header-actions">
        {documentationUrl && (
          <a
            className="docs-link"
            href={documentationUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <FileCode2 size={15} />
            <span>Documentation</span>
            <ExternalLink size={12} />
          </a>
        )}
        <button className="search" aria-label="Search" onClick={onSearch}>
          <Search size={17} />
          <span>Search</span>
          <kbd>⌘ K</kbd>
        </button>
        <button
          className="icon-btn"
          aria-label={`Use ${theme === "light" ? "dark" : "light"} theme`}
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
        >
          {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
        </button>
        <button className="icon-btn" aria-label="Settings" onClick={onSettings}>
          <Settings size={18} />
        </button>
      </div>
    </header>
  );
}
function ServiceCard({
  service,
  index = 0,
  onOpen,
}: {
  service: Service;
  index?: number;
  onOpen: (service: Service) => void;
}) {
  return (
    <article className="service-card">
      <div className="service-top">
        <div
          className="service-icon"
          style={{ background: palette[index % palette.length] }}
        >
          {initials(service.name)}
        </div>
        <ScoreRing score={service.score} small />
      </div>
      <button className="service-name-link" onClick={() => onOpen(service)}>
        <h3>{service.name}</h3>
        <ChevronRight size={14} />
      </button>
      <p>{service.description || "No description in service metadata."}</p>
      <div className="tags">
        <span>{service.lifecycle}</span>
        {service.tier && <span className="tier-chip">{service.tier}</span>}
        {service.service_type && (
          <span className="type-chip">{service.service_type}</span>
        )}
        <span>{service.language}</span>
      </div>
      <div className="service-footer">
        <div className="team-avatar">{initials(service.owner)}</div>
        <span>{service.owner}</span>
        <small>{relative(service.updated_at)}</small>
      </div>
    </article>
  );
}

function Overview({
  data,
  user,
  navigate,
  loading,
  openService,
  openTeam,
  activeTeam,
  memberTeams,
  primaryTeam,
  setActiveTeam,
  makePrimary,
}: {
  data: Summary;
  user: User | null;
  navigate: (v: View) => void;
  loading: boolean;
  openService: (service: Service) => void;
  openTeam: (team: Team) => void;
  activeTeam: Team | null;
  memberTeams: Team[];
  primaryTeam: string | null;
  setActiveTeam: (name: string) => void;
  makePrimary: () => void;
}) {
  const services = activeTeam
    ? data.services.filter((service) => service.owner === activeTeam.name)
    : data.services;
  const avg = services.length
    ? Math.round(services.reduce((a, s) => a + s.score, 0) / services.length)
    : 0;
  const passing = services.filter((s) => s.score === 100).length;
  const systems = new Set(services.map((s) => s.system)).size;
  return (
    <div className="page overview">
      <section className="welcome">
        <div>
          <p className="eyebrow">
            {new Intl.DateTimeFormat(undefined, {
              weekday: "long",
              day: "numeric",
              month: "long",
            }).format(new Date())}
          </p>
          {user && memberTeams.length > 0 && (
            <div className="team-context">
              <span>Viewing</span>
              <label>
                <Users size={14} />
                <select
                  aria-label="Active team"
                  value={activeTeam?.name || ""}
                  onChange={(e) => setActiveTeam(e.target.value)}
                >
                  {memberTeams.map((team) => (
                    <option value={team.name} key={team.name}>
                      {team.title}
                    </option>
                  ))}
                </select>
                <ChevronDown size={13} />
              </label>
              {activeTeam && activeTeam.name !== primaryTeam && (
                <button onClick={makePrimary}>Make primary</button>
              )}
              {activeTeam?.name === primaryTeam && <em>Primary team</em>}
            </div>
          )}
          <h1>
            {user
              ? `Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, ${user.name.split(" ")[0]}.`
              : "Your services, in order."}
          </h1>
          <p>
            {loading
              ? "Loading your services…"
              : activeTeam
                ? `${services.length} ${services.length === 1 ? "service" : "services"} owned by ${activeTeam.title}.`
                : services.length
                  ? `A clear view of the ${services.length} ${services.length === 1 ? "service" : "services"} your organization owns.`
                  : "Connect GitHub and add a metadata file to register your first service."}
          </p>
        </div>
        <button className="ghost-button" onClick={() => navigate("catalog")}>
          <Command size={16} />
          Browse all services
        </button>
      </section>
      <section className="service-ledger">
        <div className="ledger-intro">
          <p className="eyebrow">
            {activeTeam ? `${activeTeam.title} workspace` : "Service overview"}
          </p>
          <h2>
            {activeTeam ? (
              <>
                What your team
                <br />
                is responsible for.
              </>
            ) : (
              <>
                What your teams
                <br />
                are responsible for.
              </>
            )}
          </h2>
          <p>
            {activeTeam
              ? `Services, standards, and shared context for ${activeTeam.title}.`
              : "Ownership, standards, and recent catalog activity—gathered in one dependable view."}
          </p>
          {activeTeam ? (
            <button
              className="text-button"
              onClick={() => openTeam(activeTeam)}
            >
              Open team workspace <ArrowRight size={16} />
            </button>
          ) : (
            <button className="text-button" onClick={() => navigate("catalog")}>
              Open service catalog <ArrowRight size={16} />
            </button>
          )}
        </div>
        <div className="ledger-metrics">
          <div>
            <strong>{services.length}</strong>
            <span>Owned services</span>
          </div>
          <div>
            <strong>
              {avg}
              <em>%</em>
            </strong>
            <span>Average standards coverage</span>
          </div>
          <div>
            <strong>{systems}</strong>
            <span>Software systems</span>
          </div>
          <div>
            <strong>{passing}</strong>
            <span>Services meeting every check</span>
          </div>
        </div>
      </section>
      <div className="section-heading">
        <div>
          <p className="eyebrow">
            {activeTeam ? "TEAM SERVICES" : "REGISTERED SERVICES"}
          </p>
          <h2>Recently synchronized</h2>
        </div>
        <button className="text-button" onClick={() => navigate("catalog")}>
          View catalog <ArrowRight size={15} />
        </button>
      </div>
      {services.length ? (
        <div className="service-strip">
          {services.slice(0, 3).map((s, i) => (
            <ServiceCard
              key={s.name}
              service={s}
              index={i}
              onOpen={openService}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Box}
          title={
            activeTeam
              ? "No services owned by this team"
              : "No services registered"
          }
          body={
            activeTeam
              ? "Service ownership comes from spec.owner in repository metadata."
              : "Add .portal/service.yaml to an installed repository, then synchronize GitHub."
          }
        />
      )}
      <div className="dashboard-grid">
        <section className="panel health-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">STANDARDS</p>
              <h3>{activeTeam ? "Team health" : "Catalog health"}</h3>
            </div>
          </div>
          <div className="health-body">
            <ScoreRing score={avg} />
            <div className="health-copy">
              <strong>
                {services.length
                  ? `${passing} of ${services.length} services pass every check`
                  : "Waiting for service data"}
              </strong>
              <p>
                The primary scorecard combines repository metadata and enabled
                plugin signals.
              </p>
              <button
                className="text-button"
                onClick={() => navigate("scorecards")}
              >
                Review evaluations <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </section>
        <section className="panel activity-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">SYNC HISTORY</p>
              <h3>Latest catalog runs</h3>
            </div>
          </div>
          {data.activity.length ? (
            data.activity.map((a, i) => (
              <div className="activity-item" key={i}>
                <div className="activity-icon">
                  <Activity size={15} />
                </div>
                <div>
                  <strong>GitHub synchronization</strong>
                  <p>
                    {a.registered} registered of {a.discovered} discovered
                  </p>
                </div>
                <time>{relative(a.created_at)}</time>
              </div>
            ))
          ) : (
            <EmptyState
              icon={Activity}
              title="No sync history"
              body="Your first GitHub synchronization will appear here."
            />
          )}
        </section>
      </div>
    </div>
  );
}

function Catalog({
  services,
  tiers,
  types,
  activity,
  openService,
}: {
  services: Service[];
  tiers: Tier[];
  types: ServiceType[];
  activity: ActivityRow[];
  openService: (service: Service) => void;
}) {
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState("");
  const [type, setType] = useState("");
  const filtered = useMemo(
    () =>
      services.filter(
        (s) =>
          (s.name + s.owner + s.system)
            .toLowerCase()
            .includes(query.toLowerCase()) &&
          (!tier || (tier === "unclassified" ? !s.tier : s.tier === tier)) &&
          (!type ||
            (type === "unclassified"
              ? !s.service_type
              : s.service_type === type)),
      ),
    [query, tier, type, services],
  );
  const invalid = (activity[0]?.results || []).filter(
    (item) => item.status === "invalid",
  );
  return (
    <div className="page">
      <div className="page-intro">
        <div>
          <p className="eyebrow">SOFTWARE CATALOG</p>
          <h1>Services</h1>
          <p>
            Registered from repository metadata—no inferred or demo entries.
          </p>
        </div>
      </div>
      {invalid.length > 0 && (
        <details className="catalog-diagnostics">
          <summary>
            <span>
              <Activity size={16} />
              <strong>{invalid.length} repositories need metadata fixes</strong>
            </span>
            <ChevronDown size={15} />
          </summary>
          <div>
            {invalid.map((item) => (
              <article key={item.repository}>
                <span>{item.repository}</span>
                <code>
                  {item.error ||
                    "Validate .portal/service.yaml against the service metadata contract."}
                </code>
                <a
                  href={`https://github.com/${item.repository}/blob/main/.portal/service.yaml`}
                  target="_blank"
                  rel="noopener"
                >
                  Open metadata <ExternalLink size={13} />
                </a>
              </article>
            ))}
          </div>
        </details>
      )}
      <div className="catalog-toolbar">
        <div className="input-search">
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search services, teams, or systems"
          />
        </div>
        {tiers.length > 0 && (
          <select
            className="filter tier-filter"
            aria-label="Filter by tier"
            value={tier}
            onChange={(e) => setTier(e.target.value)}
          >
            <option value="">All tiers</option>
            {tiers.map((item) => (
              <option value={item.id} key={item.id}>
                {item.title}
              </option>
            ))}
            <option value="unclassified">Unclassified</option>
          </select>
        )}
        {types.length > 0 && (
          <select
            className="filter type-filter"
            aria-label="Filter by service type"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">All types</option>
            {types.map((item) => (
              <option value={item.id} key={item.id}>
                {item.title}
              </option>
            ))}
            <option value="unclassified">Unclassified</option>
          </select>
        )}
        <div className="result-count">
          <i className="dot green" />
          Live · {filtered.length} services
        </div>
      </div>
      {filtered.length ? (
        <div className="catalog-table">
          <div className="table-head">
            <span>Service</span>
            <span>Owner</span>
            <span>System</span>
            <span>Classification</span>
            <span>Score</span>
            <span />
          </div>
          {filtered.map((s, i) => (
            <button
              className="table-row"
              key={s.name}
              onClick={() => openService(s)}
            >
              <span className="service-cell">
                <i style={{ background: palette[i % palette.length] }}>
                  {initials(s.name)}
                </i>
                <span>
                  <strong>{s.name}</strong>
                  <small>{s.description}</small>
                </span>
              </span>
              <span>
                <b className="mini-avatar">{initials(s.owner)}</b>
                {s.owner}
              </span>
              <span>{s.system}</span>
              <span className="classification-cell">
                <span
                  className={s.tier ? "tier-chip" : "tier-chip unclassified"}
                >
                  {tiers.find((item) => item.id === s.tier)?.title || "No tier"}
                </span>
                <span
                  className={
                    s.service_type ? "type-chip" : "type-chip unclassified"
                  }
                >
                  {types.find((item) => item.id === s.service_type)?.title ||
                    "No type"}
                </span>
              </span>
              <span>
                <ScoreRing score={s.score} small />
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Search}
          title="No services match"
          body={
            services.length
              ? "Try a different search, tier, or service type."
              : "Synchronize an installed GitHub repository containing .portal/service.yaml."
          }
        />
      )}
    </div>
  );
}
function ServiceDrawer({
  service,
  close,
}: {
  service: Service;
  close: () => void;
}) {
  return (
    <div className="drawer-wrap">
      <div className="drawer-scrim" onClick={close} />
      <aside className="drawer">
        <button className="drawer-close" onClick={close}>
          <X size={19} />
        </button>
        <div className="drawer-title">
          <div
            className="service-icon large"
            style={{ background: palette[0] }}
          >
            {initials(service.name)}
          </div>
          <div>
            <p className="eyebrow">SERVICE</p>
            <h2>{service.name}</h2>
          </div>
        </div>
        <p className="drawer-desc">{service.description}</p>
        <div className="drawer-score">
          <ScoreRing score={service.score} />
          <div>
            <strong>Primary score</strong>
            <p>Evaluated from metadata and enabled plugin signals.</p>
          </div>
        </div>
        <h4>About</h4>
        <dl>
          <div>
            <dt>Owner</dt>
            <dd>{service.owner}</dd>
          </div>
          <div>
            <dt>System</dt>
            <dd>{service.system}</dd>
          </div>
          <div>
            <dt>Lifecycle</dt>
            <dd>{service.lifecycle}</dd>
          </div>
          <div>
            <dt>Language</dt>
            <dd>{service.language}</dd>
          </div>
        </dl>
        <h4>Source</h4>
        <a
          className="repo-link"
          href={`https://github.com/${service.repository}`}
          target="_blank"
          rel="noreferrer"
        >
          <GitBranch size={17} />
          <span>
            <strong>{service.repository}</strong>
            <small>.portal/service.yaml</small>
          </span>
          <ExternalLink size={15} />
        </a>
        <h4>Stored metadata</h4>
        <pre>
          <code>{JSON.stringify(service.metadata, null, 2)}</code>
        </pre>
      </aside>
    </div>
  );
}

function ServiceWorkspace({
  service,
  cards,
  tiers,
  types,
  plugins,
  navigate,
  signedIn,
}: {
  service: Service;
  cards: ScorecardDefinition[];
  tiers: Tier[];
  types: ServiceType[];
  plugins: PublicPlugin[];
  navigate: (view: View) => void;
  signedIn: boolean;
}) {
  const links = Array.isArray(service.metadata?.spec?.links)
    ? service.metadata.spec.links
    : [];
  const primary = cards.find((card) => card.primary) || cards[0];
  const checks = primary
    ? applicableRules(service.metadata, primary.rules, service.plugins)
    : [];
  const passing = checks.filter((check) =>
    evaluateRule(service.metadata, check, service.plugins),
  ).length;
  const tier = tiers.find((item) => item.id === service.tier);
  const serviceType = types.find((item) => item.id === service.service_type);
  return (
    <div className="page service-workspace">
      <button className="service-back" onClick={() => navigate("catalog")}>
        <ArrowRight size={14} />
        All services
      </button>
      <section className="service-heading">
        <div className="service-title-mark">{initials(service.name)}</div>
        <div className="service-title">
          <p className="eyebrow">SERVICE DOSSIER</p>
          <h1>{service.metadata?.metadata?.title || service.name}</h1>
          <p>
            {service.description ||
              "No description has been provided in the service metadata."}
          </p>
          <div className="service-badges">
            <span>
              <i
                className={
                  service.lifecycle === "production"
                    ? "dot green"
                    : "dot purple"
                }
              />
              {service.lifecycle}
            </span>
            <span
              className={service.tier ? "tier-chip" : "tier-chip unclassified"}
            >
              {tier?.title || "Unclassified"}
            </span>
            <span
              className={
                service.service_type ? "type-chip" : "type-chip unclassified"
              }
            >
              {serviceType?.title || "No type"}
            </span>
            <span>{service.language}</span>
            <span>Updated {relative(service.updated_at)}</span>
          </div>
        </div>
        <div className="service-heading-score">
          <ScoreRing score={service.score} />
          <span>Standards coverage</span>
        </div>
      </section>
      <div className="service-dossier">
        <div className="service-record">
          <section className="record-section">
            <div className="record-section-head">
              <div>
                <p className="eyebrow">STANDARDS</p>
                <h2>{primary?.title || "Scorecards"}</h2>
                <p>
                  {passing} of {checks.length} applicable checks passing
                </p>
              </div>
              <button
                className="text-button"
                onClick={() => navigate("scorecards")}
              >
                View all scorecards <ArrowRight size={14} />
              </button>
            </div>
            <div className="service-scorecard-strip">
              {cards
                .filter((card) => card.enabled)
                .map((card) => (
                  <span className={card.primary ? "primary" : ""} key={card.id}>
                    <strong>{service.scorecards?.[card.id] ?? 100}</strong>
                    <small>{card.title}</small>
                  </span>
                ))}
            </div>
            {checks.length ? (
              <StandardsChecks
                service={service}
                scorecardId={primary?.id || "metadata-quality"}
                checks={checks}
                signedIn={signedIn}
              />
            ) : (
              <div className="record-empty">
                <ShieldCheck size={17} />
                <div>
                  <strong>No checks apply to this service</strong>
                  <p>
                    Review the service tier, type, or scorecard scope
                    configuration.
                  </p>
                </div>
              </div>
            )}
          </section>
          <ScoreHistory
            serviceName={service.name}
            currentScore={service.score}
          />
          <ServiceOperations serviceName={service.name} />
          <ServiceDocumentation serviceName={service.name} />
          <PluginServiceSections
            plugins={service.plugins}
            states={service.pluginStates}
            enabled={plugins}
          />
          <section className="record-section">
            <div className="record-section-head">
              <div>
                <p className="eyebrow">LINKS</p>
                <h2>Useful destinations</h2>
              </div>
            </div>
            {links.length ? (
              <div className="service-links">
                {links.map((link: any) => (
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener"
                    key={`${link.name}-${link.url}`}
                  >
                    <span>
                      <Link2 size={15} />
                      <strong>{link.name}</strong>
                    </span>
                    <ExternalLink size={14} />
                  </a>
                ))}
              </div>
            ) : (
              <div className="record-empty">
                <Link2 size={17} />
                <div>
                  <strong>No service links declared</strong>
                  <p>
                    Add documentation or operational links to{" "}
                    <code>spec.links</code> in the service metadata.
                  </p>
                </div>
              </div>
            )}
          </section>
          <details className="metadata-disclosure">
            <summary>
              <span>
                <FileCode2 size={16} />
                Stored metadata
              </span>
              <ChevronDown size={15} />
            </summary>
            <pre>
              <code>{JSON.stringify(service.metadata, null, 2)}</code>
            </pre>
          </details>
        </div>
        <aside className="service-facts">
          <div>
            <p className="eyebrow">OWNERSHIP</p>
            <dl>
              <dt>Team</dt>
              <dd>
                <span className="fact-avatar">{initials(service.owner)}</span>
                {service.owner}
              </dd>
              <dt>System</dt>
              <dd>{service.system}</dd>
            </dl>
          </div>
          <div>
            <p className="eyebrow">SOURCE</p>
            <a
              className="service-source"
              href={`https://github.com/${service.repository}`}
              target="_blank"
              rel="noopener"
            >
              <GitBranch size={16} />
              <span>
                <strong>{service.repository}</strong>
                <small>.portal/service.yaml</small>
              </span>
              <ExternalLink size={13} />
            </a>
          </div>
          <div>
            <p className="eyebrow">CLASSIFICATION</p>
            <dl>
              <dt>Tier</dt>
              <dd>
                <span
                  className={
                    service.tier ? "tier-chip" : "tier-chip unclassified"
                  }
                >
                  {tier?.title || "Unclassified"}
                </span>
              </dd>
              {tier?.description && (
                <>
                  <dt>Tier policy</dt>
                  <dd>{tier.description}</dd>
                </>
              )}
              <dt>Type</dt>
              <dd>
                <span
                  className={
                    service.service_type
                      ? "type-chip"
                      : "type-chip unclassified"
                  }
                >
                  {serviceType?.title || "Unclassified"}
                </span>
              </dd>
              {serviceType?.description && (
                <>
                  <dt>Type definition</dt>
                  <dd>{serviceType.description}</dd>
                </>
              )}
              <dt>Lifecycle</dt>
              <dd>{service.lifecycle}</dd>
              <dt>Language</dt>
              <dd>{service.language}</dd>
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}

function TeamWorkspace({
  team,
  services,
  primaryTeam,
  isMember,
  openService,
  makePrimary,
}: {
  team: Team;
  services: Service[];
  primaryTeam: string | null;
  isMember: boolean;
  openService: (service: Service) => void;
  makePrimary: (team: string) => void;
}) {
  const owned = services.filter((service) => service.owner === team.name);
  const avg = owned.length
    ? Math.round(
        owned.reduce((sum, service) => sum + service.score, 0) / owned.length,
      )
    : 0;
  return (
    <div className="page team-workspace">
      <section className="team-workspace-head">
        <div className="team-workspace-mark">{initials(team.title)}</div>
        <div>
          <p className="eyebrow">TEAM WORKSPACE</p>
          <h1>{team.title}</h1>
          <p>
            {team.description ||
              "Ownership and shared context synchronized from team metadata."}
          </p>
          <span>team:{team.name}</span>
        </div>
        <div className="team-workspace-actions">
          {team.name === primaryTeam ? (
            <em>Primary team</em>
          ) : (
            isMember && (
              <button
                className="ghost-button"
                onClick={() => makePrimary(team.name)}
              >
                Make primary
              </button>
            )
          )}
        </div>
      </section>
      <div className="team-summary">
        <div>
          <strong>{owned.length}</strong>
          <span>Owned services</span>
        </div>
        <div>
          <strong>
            {avg}
            <small>%</small>
          </strong>
          <span>Standards coverage</span>
        </div>
        <div>
          <strong>{team.member_count}</strong>
          <span>Team members</span>
        </div>
        <div>
          <strong>{team.links?.length || 0}</strong>
          <span>Shared links</span>
        </div>
      </div>
      <section className="team-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">OWNERSHIP</p>
            <h2>Services</h2>
          </div>
        </div>
        {owned.length ? (
          <div className="service-strip">
            {owned.map((service, index) => (
              <ServiceCard
                service={service}
                index={index}
                onOpen={openService}
                key={service.name}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Box}
            title="No owned services"
            body="Services appear here when spec.owner references this team."
          />
        )}
      </section>
      <div className="team-workspace-grid">
        <section className="team-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">SHARED CONTEXT</p>
              <h2>Team links</h2>
            </div>
          </div>
          {team.links?.length ? (
            <div className="team-links">
              {team.links.map((link) => (
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener"
                  key={`${link.name}-${link.url}`}
                >
                  <span>
                    <Link2 size={15} />
                    <strong>{link.name}</strong>
                  </span>
                  <ExternalLink size={14} />
                </a>
              ))}
            </div>
          ) : (
            <div className="record-empty">
              <Link2 size={17} />
              <div>
                <strong>No team links declared</strong>
                <p>
                  Add Jira, runbook, or dashboard links to{" "}
                  <code>spec.links</code> in <code>team.yaml</code>.
                </p>
              </div>
            </div>
          )}
        </section>
        <section className="team-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">PEOPLE</p>
              <h2>Members</h2>
            </div>
          </div>
          {team.members.length ? (
            <div className="team-members">
              {team.members.map((member) => (
                <div key={member.login}>
                  {member.avatarUrl ? (
                    <img src={member.avatarUrl} alt="" />
                  ) : (
                    <span>{initials(member.name)}</span>
                  )}
                  <p>
                    <strong>{member.name}</strong>
                    <small>@{member.login}</small>
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="record-empty">
              <Users size={17} />
              <div>
                <strong>No members declared</strong>
                <p>
                  Membership is synchronized from <code>team.yaml</code>.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function TeamsPage({
  teams,
  services,
  navigate,
  openTeam,
}: {
  teams: Team[];
  services: Service[];
  navigate: (v: View) => void;
  openTeam: (team: Team) => void;
}) {
  return (
    <div className="page">
      <div className="page-intro">
        <div>
          <p className="eyebrow">OWNERSHIP</p>
          <h1>Teams</h1>
          <p>Teams referenced by authoritative service metadata.</p>
        </div>
      </div>
      {teams.length > 0 && (
        <section className="ownership-insights" aria-label="Ownership insights">
          <div>
            <span>Teams without members</span>
            <strong>{teams.filter((team) => !team.member_count).length}</strong>
            <small>Need an accountable maintainer</small>
          </div>
          <div>
            <span>Services per team</span>
            <strong>{(services.length / teams.length).toFixed(1)}</strong>
            <small>Average ownership load</small>
          </div>
          <div>
            <span>Highest ownership load</span>
            <strong>
              {Math.max(...teams.map((team) => team.service_count))}
            </strong>
            <small>
              {
                teams
                  .slice()
                  .sort((a, b) => b.service_count - a.service_count)[0]?.title
              }
            </small>
          </div>
          <div>
            <span>Critical services</span>
            <strong>
              {services.filter((service) => service.tier === "critical").length}
            </strong>
            <small>Across the catalog</small>
          </div>
        </section>
      )}
      {teams.length ? (
        <div className="directory-grid">
          {teams.map((t, i) => (
            <article className="directory-card" key={t.name}>
              <div
                className="directory-mark"
                style={{ background: palette[i % palette.length] }}
              >
                {initials(t.title)}
              </div>
              <div className="directory-title">
                <button className="team-card-open" onClick={() => openTeam(t)}>
                  <h2>{t.title}</h2>
                  <ChevronRight size={14} />
                </button>
                <span>team:{t.name}</span>
              </div>
              <p>
                {t.description ||
                  "This team was created from a service ownership reference."}
              </p>
              <div className="directory-stats">
                <span>
                  <strong>{t.service_count}</strong> services
                </span>
                <span>
                  <strong>{t.member_count}</strong> people
                </span>
              </div>
              <div className="member-stack">
                {t.members.map((m) => (
                  <img key={m.login} src={m.avatarUrl} alt={m.name} />
                ))}
                {!t.members.length && (
                  <button onClick={() => navigate("people")}>
                    No members assigned <ArrowRight size={13} />
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Users}
          title="No teams yet"
          body="Teams are created when a service metadata owner uses team:name."
        />
      )}
    </div>
  );
}
function PeoplePage({ users }: { users: User[] }) {
  const [query, setQuery] = useState("");
  const filtered = users.filter((u) =>
    (u.name + u.login + u.teams.map((t) => t.name).join(""))
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className="page">
      <div className="page-intro">
        <div>
          <p className="eyebrow">DIRECTORY</p>
          <h1>People</h1>
          <p>GitHub profiles referenced by team metadata or portal sign-ins.</p>
        </div>
      </div>
      <div className="catalog-toolbar">
        <div className="input-search">
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people or teams"
          />
        </div>
        <div className="result-count">
          <i className="dot green" />
          Live · {filtered.length} {filtered.length === 1 ? "person" : "people"}
        </div>
      </div>
      {filtered.length ? (
        <div className="people-list">
          {filtered.map((u) => (
            <article className="person-row" key={u.login}>
              <img src={u.avatar_url} alt="" />
              <div>
                <strong>{u.name}</strong>
                <span>@{u.login}</span>
              </div>
              <p>{u.bio || "No GitHub bio provided."}</p>
              <div className="person-teams">
                {u.teams.length ? (
                  u.teams.map((t) => <span key={t.name}>{t.title}</span>)
                ) : (
                  <span>Unassigned</span>
                )}
              </div>
              <small>
                {u.role} · seen {relative(u.last_seen_at)}
              </small>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={CircleUserRound}
          title={users.length ? "No people match" : "No people recorded"}
          body={
            users.length
              ? "Try a different search."
              : "People appear through team metadata or GitHub sign-in."
          }
        />
      )}
    </div>
  );
}

function ToolsPage({ tools }: { tools: Tool[] }) {
  return (
    <div className="page tools-page">
      <div className="page-intro">
        <div>
          <p className="eyebrow">DEVELOPER RESOURCES</p>
          <h1>Tools</h1>
          <p>The shared systems your engineering teams use every day.</p>
        </div>
      </div>
      {tools.length ? (
        <div className="tools-ledger">
          {tools.map((tool, index) => (
            <article className="tool-entry" key={tool.id}>
              <div className="tool-index">
                {String(index + 1).padStart(2, "0")}
              </div>
              <div className="tool-identity">
                {tool.iconUrl ? (
                  <img className="tool-icon" src={tool.iconUrl} alt="" />
                ) : (
                  <div className="tool-monogram">{initials(tool.name)}</div>
                )}
                <div>
                  <h2>{tool.name}</h2>
                  <p>{tool.description || "Shared developer resource."}</p>
                </div>
              </div>
              <div className="tool-destinations">
                {tool.destinations.map((destination) => (
                  <a
                    href={destination.url}
                    target="_blank"
                    rel="noopener"
                    key={`${tool.id}-${destination.label}`}
                  >
                    <span>{destination.label}</span>
                    <ExternalLink size={14} />
                  </a>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Link2}
          title="No tools configured"
          body="An administrator can add shared developer resources in Settings."
        />
      )}
    </div>
  );
}

function Actions({ runs }: { runs: ActionRun[] }) {
  const [running, setRunning] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [serviceName, setServiceName] = useState("");
  const [owner, setOwner] = useState("");
  const [result, setResult] = useState("");
  async function run() {
    setRunning(true);
    setResult("");
    try {
      const r = await fetch("/api/actions/dispatch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inputs: { serviceName, owner } }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Dispatch failed");
      setResult("Workflow dispatched. Refresh to see it in recent runs.");
    } catch (e) {
      setResult((e as Error).message);
    } finally {
      setRunning(false);
    }
  }
  return (
    <div className="page">
      <div className="page-intro">
        <div>
          <p className="eyebrow">SELF-SERVICE</p>
          <h1>Actions</h1>
          <p>
            Configured GitHub workflows and their persisted dispatch history.
          </p>
        </div>
      </div>
      <div className="action-grid single-action">
        <article className="action-feature">
          <div className="action-art">
            <TerminalSquare size={38} />
            <span>workflow_dispatch</span>
          </div>
          <div>
            <span className="status-chip">
              <Sparkles size={14} />
              Safe simulation
            </span>
            <h2>Bogus provision a service</h2>
            <p>
              Run the complete GitHub dispatch path without creating a
              repository or changing infrastructure.
            </p>
            <div className="action-details">
              <span>
                <GitBranch size={15} />
                GitHub Actions
              </span>
              <span>
                <FileCode2 size={15} />2 inputs
              </span>
              <span>
                <ShieldCheck size={15} />
                Admin only
              </span>
            </div>
            <button className="primary" onClick={() => setFormOpen(true)}>
              Run simulation <ArrowRight size={16} />
            </button>
          </div>
        </article>
      </div>
      <section className="panel run-history">
        <div className="panel-head">
          <div>
            <p className="eyebrow">RECENT RUNS</p>
            <h3>Dispatch history</h3>
          </div>
        </div>
        {runs.length ? (
          runs.map((r) => (
            <div className="run-row" key={r.id}>
              <CheckCircle2 size={18} />
              <div>
                <strong>{r.action_id}</strong>
                <small>
                  {String(r.inputs?.serviceName || "No service input")} ·{" "}
                  {r.repository}
                </small>
              </div>
              <span>{r.status}</span>
              <time>{relative(r.created_at)}</time>
            </div>
          ))
        ) : (
          <EmptyState
            icon={Zap}
            title="No workflows dispatched"
            body="Successful portal dispatches will appear here."
          />
        )}
      </section>
      {formOpen && (
        <div className="drawer-wrap">
          <div className="drawer-scrim" onClick={() => setFormOpen(false)} />
          <aside className="drawer action-drawer">
            <button className="drawer-close" onClick={() => setFormOpen(false)}>
              <X size={19} />
            </button>
            <p className="eyebrow">SAFE SIMULATION</p>
            <h2>Bogus provision a service</h2>
            <p className="drawer-desc">
              This exercises the real GitHub workflow path but makes no
              repository or infrastructure changes.
            </p>
            <label>
              Service name
              <input
                value={serviceName}
                onChange={(e) => setServiceName(e.target.value)}
                placeholder="payments-api"
              />
            </label>
            <label>
              Owning team
              <input
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="team:payments"
              />
            </label>
            {result && (
              <div
                className={
                  result.startsWith("Workflow")
                    ? "action-result success"
                    : "action-result"
                }
              >
                {result}
              </div>
            )}
            <button
              className="primary action-submit"
              disabled={!serviceName || !owner || running}
              onClick={run}
            >
              {running ? (
                "Dispatching workflow…"
              ) : (
                <>
                  Run bogus workflow <ArrowRight size={16} />
                </>
              )}
            </button>
          </aside>
        </div>
      )}
    </div>
  );
}

function Integrations({ refresh }: { refresh: () => void }) {
  const [status, setStatus] = useState<{
    configured: boolean;
    appId: string | null;
  } | null>(null);
  const [installationId, setInstallationId] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    fetch("/api/github/status")
      .then((r) => r.json())
      .then(setStatus);
  }, []);
  async function sync() {
    setSyncing(true);
    setMessage("");
    try {
      const r = await fetch("/api/github/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ installationId: Number(installationId) }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setMessage(
        `Synchronized ${data.registered} registered services from ${data.results.length} repositories.`,
      );
      refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }
  return (
    <div className="page">
      <div className="page-intro">
        <div>
          <p className="eyebrow">CONNECTIONS</p>
          <h1>Integrations</h1>
          <p>Connect the systems that describe and operate your software.</p>
        </div>
      </div>
      <section className="integration-card">
        <div className="github-mark">
          <GitBranch size={25} />
        </div>
        <div className="integration-main">
          <div className="integration-title">
            <div>
              <h2>GitHub</h2>
              <p>
                Discover repositories, read metadata, and dispatch workflows.
              </p>
            </div>
            <span
              className={
                status?.configured ? "connection connected" : "connection"
              }
            >
              <i />
              {status?.configured ? "Configured" : "Setup required"}
            </span>
          </div>
          {status?.configured && (
            <div className="sync-box">
              <div>
                <label htmlFor="installation">Installation ID</label>
                <input
                  id="installation"
                  value={installationId}
                  onChange={(e) => setInstallationId(e.target.value)}
                  placeholder="145753228"
                  inputMode="numeric"
                />
              </div>
              <button
                className="primary"
                disabled={!installationId || syncing}
                onClick={sync}
              >
                {syncing ? (
                  "Synchronizing…"
                ) : (
                  <>
                    <Activity size={16} />
                    Synchronize now
                  </>
                )}
              </button>
              {message && <p className="sync-message">{message}</p>}
            </div>
          )}
          <div className="permission-row">
            <span>
              <Check size={14} />
              Contents: read
            </span>
            <span>
              <Check size={14} />
              Actions: write
            </span>
            <span>
              <Check size={14} />
              Metadata: read
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}

const routeForView: Record<Exclude<View, "service" | "team">, string> = {
  overview: "/",
  inbox: "/inbox",
  catalog: "/catalog",
  map: "/map",
  docs: "/docs",
  scorecards: "/scorecards",
  actions: "/actions",
  tools: "/tools",
  teams: "/teams",
  people: "/people",
  integrations: "/integrations",
  campaigns: "/campaigns",
  analytics: "/analytics",
  settings: "/settings",
};

function viewFromPath(pathname: string): View {
  if (pathname.startsWith("/catalog/")) return "service";
  if (pathname.startsWith("/teams/")) return "team";
  return (
    (Object.entries(routeForView).find(
      ([, path]) => path === pathname,
    )?.[0] as View) || "overview"
  );
}

export function App() {
  const [view, setViewState] = useState<View>(() =>
    viewFromPath(location.pathname),
  );
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [activeTeamName, setActiveTeamName] = useState("");
  const [sideOpen, setSideOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [collapsed, setCollapsedState] = useState(
    () => localStorage.getItem("perongen-sidebar") === "collapsed",
  );
  const [theme, setThemeState] = useState<"light" | "dark">(
    () =>
      (localStorage.getItem("perongen-theme") as "light" | "dark") ||
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
  );
  const { data, portal, user, loading, error, refresh } = usePortal();
  const viewer = data.users.find(
    (candidate) => candidate.login === user?.login,
  );
  const memberTeamNames = new Set(
    (viewer?.teams || []).map((team) => team.name),
  );
  const memberTeams = data.teams.filter((team) =>
    memberTeamNames.has(team.name),
  );
  const primaryTeam = user?.primaryTeam || viewer?.primary_team || null;
  const activeTeam =
    data.teams.find((team) => team.name === activeTeamName) ||
    memberTeams.find((team) => team.name === primaryTeam) ||
    memberTeams[0] ||
    null;
  const titles: Record<View, string> = {
    overview: "Overview",
    inbox: "Engineering inbox",
    catalog: "Catalog",
    map: "Software map",
    docs: "Documentation",
    service: selectedService?.name || "Service",
    team: selectedTeam?.title || activeTeam?.title || "Team",
    scorecards: "Scorecards",
    actions: "Actions",
    tools: "Tools",
    teams: "Teams",
    people: "People",
    integrations: "Integrations",
    campaigns: "Metadata campaigns",
    analytics: "Portal analytics",
    settings: "Settings",
  };
  const navigate = (next: View, replace = false) => {
    const path =
      next === "service" && selectedService
        ? `/catalog/${encodeURIComponent(selectedService.name)}`
        : next === "team" && selectedTeam
          ? `/teams/${encodeURIComponent(selectedTeam.name)}`
          : routeForView[next as Exclude<View, "service" | "team">] || "/";
    if (location.pathname !== path)
      history[replace ? "replaceState" : "pushState"]({}, "", path);
    setViewState(next);
    setSideOpen(false);
  };
  const openService = (service: Service) => {
    setSelectedService(service);
    history.pushState({}, "", `/catalog/${encodeURIComponent(service.name)}`);
    setViewState("service");
  };
  const openTeam = (team: Team) => {
    setSelectedTeam(team);
    history.pushState({}, "", `/teams/${encodeURIComponent(team.name)}`);
    setViewState("team");
  };
  const selectActiveTeam = (name: string) => {
    setActiveTeamName(name);
    setSelectedTeam(null);
  };
  const makePrimary = async (teamName = activeTeam?.name) => {
    if (!teamName) return;
    const response = await fetch("/api/me/primary-team", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ team: teamName }),
    });
    if (response.ok) await refresh();
  };
  const setCollapsed = (value: boolean) => {
    setCollapsedState(value);
    localStorage.setItem("perongen-sidebar", value ? "collapsed" : "expanded");
  };
  const setTheme = (value: "light" | "dark") => {
    setThemeState(value);
    localStorage.setItem("perongen-theme", value);
  };
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    const open = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    addEventListener("keydown", open);
    return () => removeEventListener("keydown", open);
  }, []);
  useEffect(() => {
    const resolveRoute = () => {
      const next = viewFromPath(location.pathname);
      if (next === "service")
        setSelectedService(
          data.services.find(
            (service) =>
              service.name ===
              decodeURIComponent(location.pathname.slice("/catalog/".length)),
          ) || null,
        );
      if (next === "team")
        setSelectedTeam(
          data.teams.find(
            (team) =>
              team.name ===
              decodeURIComponent(location.pathname.slice("/teams/".length)),
          ) || null,
        );
      setViewState(next);
    };
    resolveRoute();
    addEventListener("popstate", resolveRoute);
    return () => removeEventListener("popstate", resolveRoute);
  }, [data.services, data.teams]);
  useEffect(() => {
    document.title = portal.general.name;
    document.documentElement.style.setProperty(
      "--blue",
      portal.general.accentColor,
    );
  }, [portal.general.name, portal.general.accentColor]);
  useEffect(() => {
    trackPortalEvent("page.view", {
      path: location.pathname,
      entityKind:
        view === "service" ? "service" : view === "team" ? "team" : "page",
      entityKey:
        view === "service"
          ? selectedService?.name
          : view === "team"
            ? selectedTeam?.name
            : view,
    });
  }, [view, selectedService?.name, selectedTeam?.name]);
  useEffect(() => {
    if (!memberTeams.length) return;
    if (
      !activeTeamName ||
      !memberTeams.some((team) => team.name === activeTeamName)
    )
      setActiveTeamName(
        memberTeams.some((team) => team.name === primaryTeam)
          ? String(primaryTeam)
          : memberTeams[0].name,
      );
  }, [memberTeams.map((team) => team.name).join(","), primaryTeam]);
  return (
    <div className={`app ${collapsed ? "sidebar-collapsed" : ""}`}>
      <Sidebar
        view={view}
        setView={navigate}
        open={sideOpen}
        setOpen={setSideOpen}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        user={user}
        name={portal.general.name}
        counts={{
          services: data.services.length,
          teams: data.teams.length,
          users: data.users.length,
        }}
      />
      <main>
        <Header
          title={titles[view]}
          name={portal.general.name}
          onMenu={() => setSideOpen(true)}
          onSettings={() => navigate("settings")}
          onSearch={() => setSearchOpen(true)}
          theme={theme}
          setTheme={setTheme}
        />
        {error && (
          <div className="global-error" role="alert">
            <span>
              <Activity size={16} />
              <strong>Portal data is unavailable</strong>
              <small>{error}</small>
            </span>
            <button onClick={() => refresh()}>Try again</button>
          </div>
        )}
        {view === "overview" ? (
          <Overview
            data={data}
            user={user}
            navigate={navigate}
            loading={loading}
            openService={openService}
            openTeam={openTeam}
            activeTeam={activeTeam}
            memberTeams={memberTeams}
            primaryTeam={primaryTeam}
            setActiveTeam={selectActiveTeam}
            makePrimary={() => makePrimary()}
          />
        ) : view === "inbox" ? (
          <EngineeringInbox
            services={data.services}
            teams={data.teams}
            activity={data.activity}
            openService={openService}
          />
        ) : view === "catalog" ? (
          <Catalog
            services={data.services}
            tiers={portal.catalog.tiers}
            types={portal.catalog.types}
            activity={data.activity}
            openService={openService}
          />
        ) : view === "map" ? (
          <ResourceGraph services={data.services} openService={openService} />
        ) : view === "docs" ? (
          <DocumentationHub
            services={data.services}
            openService={openService}
          />
        ) : view === "service" && selectedService ? (
          <ServiceWorkspace
            service={selectedService}
            cards={portal.scorecards.cards}
            tiers={portal.catalog.tiers}
            types={portal.catalog.types}
            plugins={portal.integrations.plugins}
            navigate={navigate}
            signedIn={Boolean(user)}
          />
        ) : view === "service" ? (
          <div className="page">
            <EmptyState
              icon={Box}
              title={loading ? "Loading service…" : "Service not found"}
              body={
                loading
                  ? "Resolving the catalog route."
                  : "The service may have been renamed, removed, or not synchronized yet."
              }
              action={
                !loading && (
                  <button
                    className="ghost-button"
                    onClick={() => navigate("catalog")}
                  >
                    Open catalog
                  </button>
                )
              }
            />
          </div>
        ) : view === "team" && (selectedTeam || activeTeam) ? (
          <TeamWorkspace
            team={(selectedTeam || activeTeam)!}
            services={data.services}
            primaryTeam={primaryTeam}
            isMember={memberTeamNames.has((selectedTeam || activeTeam)!.name)}
            openService={openService}
            makePrimary={makePrimary}
          />
        ) : view === "team" ? (
          <div className="page">
            <EmptyState
              icon={Users}
              title={loading ? "Loading team…" : "Team not found"}
              body={
                loading
                  ? "Resolving the ownership route."
                  : "The team may have been renamed or is no longer referenced by catalog metadata."
              }
              action={
                !loading && (
                  <button
                    className="ghost-button"
                    onClick={() => navigate("teams")}
                  >
                    Open teams
                  </button>
                )
              }
            />
          </div>
        ) : view === "scorecards" ? (
          <ConfiguredScorecards
            services={data.services}
            cards={portal.scorecards.cards}
            tiers={portal.catalog.tiers}
            types={portal.catalog.types}
          />
        ) : view === "actions" ? (
          <ConfiguredActions
            runs={data.actions}
            actions={portal.actions}
            user={user}
          />
        ) : view === "tools" ? (
          <ToolsPage tools={portal.tools.items} />
        ) : view === "teams" ? (
          <TeamsPage
            teams={data.teams}
            services={data.services}
            navigate={navigate}
            openTeam={openTeam}
          />
        ) : view === "people" ? (
          <PeoplePage users={data.users} />
        ) : view === "settings" && user?.role === "admin" ? (
          <VisualSettings onRefresh={refresh} />
        ) : view === "campaigns" && user?.role === "admin" ? (
          <CampaignsPage
            services={data.services}
            tiers={portal.catalog.tiers}
            types={portal.catalog.types}
          />
        ) : view === "analytics" && user?.role === "admin" ? (
          <AnalyticsPage />
        ) : (
          <Integrations refresh={refresh} />
        )}
      </main>
      <OnboardingGate
        user={user}
        onRefresh={refresh}
        onOpenSettings={() => navigate("settings")}
      />
      <CommandPalette
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        services={data.services}
        teams={data.teams}
        users={data.users}
        actions={portal.actions}
        tools={portal.tools.items}
        navigate={navigate}
        openService={openService}
        openTeam={openTeam}
      />
    </div>
  );
}
