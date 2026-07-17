import { riskProfile, type RiskLevel } from "./governance.js";

export type ScorecardRule = {
  id: string;
  title: string;
  description: string;
  path: string;
  operator: "present" | "equals" | "oneOf" | "minLength" | "contains";
  value?: unknown;
  weight: number;
  severity: "required" | "recommended";
  enabled: boolean;
  tiers?: string[];
  types?: string[];
  maxEvidenceAgeHours?: number;
  source?: { kind: "metadata" } | { kind: "plugin"; plugin: string };
  remediation?: {
    guidance: string;
    docsUrl?: string;
    suggestedValue?: unknown;
  };
};

export type ScorecardDefinition = {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
  primary: boolean;
  risks?: RiskLevel[];
  rules: ScorecardRule[];
};

export type PluginFacts = Record<string, unknown>;
export type PluginStates = Record<
  string,
  { status?: string; observedAt?: string | null; expiresAt?: string | null }
>;

export function valueAt(value: unknown, path: string) {
  return path
    .split(".")
    .reduce<unknown>(
      (current, key) =>
        current && typeof current === "object"
          ? (current as Record<string, unknown>)[key]
          : undefined,
      value,
    );
}

export function serviceTier(metadata: unknown) {
  const tier = valueAt(metadata, "spec.tier");
  return typeof tier === "string" && tier ? tier : null;
}

export function serviceType(metadata: unknown) {
  const type = valueAt(metadata, "spec.type");
  return typeof type === "string" && type ? type : null;
}

export function ruleValue(
  metadata: unknown,
  rule: ScorecardRule,
  plugins: PluginFacts = {},
) {
  return rule.source?.kind === "plugin"
    ? valueAt(plugins[rule.source.plugin], rule.path)
    : valueAt(metadata, rule.path);
}

export function ruleApplies(
  metadata: unknown,
  rule: ScorecardRule,
  plugins: PluginFacts = {},
) {
  const tier = serviceTier(metadata);
  const type = serviceType(metadata);
  const tierMatches =
    !rule.tiers?.length || Boolean(tier && rule.tiers.includes(tier));
  const typeMatches =
    !rule.types?.length || Boolean(type && rule.types.includes(type));
  const sourceAvailable =
    rule.source?.kind !== "plugin" || plugins[rule.source.plugin] !== undefined;
  return tierMatches && typeMatches && sourceAvailable;
}

export function scorecardApplies(metadata: unknown, card: ScorecardDefinition) {
  const risk = riskProfile(metadata).level;
  return !card.risks?.length || card.risks.includes(risk);
}

export function evidenceFreshness(
  rule: ScorecardRule,
  states: PluginStates = {},
  now = Date.now(),
) {
  if (rule.source?.kind !== "plugin") return { status: "metadata" as const, ageHours: null };
  const state = states[rule.source.plugin];
  if (!state?.observedAt) return { status: "unknown" as const, ageHours: null };
  const ageHours = Math.max(0, (now - new Date(state.observedAt).getTime()) / 3_600_000);
  const stale =
    rule.maxEvidenceAgeHours !== undefined
      ? ageHours > rule.maxEvidenceAgeHours
      : Boolean(state.expiresAt && new Date(state.expiresAt).getTime() < now);
  return {
    status: stale ? ("stale" as const) : state.status === "degraded" ? ("degraded" as const) : ("fresh" as const),
    ageHours,
  };
}

export function evaluateRule(
  metadata: unknown,
  rule: ScorecardRule,
  plugins: PluginFacts = {},
  states: PluginStates = {},
) {
  if (rule.maxEvidenceAgeHours !== undefined) {
    const freshness = evidenceFreshness(rule, states).status;
    if (freshness === "stale" || freshness === "unknown") return false;
  }
  const value = ruleValue(metadata, rule, plugins);
  switch (rule.operator) {
    case "present":
      return value !== undefined && value !== null && value !== "";
    case "equals":
      return value === rule.value;
    case "oneOf":
      return Array.isArray(rule.value) && rule.value.includes(value);
    case "minLength":
      return typeof value === "string" && value.length >= Number(rule.value);
    case "contains":
      return (
        Array.isArray(value) &&
        value.some((item) =>
          JSON.stringify(item)
            .toLowerCase()
            .includes(String(rule.value).toLowerCase()),
        )
      );
  }
}

export function applicableRules(
  metadata: unknown,
  rules: ScorecardRule[],
  plugins: PluginFacts = {},
) {
  return rules.filter(
    (rule) => rule.enabled && ruleApplies(metadata, rule, plugins),
  );
}

export function calculateScore(
  metadata: unknown,
  rules: ScorecardRule[],
  plugins: PluginFacts = {},
  states: PluginStates = {},
) {
  const applicable = applicableRules(metadata, rules, plugins);
  const total = applicable.reduce((sum, rule) => sum + rule.weight, 0);
  if (!total) return 100;
  const earned = applicable
    .filter((rule) => evaluateRule(metadata, rule, plugins, states))
    .reduce((sum, rule) => sum + rule.weight, 0);
  return Math.round((earned / total) * 100);
}

export function calculateScorecards(
  metadata: unknown,
  cards: ScorecardDefinition[],
  plugins: PluginFacts = {},
  states: PluginStates = {},
) {
  return Object.fromEntries(
    cards
      .filter((card) => card.enabled && scorecardApplies(metadata, card))
      .map((card) => [card.id, calculateScore(metadata, card.rules, plugins, states)]),
  );
}
