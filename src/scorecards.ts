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
}

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

export function ruleApplies(metadata: unknown, rule: ScorecardRule) {
  const tier = serviceTier(metadata)
  const type = serviceType(metadata)
  const tierMatches = !rule.tiers?.length || Boolean(tier && rule.tiers.includes(tier))
  const typeMatches = !rule.types?.length || Boolean(type && rule.types.includes(type))
  return tierMatches && typeMatches
}

export function evaluateRule(metadata: unknown, rule: ScorecardRule) {
  const value = valueAt(metadata, rule.path)
  switch (rule.operator) {
    case 'present': return value !== undefined && value !== null && value !== ''
    case 'equals': return value === rule.value
    case 'oneOf': return Array.isArray(rule.value) && rule.value.includes(value)
    case 'minLength': return typeof value === 'string' && value.length >= Number(rule.value)
    case 'contains': return Array.isArray(value) && value.some(item => JSON.stringify(item).toLowerCase().includes(String(rule.value).toLowerCase()))
  }
}

export function applicableRules(metadata: unknown, rules: ScorecardRule[]) {
  return rules.filter(rule => rule.enabled && ruleApplies(metadata, rule))
}

export function calculateScore(metadata: unknown, rules: ScorecardRule[]) {
  const applicable = applicableRules(metadata, rules)
  const total = applicable.reduce((sum, rule) => sum + rule.weight, 0)
  if (!total) return 100
  const earned = applicable.filter(rule => evaluateRule(metadata, rule)).reduce((sum, rule) => sum + rule.weight, 0)
  return Math.round(earned / total * 100)
}
