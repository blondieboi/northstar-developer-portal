# Service metadata

Place one service document at the configured path in each repository that should register a service. The default is `.portal/service.yaml`.

## Complete example

```yaml
apiVersion: perongen.dev/v1
kind: Service
metadata:
  name: checkout-api
  title: Checkout API
  description: Core checkout orchestration and payment routing.
  tags:
    - payments
spec:
  owner: team:checkout
  lifecycle: production
  tier: critical
  type: backend
  system: commerce
  language: TypeScript
  risk:
    exposure: public
    dataSensitivity: confidential
    authentication: required
  links:
    - name: Documentation
      url: https://docs.example.com/checkout
    - name: Dashboard
      url: https://metrics.example.com/checkout
  dependsOn: [service:inventory-api]
  providesApis: [api:checkout]
  consumesApis: [api:pricing]
  resources:
    - name: checkout-db
      type: database
      relation: reads-writes
  docsPath: docs
  operational:
    onCall: checkout-primary
    runbookUrl: https://docs.example.com/checkout/runbook
    dashboardUrl: https://metrics.example.com/checkout
```

## Field reference

| Field                  | Required | Notes                                                                          |
| ---------------------- | -------- | ------------------------------------------------------------------------------ |
| `apiVersion`           | Yes      | Accepted as a string; use `perongen.dev/v1`                                   |
| `kind`                 | Yes      | Must be `Service`                                                              |
| `metadata.name`        | Yes      | Non-empty stable service identifier                                            |
| `metadata.title`       | No       | Human-readable title used in the dossier                                       |
| `metadata.description` | No       | Defaults to an empty string                                                    |
| `metadata.tags`        | No       | Array of strings retained in stored metadata                                   |
| `spec.owner`           | Yes      | Non-empty owner; `team:<name>` connects to team metadata                       |
| `spec.lifecycle`       | Yes      | Must also appear in configured catalog lifecycles                              |
| `spec.tier`            | No       | Stable ID from the configured catalog tiers                                    |
| `spec.type`            | No       | Stable ID from the configured catalog service types                            |
| `spec.system`          | No       | Defaults to `Unassigned` in catalog views                                      |
| `spec.language`        | No       | Falls back to the repository language, then `Unknown`                          |
| `spec.links`           | No       | Array of name and valid URL pairs                                              |
| `spec.dependsOn`       | No       | Entity references consumed by the Software map; unprefixed values are services |
| `spec.providesApis`    | No       | API references provided by this service                                        |
| `spec.consumesApis`    | No       | API references consumed by this service                                        |
| `spec.resources`       | No       | Named infrastructure resources with a type, relation, and optional URL         |
| `spec.docsPath`        | No       | Repository directory containing Markdown; defaults to `docs`                   |
| `spec.operational`     | No       | On-call name and optional runbook, dashboard, SLO, and cost URLs               |
| `spec.risk`            | No       | Exposure, data sensitivity, and authentication facts used to derive risk       |
| `spec.experiment`      | Required for experimental | Review deadline; `expiresAt` uses `YYYY-MM-DD`                   |

## Risk classification

`spec.risk` records the three facts Perongen uses to derive application risk:

| Field | Values |
| --- | --- |
| `exposure` | `internal`, `public` |
| `dataSensitivity` | `none`, `internal`, `confidential`, `restricted` |
| `authentication` | `none`, `optional`, `required` |

Perongen combines these facts with `spec.lifecycle` into `low`, `moderate`, `high`, or `critical` risk. Missing inputs remain explicitly `unclassified`; Perongen does not guess. Non-primary scorecards can target selected risk levels, allowing stronger standards to apply to public or sensitive applications without duplicating catalog entities.

## Time-bound experiments

An experimental service must declare its review deadline:

```yaml
spec:
  lifecycle: experimental
  experiment:
    expiresAt: 2026-09-30
```

Experiments approaching expiry or already expired appear in the engineering inbox and service guardrail ledger. Signed-in users can extend the date, promote the service to `production`, or archive it into `deprecated`; each action opens a reviewable metadata pull request rather than mutating the catalog database.

## Relationships and resources

Relationship references use `kind:key`, for example `service:inventory-api` or `api:pricing`. The portal persists normalized edges during synchronization and uses them for forward and reverse impact paths. Resource types and relation verbs are open strings so teams can represent organization-specific infrastructure without changing the portal schema.

## Documentation and operations

The root README and Markdown under `spec.docsPath` are indexed during synchronization. `spec.operational` accepts `onCall`, `runbookUrl`, `dashboardUrl`, `sloUrl`, and `costUrl`. These values appear in the service cockpit but never trigger external operations.

## Ownership

Use a stable team reference:

```yaml
spec:
  owner: team:platform
```

Perongen removes the `team:` prefix for its stored ownership key. If team metadata is not present, it creates the minimum ownership record so the service is still attributable.

## Lifecycle validation

The schema accepts a non-empty lifecycle string, but ingestion also checks the portal's configured lifecycle list. Add a new lifecycle to `catalog.yaml` before using it in service metadata.

## Service tier

Tier identifies operational criticality independently of lifecycle. Configure the available tiers in `catalog.yaml`, then reference the stable ID:

```yaml
spec:
  tier: critical
```

The field is optional so existing services continue to synchronize. Administrators can enforce adoption with a global scorecard rule that checks whether `spec.tier` is present. When supplied, the tier must match the active catalog configuration.

## Service type

Type identifies the service's architectural role independently of lifecycle and operational tier. Configure the available types in `catalog.yaml`, then reference the stable ID:

```yaml
spec:
  type: backend
```

The field is optional for backward compatibility. When supplied, it must match the active catalog configuration. Administrators can require it with a global scorecard rule or use it to limit checks to roles such as frontend, backend, fullstack, pipeline, or configuration.

## Scorecard paths

Scorecards evaluate the parsed document using dotted paths such as `metadata.description`, `spec.owner`, `spec.tier`, `spec.type`, or `spec.links`. Keep field names stable when rules depend on them.
