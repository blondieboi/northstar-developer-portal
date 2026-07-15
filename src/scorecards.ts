export type ScorecardRule = {
  id: string
  title: string
  description: string
  path: string
  operator: 'present' | 'equals' | 'oneOf' | 'minLength' | 'contains'
  value?: unknown
  weight: number
  severity: 'required' | 'recommended'
  enabled: boolean
  tiers?: string[]
  types?: string[]
  source?: { kind: 'metadata' } | { kind: 'plugin'; plugin: string }
}

export type ScorecardDefinition = {
  id: string
  title: string
  description: string
  enabled: boolean
  primary: boolean
  rules: ScorecardRule[]
}

export type PluginFacts = Record<string, unknown>

export function valueAt(value: unknown, path: string) {
  return path.split('.').reduce<unknown>((current, key) =>
    current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined, value)
}

export function serviceTier(metadata: unknown) {
  const tier = valueAt(metadata, 'spec.tier')
  return typeof tier === 'string' && tier ? tier : null
}

export function serviceType(metadata: unknown) {
  const type = valueAt(metadata, 'spec.type')
  return typeof type === 'string' && type ? type : null
}

export function ruleValue(metadata: unknown, rule: ScorecardRule, plugins: PluginFacts = {}) {
  return rule.source?.kind === 'plugin' ? valueAt(plugins[rule.source.plugin], rule.path) : valueAt(metadata, rule.path)
}

export function ruleApplies(metadata: unknown, rule: ScorecardRule, plugins: PluginFacts = {}) {
  const tier = serviceTier(metadata)
  const type = serviceType(metadata)
  const tierMatches = !rule.tiers?.length || Boolean(tier && rule.tiers.includes(tier))
  const typeMatches = !rule.types?.length || Boolean(type && rule.types.includes(type))
  const sourceAvailable = rule.source?.kind !== 'plugin' || plugins[rule.source.plugin] !== undefined
  return tierMatches && typeMatches && sourceAvailable
}

export function evaluateRule(metadata: unknown, rule: ScorecardRule, plugins: PluginFacts = {}) {
  const value = ruleValue(metadata, rule, plugins)
  switch (rule.operator) {
    case 'present': return value !== undefined && value !== null && value !== ''
    case 'equals': return value === rule.value
    case 'oneOf': return Array.isArray(rule.value) && rule.value.includes(value)
    case 'minLength': return typeof value === 'string' && value.length >= Number(rule.value)
    case 'contains': return Array.isArray(value) && value.some(item => JSON.stringify(item).toLowerCase().includes(String(rule.value).toLowerCase()))
  }
}

export function applicableRules(metadata: unknown, rules: ScorecardRule[], plugins: PluginFacts = {}) {
  return rules.filter(rule => rule.enabled && ruleApplies(metadata, rule, plugins))
}

export function calculateScore(metadata: unknown, rules: ScorecardRule[], plugins: PluginFacts = {}) {
  const applicable = applicableRules(metadata, rules, plugins)
  const total = applicable.reduce((sum, rule) => sum + rule.weight, 0)
  if (!total) return 100
  const earned = applicable.filter(rule => evaluateRule(metadata, rule, plugins)).reduce((sum, rule) => sum + rule.weight, 0)
  return Math.round(earned / total * 100)
}

export function calculateScorecards(metadata: unknown, cards: ScorecardDefinition[], plugins: PluginFacts = {}) {
  return Object.fromEntries(cards.filter(card => card.enabled).map(card => [card.id, calculateScore(metadata, card.rules, plugins)]))
}
