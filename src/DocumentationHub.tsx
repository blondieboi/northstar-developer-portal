import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { safeMarkdownUrl } from "./safe-url";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Clock3,
  ExternalLink,
  FileText,
  Search,
} from "lucide-react";

type Document = {
  path: string;
  title: string;
  content: string;
  source_age_days?: number | null;
  service_name: string;
  repository: string;
  owner: string;
};

const markdownComponents = {
  a: ({ href, children, ...props }: React.ComponentProps<"a">) => {
    const safeHref = safeMarkdownUrl(href || "");
    return safeHref ? (
      <a {...props} href={safeHref} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    );
  },
  img: () => null,
};

function Freshness({ document }: { document: Document }) {
  const age = document.source_age_days ?? null;
  const stale = age !== null && age >= 180;
  return (
    <span className={stale ? "docs-freshness stale" : "docs-freshness"}>
      {stale ? <AlertTriangle size={12} /> : <Clock3 size={12} />}
      {age === null ? "Update date unavailable" : `Updated ${age}d ago`}
    </span>
  );
}

export function DocumentationHub({
  openService,
  services,
}: {
  openService: (service: any) => void;
  services: any[];
}) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selected, setSelected] = useState<Document | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/documents")
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Repository documentation is unavailable");
        return response.json();
      })
      .then((data) => setDocuments(data.documents || []))
      .catch((cause) => setError((cause as Error).message));
  }, []);
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return documents;
    return documents.filter((document) =>
      `${document.title} ${document.path} ${document.service_name} ${document.owner} ${document.content}`
        .toLowerCase()
        .includes(needle),
    );
  }, [documents, query]);
  const serviceCount = new Set(
    documents.map((document) => document.service_name),
  ).size;
  const staleCount = documents.filter(
    (document) => (document.source_age_days || 0) >= 180,
  ).length;
  if (selected)
    return (
      <div className="page docs-reader-page">
        <button className="service-back" onClick={() => setSelected(null)}>
          <ArrowLeft size={14} /> Documentation index
        </button>
        <div className="docs-reader-layout">
          <article className="docs-reader">
            <header>
              <p className="eyebrow">{selected.service_name.toUpperCase()}</p>
              <h1>{selected.title}</h1>
              <div>
                <code>{selected.path}</code>
                <Freshness document={selected} />
              </div>
            </header>
            <div className="markdown-body">
              <ReactMarkdown
                components={markdownComponents}
                urlTransform={safeMarkdownUrl}
              >
                {selected.content}
              </ReactMarkdown>
            </div>
          </article>
          <aside className="docs-provenance">
            <p className="eyebrow">PROVENANCE</p>
            <h2>Repository owned</h2>
            <p>
              This page is rendered from Markdown on the repository’s default
              branch. Changes remain reviewed alongside code.
            </p>
            <a
              href={`https://github.com/${selected.repository}/blob/main/${selected.path}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Edit on GitHub <ExternalLink size={13} />
            </a>
            <button
              className="text-button"
              onClick={() => {
                const service = services.find(
                  (candidate) => candidate.name === selected.service_name,
                );
                if (service) openService(service);
              }}
            >
              Open service dossier
            </button>
          </aside>
        </div>
      </div>
    );
  return (
    <div className="page docs-hub">
      <section className="page-intro docs-intro">
        <div>
          <p className="eyebrow">REPOSITORY KNOWLEDGE</p>
          <h1>Documentation with an owner and a revision</h1>
          <p>
            Search service documentation without separating it from the code,
            team, and operational context responsible for keeping it true.
          </p>
        </div>
        <div className="docs-stats">
          <span>
            <strong>{documents.length}</strong> pages
          </span>
          <span>
            <strong>{serviceCount}</strong> services
          </span>
          <span className={staleCount ? "warn" : ""}>
            <strong>{staleCount}</strong> stale
          </span>
        </div>
      </section>
      <label className="search-box docs-search">
        <Search size={16} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search titles, services, owners, and page contents"
        />
      </label>
      {error ? (
        <div className="global-error" role="alert">
          <AlertTriangle size={17} /> {error}
        </div>
      ) : !documents.length ? (
        <section className="record-empty docs-empty">
          <BookOpen size={22} />
          <div>
            <strong>No repository documentation has been indexed</strong>
            <p>
              Add a README or Markdown files under <code>docs/</code>, then
              synchronize the catalog.
            </p>
          </div>
        </section>
      ) : (
        <div className="docs-index">
          {results.map((document) => (
            <button
              onClick={() => setSelected(document)}
              key={`${document.service_name}:${document.path}`}
            >
              <span className="docs-file-mark">
                <FileText size={17} />
              </span>
              <span>
                <small>{document.service_name}</small>
                <strong>{document.title}</strong>
                <em>{document.path}</em>
              </span>
              <Freshness document={document} />
            </button>
          ))}
          {!results.length && (
            <div className="record-empty">
              <Search size={18} />
              <div>
                <strong>No documentation matches “{query}”</strong>
                <p>Try a service, owner, filename, or phrase from the page.</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ServiceDocumentation({ serviceName }: { serviceName: string }) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selected, setSelected] = useState<Document | null>(null);
  useEffect(() => {
    fetch(`/api/documents?service=${encodeURIComponent(serviceName)}`)
      .then((response) => (response.ok ? response.json() : { documents: [] }))
      .then((data) => setDocuments(data.documents || []))
      .catch(() => {});
  }, [serviceName]);
  return (
    <section className="record-section service-documents">
      <div className="record-section-head">
        <div>
          <p className="eyebrow">DOCUMENTATION</p>
          <h2>Repository knowledge</h2>
          <p>{documents.length} indexed Markdown pages</p>
        </div>
      </div>
      {!documents.length ? (
        <div className="record-empty">
          <BookOpen size={18} />
          <div>
            <strong>No documentation indexed</strong>
            <p>
              Add a README or Markdown pages under the configured docs path.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="service-doc-list">
            {documents.slice(0, 8).map((document) => (
              <button
                onClick={() => setSelected(document)}
                key={`${document.service_name}:${document.path}`}
              >
                <FileText size={15} />
                <span>
                  <strong>{document.title}</strong>
                  <small>{document.path}</small>
                </span>
                <Freshness document={document} />
              </button>
            ))}
          </div>
          {selected && (
            <div className="service-doc-preview">
              <button
                onClick={() => setSelected(null)}
                aria-label="Close document"
              >
                ×
              </button>
              <h3>{selected.title}</h3>
              <div className="markdown-body">
                <ReactMarkdown
                  components={markdownComponents}
                  urlTransform={safeMarkdownUrl}
                >
                  {selected.content}
                </ReactMarkdown>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
