# Control plane

The control plane lets administrators change canonical portal configuration through guided editors. A save validates the section and commits its YAML file directly to the configured GitHub branch.

## Configuration model

Perongen loads seven documents at one Git revision. This makes configuration reviewable, recoverable, and portable while keeping secrets outside the repository.

Open **Settings** to edit:

- **General** — name, logo, accent, support URL, and documentation URL;
- **Catalog** — metadata paths, lifecycles, and installation ID;
- **Scorecards** — named scorecards, primary coverage, metadata or plugin rules, weights, severity, and live previews;
- **Actions** — workflow destinations, publication, confirmation, and inputs;
- **Tools** — shared resources and destination links;
- **Users** — member and administrator roles;
- **Integrations** — plugin enablement, provider options, deployment health, refresh controls, and deliveries;
- **Audit** — configuration and access history.

## Save safely

When an administrator opens a section, Perongen records the Git blob SHA. Saving sends that expected SHA with the new value. If someone changed the file in GitHub since it was loaded, the commit is rejected as a conflict instead of overwriting their work.

Refresh the section, review the external change, reapply the intended edit, and save again.

## External commits

Valid pushes to the configured directory are applied through the signed webhook. A periodic poll, 60 seconds by default, recovers missed deliveries. Open browsers check the applied revision every 15 seconds and refresh when the active configuration changes.

All present files must validate at the same revision. `integrations.yaml` is the only optional legacy file and is created by its first UI save. Perongen keeps serving the last-known-good revision during a GitHub outage or invalid commit, but configuration writes remain disabled until synchronization recovers.

## Restore defaults

Resetting a section commits the application's built-in default for that section. It is a new audited Git change, not an untracked database override.

## Configure the documentation link

Set `general.documentationUrl` to the public documentation root:

```yaml
documentationUrl: https://blondieboi.github.io/northstar-developer-portal/
```

Self-hosted or forked installations should replace this with their maintained documentation URL. The portal hides its documentation actions when the value is empty.
