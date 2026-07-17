# Integration plugins

Plugins bring operational data into contained portal surfaces without allowing administrators to upload executable code. Every available plugin ships with Perongen, has a validated configuration schema, and runs through separate server and browser registries.

## Enable a plugin

Open **Settings → Integrations**, enable the provider, adjust its options, and commit the change. The same page shows deployment readiness, latest provider health, contributed surfaces, manual refresh, and webhook deliveries.

Plugin settings are non-secret and live in `integrations.yaml`. Provider credentials remain deployment-only. Disabling a plugin stops collection and removes its generated service and scorecard surfaces; cached snapshots remain available for recovery but are not evaluated.

Some plugins contribute a default scorecard. When **GitHub repository standards** is enabled, Perongen first commits the non-primary **Repository standards** card to `scorecards.yaml`, then commits the enabled provider to `integrations.yaml`. Its eight checks cover CODEOWNERS, README, branch protection, security policy, contribution guidance, issue tracking, repository description, and topics. If `scorecards.yaml` already contains `repository-standards`, Perongen leaves it unchanged, so administrator policy always takes precedence.

Deployments upgraded from an earlier release may already have the provider enabled without its scorecard. In that case, **Settings → Integrations** shows the missing configuration; choose **Add on commit**, then commit the prepared change.

## Built-in GitHub suite

All six built-in plugins use each service's synchronized repository and installation ID.

| Plugin                          | Signals                                                                                                          |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| GitHub Actions                  | Workflow runs, success rate, and latest successful run                                                           |
| GitHub pull requests            | Open, draft, review-requested, stale, and oldest pull requests                                                   |
| GitHub repository standards     | Default Repository standards scorecard covering CODEOWNERS, documentation, policy, topics, and branch safeguards |
| GitHub deployments and releases | Environment deployments, delivery status, and latest release                                                     |
| GitHub security                 | Dependabot, code-scanning, and secret-scanning alerts                                                            |
| GitHub maintenance              | Issue backlog, stale issues, contributors, and commit freshness                                                  |

Configurable thresholds include:

- Actions `lookbackDays` and `maximumRuns`;
- pull request `staleAfterDays` and `maximumPullRequests`;
- deployments `maximumDeployments`;
- maintenance `staleAfterDays`.

Collection runs after service synchronization, from the manual refresh control, after plugin configuration changes, and for relevant signed repository events. Provider failures are stored as degraded snapshots and do not fail catalog synchronization.

## Data and failure isolation

Plugin snapshots use a generic PostgreSQL store keyed by plugin, entity kind, and entity key. Each snapshot records status, data, error, observation time, and expiry. Core service rows do not gain provider-specific columns.

Plugin-backed scorecard rules become not applicable when their provider is disabled or has never produced data. This prevents a connection outage from being misreported as a service standards failure.

Available plugin facts also feed the Engineering inbox. Last successful snapshot data remains available when a later refresh fails, while health reports the failure. Expired snapshots are labeled stale.

## Adding a built-in plugin

Implement the manifest, schema, server collector, and client surface inside a dedicated plugin directory. Register server and client modules separately so credentials and Node-only dependencies cannot enter the browser bundle. A provider should catch external failures at the runtime boundary and return only the normalized fields needed by portal surfaces.
