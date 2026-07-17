# Perongen

A self-hosted developer portal with a software catalog, ownership and dependency metadata, repository documentation, operational context, configurable standards, GitHub-native remediation, and workflow-backed self-service actions.

## Run locally

Use Node.js 22.12 or newer.

```bash
npm install
npm run dev
npm run dev:api
```

Open `http://localhost:5173`.

## Production build

```bash
npm run build
npm run preview
```

Perongen never substitutes demo entities for missing data. Without a database or synchronized GitHub metadata, each screen renders an explicit empty state with the next setup action.

## Configuration and administration

Perongen reads its canonical non-secret configuration from seven validated YAML files in a GitHub repository. Configure the repository, branch, directory, and GitHub App installation with `NORTHSTAR_CONFIG_REPOSITORY`, `NORTHSTAR_CONFIG_BRANCH`, `NORTHSTAR_CONFIG_DIRECTORY`, and `NORTHSTAR_CONFIG_INSTALLATION_ID`. See `config.example/` for the file contract. Older repositories without `integrations.yaml` continue to load; the first integration save creates it.

Administrators edit configuration through **Settings** without writing YAML. Each save commits directly to the configured branch with optimistic blob-SHA conflict protection. Valid external commits are applied through Push webhooks; a 60-second server poll recovers missed deliveries, and open browsers check the applied revision every 15 seconds. PostgreSQL stores the last-known-good revision so reads remain available during GitHub outages, while writes are disabled until synchronization recovers.

The control plane manages portal identity, catalog ingestion, named weighted scorecards, built-in integration plugins, published GitHub workflow actions, user roles, provider health, and audit history. Database credentials, OAuth secrets, GitHub private keys, session secrets, and webhook secrets remain deployment-only and are never returned by the API.

Scorecards, plugins, and workflow actions use visual builders. GitHub push and workflow-run deliveries are HMAC-verified and trigger configuration, metadata, or plugin-data synchronization. Delivery outcomes appear under **Settings → Integrations**.

## Self-hosted setup

1. Start PostgreSQL with `docker compose up -d postgres` (port `5440` by default).
2. Copy `.env.example` to `.env` and configure `DATABASE_URL`.
3. Create a GitHub App and add its App ID and private key to `.env`.
4. Grant repository **Contents: read and write**, **Pull requests: read and write**, and **Actions: write** permissions, then install the App on both the configuration and catalog repositories.
5. Set the GitHub App's **User authorization callback URL** (or an OAuth App's **Authorization callback URL**) to `${PUBLIC_URL}/api/auth/callback` exactly. For the default local setup, this is `http://localhost:4000/api/auth/callback`.
6. Set the webhook URL to `${PUBLIC_URL}/api/github/webhook`, provide the same secret in `GITHUB_WEBHOOK_SECRET`, and subscribe to **Push** and **Workflow run** events.
7. Commit all seven files from `config.example/` to the configured directory. At least one administrator must be listed in `access.yaml` or `GITHUB_ADMIN_LOGINS`.
8. Add a strong `SESSION_SECRET`; use `GITHUB_ADMIN_LOGINS` only for deployment break-glass administrators.
9. Install the app and sign in. The first-run flight path verifies the Git revision and guides the first catalog synchronization.

For local development, leave `PUBLIC_URL=http://localhost:4000` for the API callback and set `APP_URL=http://localhost:5173` for the Vite UI. In a production deployment where the UI and API share an origin, set both to that public origin.

To migrate an existing file/database-backed deployment, export its current effective state before enabling the Git variables:

```bash
npm run config:export -- --output ./perongen-config
```

The exporter includes current database administrators, validates every file, and refuses to overwrite existing output unless `--force` is supplied. `NORTHSTAR_CONFIG_PATH` and the legacy override tables are retained only for this migration path.

Repository metadata is read from `.portal/service.yaml`:

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
  dependsOn:
    - service:inventory-api
  providesApis:
    - api:checkout
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

Team membership is read from `.portal/team.yaml` in an installed catalog repository:

```yaml
apiVersion: northstar.dev/v1
kind: Team
metadata:
  name: platform
  title: Platform
  description: Owns shared developer experience tooling.
spec:
  members:
    - github-username
  links:
    - name: Jira board
      url: https://jira.example.com/platform
    - name: Team runbook
      url: https://docs.example.com/platform/runbook
```

## Current scope

- Responsive overview with catalog topology and health
- Searchable service catalog with service metadata details
- Metadata standards and per-service scorecard coverage
- Multiple named scorecards with metadata and plugin-backed checks
- Admin-configurable, failure-isolated integration plugins
- GitHub Actions workflow health in service dossiers
- GitHub pull request queues, repository standards, deployments, releases, security posture, and maintenance health
- Engineering inbox for delivery, security, catalog, standards, and ownership work
- Global command palette across services, teams, people, actions, and tools
- Shareable service and team URLs with browser navigation
- Metadata campaigns with dry-run diffs, inferred values, GitHub pull requests, retries, progress, and documented exclusions
- Software relationship map across services, systems, APIs, and infrastructure resources
- Scorecard change history, fix PRs, remediation guidance, and expiring waivers
- Operational service cockpits with deployment state, incidents, security findings, links, and a normalized change timeline
- Repository-owned Markdown documentation with global search and freshness signals
- Portal effectiveness analytics for adoption, search gaps, actions, and campaign outcomes
- GitHub App installation-token authentication
- Repository discovery and `.portal/service.yaml` ingestion
- Team and people directories from `.portal/team.yaml` and GitHub profiles
- PostgreSQL catalog persistence
- Metadata and plugin scorecard evaluation during sync and provider refresh
- GitHub Actions `workflow_dispatch` API
- Safe bogus-provision workflow for end-to-end action testing
- Self-service action catalog with dispatch feedback
- Desktop and mobile navigation
- Guided first-run readiness and catalog onboarding
- Visual scorecard and workflow action builders
- Signed GitHub webhook synchronization with delivery history
- Accessible desktop and mobile layouts with light and dark themes

GitHub OAuth sessions and administrator authorization are included. Production deployments should provide secrets through the infrastructure secret store rather than a local `.env` file.
