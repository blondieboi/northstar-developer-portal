# Scorecard rules

Scorecard configuration contains a strict array of weighted rules:

```yaml
apiVersion: northstar.dev/v1
scorecards:
  rules:
    - id: description
      title: Description is complete
      description: At least 20 characters
      path: metadata.description
      operator: minLength
      value: 20
      weight: 1
      severity: recommended
      enabled: true
      tiers: [critical, high]
```

## Rule fields

| Field | Required | Validation |
| --- | --- | --- |
| `id` | Yes | Non-empty unique identifier |
| `title` | Yes | Non-empty user-facing check name |
| `description` | No | Defaults to an empty string |
| `path` | Yes | Non-empty dotted metadata path |
| `operator` | Yes | One of the operators below |
| `value` | Depends | Expected value for operators other than `present` |
| `weight` | Yes | Positive number; defaults to `1` |
| `severity` | Yes | `required` or `recommended` |
| `enabled` | Yes | Defaults to `true` |
| `tiers` | No | Non-empty list of configured tier IDs; omission means all services |

## Operators

| Operator | Passes when |
| --- | --- |
| `present` | The value is not missing, `null`, or an empty string |
| `equals` | The metadata value strictly equals `value` |
| `oneOf` | `value` is an array containing the metadata value |
| `minLength` | The metadata value is a string at least `value` characters long |
| `contains` | The metadata value is an array and one serialized item contains the configured text, case-insensitively |

## Common examples

```yaml
- id: lifecycle
  title: Lifecycle is declared
  description: Lifecycle is accepted
  path: spec.lifecycle
  operator: oneOf
  value: [production, experimental, deprecated]
  weight: 1
  severity: required
  enabled: true

- id: docs
  title: Documentation link exists
  description: Links contain documentation
  path: spec.links
  operator: contains
  value: documentation
  weight: 1
  severity: recommended
  enabled: true
```

Weights normalize across enabled rules. Disabling a rule removes its weight from both the numerator and denominator.

## Tier-scoped checks

Add `tiers` when a check should apply only to particular service criticalities:

```yaml
- id: runbook
  title: Incident runbook exists
  description: Higher-impact services need an operating procedure
  path: spec.links
  operator: contains
  value: runbook
  tiers: [critical, high]
  weight: 2
  severity: required
  enabled: true
```

Rules without `tiers` remain global, including for services that have not declared a tier. For each service, weights normalize only across applicable rules. Aggregate rule results use only eligible services as their denominator; a rule with no eligible services is shown as not applicable rather than failing.
