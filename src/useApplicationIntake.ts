import { useEffect, useMemo, useState } from "react";
import type { IntakeDraft } from "./intake-contract";

export type IntakeEvidence = {
  field: keyof IntakeDraft;
  value: string;
  confidence: "explicit" | "strong" | "inferred" | "unavailable";
  source: string;
  detail: string;
};

export type IntakeCandidate = {
  repository: string;
  url: string;
  archived: boolean;
  fork: boolean;
  pushedAt: string | null;
  scanError?: string;
  readiness: number;
  draft: IntakeDraft;
  evidence: IntakeEvidence[];
  plugins: Array<{
    id: string;
    title: string;
    enabled: boolean;
    recommended: boolean;
    reason: string;
  }>;
};

export type IntakeData = {
  candidates: IntakeCandidate[];
  scannedAt: string | null;
  cached: boolean;
  metadataPath: string;
  teams: Array<{ name: string; title: string }>;
  catalog: {
    lifecycles: string[];
    tiers: Array<{ id: string; title: string }>;
    types: Array<{ id: string; title: string }>;
  };
};

type PullRequestResult = {
  number: number | null;
  url: string | null;
  branch: string | null;
  alreadyCataloged: boolean;
};

const empty: IntakeData = {
  candidates: [],
  scannedAt: null,
  cached: false,
  metadataPath: ".portal/service.yaml",
  teams: [],
  catalog: { lifecycles: [], tiers: [], types: [] },
};

async function jsonResponse(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || fallback);
  return body;
}

export function useApplicationIntake() {
  const [data, setData] = useState<IntakeData>(empty);
  const [selected, setSelected] = useState("");
  const [draft, setDraft] = useState<IntakeDraft | null>(null);
  const [query, setQuery] = useState("");
  const [yaml, setYaml] = useState("");
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [working, setWorking] = useState(false);
  const [scanError, setScanError] = useState("");
  const [proposalError, setProposalError] = useState("");
  const [result, setResult] = useState<PullRequestResult | null>(null);

  async function scan(refresh = false) {
    setLoading(true);
    setScanError("");
    setResult(null);
    try {
      const response = await fetch(
        `/api/admin/intake${refresh ? "?refresh=1" : ""}`,
      );
      const body = (await jsonResponse(
        response,
        "Repository discovery failed",
      )) as IntakeData;
      setData(body);
      const next =
        body.candidates.find(
          (candidate) => candidate.repository === selected,
        ) || body.candidates[0];
      setSelected(next?.repository || "");
      setDraft(next ? structuredClone(next.draft) : null);
    } catch (nextError) {
      setScanError((nextError as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void scan(false);
  }, []);

  const candidate =
    data.candidates.find((item) => item.repository === selected) || null;
  const evidence = useMemo(
    () =>
      Object.fromEntries(
        (candidate?.evidence || []).map((item) => [item.field, item]),
      ) as Partial<Record<keyof IntakeDraft, IntakeEvidence>>,
    [candidate],
  );
  const filtered = useMemo(
    () =>
      data.candidates.filter((item) =>
        item.repository.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [data.candidates, query],
  );
  const missing = useMemo(() => {
    if (!draft) return [];
    return [
      !draft.owner && "owner",
      !draft.lifecycle && "lifecycle",
      !draft.exposure && "exposure",
      !draft.dataSensitivity && "data sensitivity",
      !draft.authentication && "authentication",
      draft.lifecycle === "experimental" && !draft.expiresAt && "experiment expiry",
    ].filter(Boolean) as string[];
  }, [draft]);

  useEffect(() => {
    if (!draft) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setPreviewing(true);
      try {
        const response = await fetch("/api/admin/intake/preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ draft }),
          signal: controller.signal,
        });
        const body = await jsonResponse(response, "Metadata proposal is invalid");
        setYaml(body.yaml);
        setProposalError("");
      } catch (nextError) {
        if ((nextError as Error).name !== "AbortError") {
          setYaml("");
          setProposalError((nextError as Error).message);
        }
      } finally {
        if (!controller.signal.aborted) setPreviewing(false);
      }
    }, 240);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [draft]);

  const update = <K extends keyof IntakeDraft>(
    key: K,
    value: IntakeDraft[K],
  ) => setDraft((current) => (current ? { ...current, [key]: value } : current));

  const choose = (item: IntakeCandidate) => {
    setSelected(item.repository);
    setDraft(structuredClone(item.draft));
    setYaml("");
    setProposalError("");
    setResult(null);
  };

  async function onboard() {
    if (!draft || !candidate || !yaml) return;
    setWorking(true);
    setProposalError("");
    try {
      const response = await fetch("/api/admin/intake/onboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repository: candidate.repository, draft }),
      });
      const body = await jsonResponse(
        response,
        "Onboarding pull request could not be opened",
      );
      setResult(body.pullRequest);
    } catch (nextError) {
      setProposalError((nextError as Error).message);
    } finally {
      setWorking(false);
    }
  }

  return {
    data,
    selected,
    draft,
    query,
    yaml,
    loading,
    previewing,
    working,
    scanError,
    proposalError,
    result,
    candidate,
    evidence,
    filtered,
    missing,
    setQuery,
    scan,
    update,
    choose,
    onboard,
  };
}
