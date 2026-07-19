# Architecture and security

Perongen is a self-hosted Vite application, Fastify API, and PostgreSQL catalog connected to GitHub through an organization-owned GitHub App. This page describes the trust boundaries an evaluator should understand before deployment.

## Data flow

```text
GitHub repositories ── App installation tokens ──→ Fastify API
        │                                          │
        ├─ configuration YAML                      ├─ validates and applies one revision
        ├─ service and team metadata               ├─ synchronizes catalog records
        ├─ Markdown documentation                  ├─ isolates provider snapshots
        └─ workflow and repository evidence        └─ writes PostgreSQL
                                                        │
Browser session ←── same-origin authenticated API ←─────┘
```

The browser never receives GitHub App private keys, OAuth client secrets, database credentials, session secrets, or webhook secrets. Non-secret portal configuration is loaded from seven versioned YAML files at one Git revision.

## Trust boundaries

| Boundary | Control |
| --- | --- |
| Browser to API | GitHub OAuth session, role authorization, HTTP-only session cookie, and same-origin production serving |
| GitHub to API | HMAC verification for webhook deliveries and installation-scoped GitHub App tokens for API calls |
| Configuration to runtime | Strict schema validation, one-revision activation, optimistic blob-SHA conflict checks, and last-known-good persistence |
| Portal to repositories | Installation-scoped permissions; durable changes use branches, commits, and pull requests |
| Plugins to catalog | Provider refreshes write isolated snapshots and cannot replace catalog metadata |
| Deployment to UI | Secrets remain environment-only and are not returned by configuration APIs |

## GitHub permissions

Perongen requires **Metadata: read** for discovery, **Contents: read and write** for metadata and configuration changes, **Pull requests: read and write** for review queues and generated fixes, and **Actions: write** for published workflow dispatches. Optional provider plugins may require additional read-only permissions for deployments, security alerts, or repository administration signals.

Install the App only on repositories Perongen should observe or change. See [Connect GitHub](/admin/github) for the event and permission matrix.

## Persistence and recovery

PostgreSQL stores the synchronized catalog, relationships, documentation index, provider snapshots, audit entries, and the last-known-good configuration revision. Production operators should use a managed database, encrypted connections where supported, and a backup policy aligned with their recovery requirements.

If GitHub configuration becomes unavailable or invalid, Perongen continues serving the last applied revision and disables configuration writes until synchronization recovers. Provider failures remain visible in integration health without removing earlier catalog facts.

## Deployment checklist

- Terminate TLS at the deployment platform and set `PUBLIC_URL` and `APP_URL` to the public HTTPS origin.
- Store PostgreSQL, OAuth, private-key, session, and webhook credentials in the platform secret store.
- Generate independent high-entropy values for `SESSION_SECRET` and `GITHUB_WEBHOOK_SECRET`.
- Subscribe the GitHub App only to the documented events and grant only required repository permissions.
- Restrict break-glass access through `GITHUB_ADMIN_LOGINS`; manage normal administrators in versioned `access.yaml`.
- Back up PostgreSQL and monitor `/api/health`, configuration revision status, webhook deliveries, and integration health.

For the complete variable contract, see [Environment variables](/reference/environment). For an installation walkthrough, continue to [Deploy Perongen](/admin/deployment).
