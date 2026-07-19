# Scorecards

Scorecard configuration contains one or more named cards. Exactly one card is primary; its score remains the catalog-wide coverage value used by overview and service tiles.

When a failing metadata-backed rule defines a suggested remediation, the service dossier previews the exact field, current value, proposed value, repository, and metadata path before any write occurs. Confirming opens a reviewable GitHub pull request. Its open, merged, or closed state remains visible beside the check and is updated by signed pull-request webhooks.

```yaml
apiVersion: perongen.dev/v1
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
          remediation:
            guidance: Expand metadata.description with the service purpose and boundary.
            docsUrl: https://docs.example.com/standards/descriptions
            suggestedValue: Describe the service purpose, users, and boundary.
```

## Scorecard fields

| Field         | Required | Validation                                  |
| ------------- | -------- | ------------------------------------------- |
| `id`          | Yes      | Unique lowercase slug                       |
| `title`       | Yes      | Non-empty display name                      |
| `description` | No       | Defaults to an empty string                 |
| `enabled`     | No       | Defaults to `true`                          |
| `primary`     | No       | Exactly one configured card must be primary |
| `risks`       | No       | Risk levels this non-primary card applies to; omission applies globally |
| `rules`       | Yes      | Array of weighted rules; may be empty       |

Legacy documents containing `scorecards.rules` are read as one primary `metadata-quality` card. The next scorecard save writes the new `cards` shape.

Enabled plugins may contribute non-primary defaults to the Git-backed configuration. Enabling the GitHub repository standards plugin writes `repository-standards` to `scorecards.yaml` unless the document already contains that ID. After creation it is an ordinary configurable scorecard. Explicit configuration always wins and is never merged with or overwritten by a plugin default.

## Rule fields

| Field         | Required | Validation                                                                                             |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `id`          | Yes      | Unique within its scorecard                                                                            |
| `title`       | Yes      | Non-empty user-facing check name                                                                       |
| `description` | No       | Defaults to an empty string                                                                            |
| `source`      | No       | Omission or `kind: metadata` reads service metadata; `kind: plugin` also requires a built-in plugin ID |
| `path`        | Yes      | Dotted path inside the selected source                                                                 |
| `operator`    | Yes      | One of the operators below                                                                             |
| `value`       | Depends  | Expected value for operators other than `present`                                                      |
| `weight`      | Yes      | Positive number; defaults to `1`                                                                       |
| `severity`    | Yes      | `required` or `recommended`                                                                            |
| `enabled`     | Yes      | Defaults to `true`                                                                                     |
| `tiers`       | No       | Non-empty list of configured tier IDs; omission means all services                                     |
| `types`       | No       | Non-empty list of configured service type IDs; omission means all services                             |
| `remediation` | No       | Guidance, optional documentation URL, and optional metadata value for a GitHub fix PR                  |
| `maxEvidenceAgeHours` | No | Plugin-backed rules only; maximum age of a successful observation before the check fails           |

## Remediation and waivers

Every failing rule can display remediation guidance. Metadata-backed rules with `remediation.suggestedValue` also offer **Open fix PR**, which creates a branch and pull request in the service repository that changes only the rule's dotted metadata path. Plugin-backed rules may provide guidance but cannot generate a metadata fix.

Signed-in users can request a time-bounded waiver with a reason and expiry date. Administrators approve or reject requests under **Campaigns**. Approved waivers remain visible beside the failing check; they do not rewrite the underlying score, so the catalog continues to show the actual technical state separately from the accepted exception.

## Operators

| Operator    | Passes when                                                                                           |
| ----------- | ----------------------------------------------------------------------------------------------------- |
| `present`   | The value is not missing, `null`, or an empty string                                                  |
| `equals`    | The source value strictly equals `value`                                                              |
| `oneOf`     | `value` is an array containing the source value                                                       |
| `minLength` | The source value is a string at least `value` characters long                                         |
| `contains`  | The source value is an array and one serialized item contains the configured text, case-insensitively |

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

When the plugin is disabled or no snapshot exists, the rule is not applicable and contributes neither earned nor possible weight. A degraded provider may retain its last successful snapshot so an external outage does not immediately erase context. Set `maxEvidenceAgeHours` when old evidence must stop satisfying the standard:

```yaml
maxEvidenceAgeHours: 24
```

Cache expiry means a refresh is due; it does not by itself fail a policy. The configured limit is measured from the last successful observation. Once exceeded—or when the observation time is unknown—the applicable rule fails until fresh evidence arrives.

## Scoped checks

Rules can target tiers, types, or both. When both are present, a service must match one selected tier and one selected type. Omitting a dimension makes it global. Non-primary scorecards can additionally define `risks` using `unclassified`, `low`, `moderate`, `high`, or `critical`. Primary scorecards always apply to every service so the catalog-wide score remains comparable.

For each service and scorecard, weights normalize only across enabled, applicable rules:

```text
weight of passing applicable rules ÷ weight of all applicable rules × 100
```

A scorecard with no applicable rules evaluates to 100. Aggregate rule results count only eligible services, and a rule with no eligible services is shown as not applicable rather than failing.
