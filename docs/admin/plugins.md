# Integration plugins

Plugins bring operational data into contained portal surfaces without allowing administrators to upload executable code. Every available plugin ships with Perongen, has a validated configuration schema, and runs through separate server and browser registries.

## Enable a plugin

Open **Settings → Integrations**, enable the provider, adjust its options, and commit the change. The same page shows deployment readiness, latest provider health, contributed surfaces, manual refresh, and webhook deliveries.

Plugin settings are non-secret and live in `integrations.yaml`. Provider credentials remain deployment-only. Disabling a plugin stops collection and removes its service and scorecard facts; cached snapshots remain available for recovery but are not evaluated.

## GitHub Actions

The bundled GitHub Actions plugin uses each service's synchronized repository and installation ID. It collects recent workflow runs, workflow names, latest success time, and success rate. A service dossier displays the latest runs with direct GitHub links.

Configure:

- `lookbackDays` from 1 through 365;
- `maximumRuns` from 1 through 100.

Collection runs after service synchronization, from the manual refresh control, after plugin configuration changes, and for signed `workflow_run` deliveries. Provider failures are stored as degraded snapshots and do not fail catalog synchronization.

## Data and failure isolation

Plugin snapshots use a generic PostgreSQL store keyed by plugin, entity kind, and entity key. Each snapshot records status, data, error, observation time, and expiry. Core service rows do not gain provider-specific columns.

Plugin-backed scorecard rules become not applicable when their provider is disabled or has never produced data. This prevents a connection outage from being misreported as a service standards failure.

## Adding a built-in plugin

Implement the manifest, schema, server collector, and client surface inside a dedicated plugin directory. Register server and client modules separately so credentials and Node-only dependencies cannot enter the browser bundle. A provider should catch external failures at the runtime boundary and return only the normalized fields needed by portal surfaces.
