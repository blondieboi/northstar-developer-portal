# Service metadata

Place one service document at the configured path in each repository that should register a service. The default is `.portal/service.yaml`.

## Complete example

```yaml
apiVersion: northstar.dev/v1
kind: Service
metadata:
  name: checkout-api
  title: Checkout API
  description: Core checkout orchestration and payment routing.
  tags:
    - payments
    - tier-1
spec:
  owner: team:checkout
  lifecycle: production
  system: commerce
  language: TypeScript
  links:
    - name: Documentation
      url: https://docs.example.com/checkout
    - name: Dashboard
      url: https://metrics.example.com/checkout
```

## Field reference

| Field | Required | Notes |
| --- | --- | --- |
| `apiVersion` | Yes | Accepted as a string; use `northstar.dev/v1` |
| `kind` | Yes | Must be `Service` |
| `metadata.name` | Yes | Non-empty stable service identifier |
| `metadata.title` | No | Human-readable title used in the dossier |
| `metadata.description` | No | Defaults to an empty string |
| `metadata.tags` | No | Array of strings retained in stored metadata |
| `spec.owner` | Yes | Non-empty owner; `team:<name>` connects to team metadata |
| `spec.lifecycle` | Yes | Must also appear in configured catalog lifecycles |
| `spec.system` | No | Defaults to `Unassigned` in catalog views |
| `spec.language` | No | Falls back to the repository language, then `Unknown` |
| `spec.links` | No | Array of name and valid URL pairs |

## Ownership

Use a stable team reference:

```yaml
spec:
  owner: team:platform
```

Perongen removes the `team:` prefix for its stored ownership key. If team metadata is not present, it creates the minimum ownership record so the service is still attributable.

## Lifecycle validation

The schema accepts a non-empty lifecycle string, but ingestion also checks the portal's configured lifecycle list. Add a new lifecycle to `catalog.yaml` before using it in service metadata.

## Scorecard paths

Scorecards evaluate the parsed document using dotted paths such as `metadata.description`, `spec.owner`, or `spec.links`. Keep field names stable when rules depend on them.
