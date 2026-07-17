import {
  Box,
  BookOpen,
  CircleUserRound,
  FileCode2,
  Link2,
  Network,
  Search,
  ShieldCheck,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { trackPortalEvent } from "./telemetry";

type Result = {
  id: string;
  kind: string;
  title: string;
  subtitle: string;
  icon: typeof Box;
  run: () => void;
};

export function CommandPalette({
  open,
  onClose,
  services,
  teams,
  users,
  actions,
  tools,
  navigate,
  openService,
  openTeam,
}: {
  open: boolean;
  onClose: () => void;
  services: any[];
  teams: any[];
  users: any[];
  actions: any[];
  tools: any[];
  navigate: (view: any) => void;
  openService: (service: any) => void;
  openTeam: (team: any) => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      queueMicrotask(() => input.current?.focus());
    }
  }, [open]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    addEventListener("keydown", close);
    return () => removeEventListener("keydown", close);
  }, [onClose]);
  const results = useMemo<Result[]>(
    () =>
      [
        ...services.map((service) => ({
          id: `service-${service.name}`,
          kind: "Service",
          title: service.name,
          subtitle: `${service.owner} · ${service.repository}`,
          icon: Box,
          run: () => openService(service),
        })),
        ...teams.map((team) => ({
          id: `team-${team.name}`,
          kind: "Team",
          title: team.title,
          subtitle: `team:${team.name}`,
          icon: Users,
          run: () => openTeam(team),
        })),
        ...users.map((user) => ({
          id: `person-${user.login}`,
          kind: "Person",
          title: user.name,
          subtitle: `@${user.login}`,
          icon: CircleUserRound,
          run: () => navigate("people"),
        })),
        ...actions.map((action) => ({
          id: `action-${action.id}`,
          kind: "Action",
          title: action.title,
          subtitle: action.description,
          icon: Zap,
          run: () => navigate("actions"),
        })),
        ...tools.map((tool) => ({
          id: `tool-${tool.id}`,
          kind: "Tool",
          title: tool.name,
          subtitle: tool.description,
          icon: Link2,
          run: () => navigate("tools"),
        })),
        {
          id: "page-map",
          kind: "Page",
          title: "Software map",
          subtitle: "Dependencies, APIs, systems, and resources",
          icon: Network,
          run: () => navigate("map"),
        },
        {
          id: "page-docs",
          kind: "Page",
          title: "Documentation",
          subtitle: "Repository-owned engineering knowledge",
          icon: BookOpen,
          run: () => navigate("docs"),
        },
        {
          id: "page-inbox",
          kind: "Page",
          title: "Engineering inbox",
          subtitle: "Work that needs attention",
          icon: FileCode2,
          run: () => navigate("inbox"),
        },
        {
          id: "page-scorecards",
          kind: "Page",
          title: "Scorecards",
          subtitle: "Engineering standards and coverage",
          icon: ShieldCheck,
          run: () => navigate("scorecards"),
        },
      ]
        .filter((item) =>
          (item.title + " " + item.subtitle + " " + item.kind)
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .slice(0, 14),
    [
      query,
      services,
      teams,
      users,
      actions,
      tools,
      navigate,
      openService,
      openTeam,
    ],
  );
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    if (!open || query.trim().length < 2 || results.length) return;
    const timer = setTimeout(
      () =>
        trackPortalEvent("search.empty", {
          path: location.pathname,
          properties: { query: query.trim().slice(0, 120) },
        }),
      800,
    );
    return () => clearTimeout(timer);
  }, [open, query, results.length]);
  useEffect(() => {
    if (!open) return;
    const browse = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((value) =>
          results.length ? (value + 1) % results.length : 0,
        );
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((value) =>
          results.length ? (value - 1 + results.length) % results.length : 0,
        );
      } else if (event.key === "Enter" && results[active]) {
        event.preventDefault();
        results[active].run();
        onClose();
      }
    };
    addEventListener("keydown", browse);
    return () => removeEventListener("keydown", browse);
  }, [open, results, active, onClose]);
  if (!open) return null;
  const choose = (result: Result) => {
    result.run();
    onClose();
  };
  return (
    <div
      className="command-wrap"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Search Perongen"
      >
        <div className="command-input">
          <Search size={19} />
          <input
            ref={input}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search services, teams, people, actions, and tools"
            aria-label="Search"
            aria-activedescendant={results[active]?.id}
          />
          <button onClick={onClose} aria-label="Close search">
            <X size={17} />
          </button>
        </div>
        <div className="command-results" role="listbox">
          {results.length ? (
            results.map((result, index) => {
              const Icon = result.icon;
              return (
                <button
                  role="option"
                  id={result.id}
                  aria-selected={index === active}
                  key={result.id}
                  onClick={() => choose(result)}
                  onMouseEnter={() => setActive(index)}
                >
                  <span className="command-icon">
                    <Icon size={17} />
                  </span>
                  <span>
                    <strong>{result.title}</strong>
                    <small>{result.subtitle}</small>
                  </span>
                  <em>{result.kind}</em>
                </button>
              );
            })
          ) : (
            <div className="command-empty">
              <Search size={20} />
              <strong>No results</strong>
              <span>Try a service, team, person, action, or tool name.</span>
            </div>
          )}
        </div>
        <footer>
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> browse
          </span>
          <span>
            <kbd>esc</kbd> close
          </span>
        </footer>
      </section>
    </div>
  );
}
