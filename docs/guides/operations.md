# Service operations

The service cockpit assembles current operational context from existing GitHub providers and service metadata. It does not execute or orchestrate operations.

## Declare operational destinations

```yaml
spec:
  operational:
    onCall: checkout-primary
    runbookUrl: https://docs.example.com/checkout/runbook
    dashboardUrl: https://metrics.example.com/checkout
    sloUrl: https://metrics.example.com/checkout/slo
    costUrl: https://finops.example.com/services/checkout
```

When dedicated operational fields are absent, Perongen can use similarly named entries from `spec.links` for runbooks, dashboards, SLOs, and cost views.

## Cockpit signals

The cockpit shows:

- latest deployment state and the newest deployment per environment;
- open and critical GitHub security findings;
- open incidents inferred from GitHub issues carrying `incident` or `sev` labels;
- on-call, runbook, dashboard, SLO, and cost destinations;
- a single reverse-chronological timeline of deployments, workflow runs, and incidents.

Missing destinations are shown explicitly so they can be addressed through metadata standards or a metadata campaign. Provider failures preserve the last successful plugin snapshot and expose freshness in the existing integration health surfaces.
