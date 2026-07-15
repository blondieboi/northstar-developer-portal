# Scorecards

Scorecard configuration contains one or more named cards. Exactly one card is primary; its score remains the catalog-wide coverage value used by overview and service tiles.

```yaml
apiVersion: northstar.dev/v1
scorecards:
  cards:
    - id: metadata-quality
      title: Metadata quality
      description: Catalog metadata completeness
      enabled: true
      primary: true
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
          types: [backend, fullstack]
```

## Scorecard fields

| Field | Required | Validation |
| --- | --- | --- |
| `id` | Yes | Unique lowercase slug |
| `title` | Yes | Non-empty display name |
| `description` | No | Defaults to an empty string |
| `enabled` | No | Defaults to `true` |
| `primary` | No | Exactly one configured card must be primary |
| `rules` | Yes | Array of weighted rules; may be empty |

Legacy documents containing `scorecards.rules` are read as one primary `metadata-quality` card. The next scorecard save writes the new `cards` shape.

## Rule fields

| Field | Required | Validation |
| --- | --- | --- |
| `id` | Yes | Unique within its scorecard |
| `title` | Yes | Non-empty user-facing check name |
| `description` | No | Defaults to an empty string |
| `source` | No | Omission or `kind: metadata` reads service metadata; `kind: plugin` also requires a built-in plugin ID |
| `path` | Yes | Dotted path inside the selected source |
| `operator` | Yes | One of the operators below |
| `value` | Depends | Expected value for operators other than `present` |
| `weight` | Yes | Positive number; defaults to `1` |
| `severity` | Yes | `required` or `recommended` |
| `enabled` | Yes | Defaults to `true` |
| `tiers` | No | Non-empty list of configured tier IDs; omission means all services |
| `types` | No | Non-empty list of configured service type IDs; omission means all services |

## Operators

| Operator | Passes when |
| --- | --- |
| `present` | The value is not missing, `null`, or an empty string |
| `equals` | The source value strictly equals `value` |
| `oneOf` | `value` is an array containing the source value |
| `minLength` | The source value is a string at least `value` characters long |
| `contains` | The source value is an array and one serialized item contains the configured text, case-insensitively |

## Plugin-backed rules

Select a built-in provider and use a path relative to that provider's facts:

```yaml
- id: latest-action-succeeded
  title: Latest workflow run succeeded
  source:
    kind: plugin
    plugin: github-actions
  path: runs.0.conclusion
  operator: equals
  value: success
  weight: 1
  severity: recommended
  enabled: true
```

When the plugin is disabled or no snapshot exists, the rule is not applicable and contributes neither earned nor possible weight. A degraded provider may retain its last successful snapshot so an external outage does not immediately erase context.

## Scoped checks

Rules can target tiers, types, or both. When both are present, a service must match one selected tier and one selected type. Omitting a dimension makes it global.

For each service and scorecard, weights normalize only across enabled, applicable rules:

```text
weight of passing applicable rules ÷ weight of all applicable rules × 100
```

A scorecard with no applicable rules evaluates to 100. Aggregate rule results count only eligible services, and a rule with no eligible services is shown as not applicable rather than failing.
