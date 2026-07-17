# Services and catalog

The software catalog is the authoritative list of successfully validated service metadata discovered through the installed GitHub App.

## Register a service

Add a file at the configured service metadata path, `.portal/service.yaml` by default:

```yaml
apiVersion: northstar.dev/v1
kind: Service
metadata:
  name: checkout-api
  description: Core checkout orchestration and payment routing.
spec:
  owner: team:checkout
  lifecycle: production
  tier: critical
  type: backend
  system: commerce
  language: TypeScript
  links:
    - name: Documentation
      url: https://docs.example.com/checkout
```

Merge the file into a repository visible to the GitHub App. A push webhook that includes the configured path triggers synchronization. An administrator can also run a manual installation sync.

## Find a service

Catalog search matches service name, owner, and system. Filter by tier, service type, or both to focus on the relevant class. Each row shows the configured classification and current metadata score. Select a row to open its shareable `/catalog/:service-name` dossier. The global command palette (`⌘K` on macOS or `Ctrl+K` elsewhere) searches services, teams, people, actions, and tools.

## Read a service dossier

The dossier groups information by purpose:

- **Standards** shows every scorecard result and the primary card's applicable checks.
- **Scorecard history** records changes so regressions and improvements are visible.
- **Plugin sections** show normalized Actions, pull request, standards, deployment, security, and maintenance signals.
- **Useful destinations** comes from `spec.links`.
- **Signals** records the latest catalog and repository state available to Perongen.
- **Stored metadata** shows the exact synchronized document.
- **Ownership, source, and classification** identify the team, repository, lifecycle, operational tier, and architectural type responsible for the service.

## Correct catalog data

Edit `.portal/service.yaml` in the source repository, then merge and synchronize it. Service data cannot be edited directly in Perongen because that would split the source of truth.

If the service never appears, validate the metadata path, document shape, GitHub App installation access, and latest delivery under **Settings → Integrations**. The Catalog screen preserves repository-level validation failures from the latest synchronization and links directly to the rejected metadata file. See [Troubleshooting](/reference/troubleshooting#service-does-not-appear).

## Remove or retire a service

Use a configured lifecycle such as `deprecated` when the service still exists but is being retired. Removing the metadata file stops future registration; catalog cleanup behavior should be coordinated with the portal administrator before deleting authoritative records.
