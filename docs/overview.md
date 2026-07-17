# What is Perongen?

Perongen is a self-hosted developer portal for answering four everyday questions: what software do we own, who owns it, does it meet our standards, and which approved operations can people run themselves?

It supports both discovery and daily engineering operations. The Engineering inbox brings delivery failures, security alerts, stale pull requests, standards gaps, catalog errors, and unclear ownership into one prioritized queue.

It reads explicit metadata from installed GitHub repositories. It does not invent services or replace missing data with demo content. When information is absent, the portal shows what to add next.

## How the portal is organized

| Area              | What it provides                                                                          | Source of truth                                          |
| ----------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Overview          | Team context, recent services, standards coverage, and sync activity                      | Stored catalog and signed-in user                        |
| Engineering inbox | Prioritized delivery, security, collaboration, catalog, and ownership work                | Catalog, plugin snapshots, and sync diagnostics          |
| Catalog           | Searchable services and detailed service dossiers, including enabled provider signals     | `.portal/service.yaml` and plugin snapshots              |
| Software map      | Impact paths across services, systems, APIs, and infrastructure resources                 | Relationship fields in `.portal/service.yaml`            |
| Documentation     | Searchable README and Markdown pages with repository provenance and freshness             | Repository default branch                                |
| Teams and people  | Ownership, membership, shared links, and primary-team context                             | `.portal/team.yaml` and GitHub profiles                  |
| Scorecards        | Multiple weighted standards views against metadata and plugin facts                       | Portal configuration and plugin snapshots                |
| Actions           | Published GitHub workflow forms and dispatch history                                      | Portal configuration and GitHub Actions                  |
| Tools             | Shared engineering destinations                                                           | Portal configuration                                     |
| Control plane     | Identity, ingestion, standards, plugins, actions, tools, access, and audit history        | Git-backed configuration plus deployment secrets         |
| Application intake | Evidence-backed discovery and reviewed onboarding pull requests                          | GitHub installation and repository contents              |
| Campaigns         | Dry-run metadata patches, GitHub pull requests, rollout progress, retries, and exclusions | Catalog state plus repository branches and pull requests |
| Analytics         | Adoption, failed searches, action usage, and remediation throughput                       | Privacy-conscious portal event records                   |

## A repository-driven model

Service and team owners change metadata through the same review process they use for code. Perongen synchronizes the accepted state and evaluates it against the active scorecard.

```text
GitHub repository → metadata, relations, and docs → PostgreSQL catalog ─┐
GitHub providers   → isolated operational snapshots ────────────────────┼→ portal views
Application intake → reviewed onboarding pull requests ─────────────────┤
Campaign preview   → reviewed GitHub pull requests ─────────────────────┘
```

GitHub push webhooks can trigger repository-level synchronization when a configured metadata path changes. Workflow-run events refresh delivery signals. Administrators can also synchronize the catalog or refresh plugin data from the control plane.

## What Perongen does not store in UI configuration

Database credentials, OAuth secrets, GitHub private keys, session secrets, and webhook secrets stay in the deployment environment. The control plane never returns them to the browser. See [environment variables](/reference/environment) for the complete boundary.

## Choose your path

- If you use Perongen, begin with [Getting started](/getting-started/).
- If you own a service, read [Services and catalog](/guides/services) and [Service metadata](/reference/service-metadata).
- If you administer Perongen, begin with [Deploy Perongen](/admin/deployment) and [Connect GitHub](/admin/github).
