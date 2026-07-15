# What is Perongen?

Perongen is a self-hosted developer portal for answering four everyday questions: what software do we own, who owns it, does it meet our standards, and which approved operations can people run themselves?

It reads explicit metadata from installed GitHub repositories. It does not invent services or replace missing data with demo content. When information is absent, the portal shows what to add next.

## How the portal is organized

| Area | What it provides | Source of truth |
| --- | --- | --- |
| Overview | Team context, recent services, standards coverage, and sync activity | Stored catalog and signed-in user |
| Catalog | Searchable services and detailed service dossiers, including enabled provider signals | `.portal/service.yaml` and plugin snapshots |
| Teams and people | Ownership, membership, shared links, and primary-team context | `.portal/team.yaml` and GitHub profiles |
| Scorecards | Multiple weighted standards views against metadata and plugin facts | Portal configuration and plugin snapshots |
| Actions | Published GitHub workflow forms and dispatch history | Portal configuration and GitHub Actions |
| Tools | Shared engineering destinations | Portal configuration |
| Control plane | Identity, ingestion, standards, plugins, actions, tools, access, and audit history | Git-backed configuration plus deployment secrets |

## A repository-driven model

Service and team owners change metadata through the same review process they use for code. Perongen synchronizes the accepted state and evaluates it against the active scorecard.

```text
GitHub repository → metadata validation → PostgreSQL catalog ─┐
GitHub providers   → isolated plugin snapshots ────────────────┼→ portal views
                                                              └→ scorecard evaluation
```

GitHub push webhooks can trigger repository-level synchronization when a configured metadata path changes. Workflow-run events refresh delivery signals. Administrators can also synchronize the catalog or refresh plugin data from the control plane.

## What Perongen does not store in UI configuration

Database credentials, OAuth secrets, GitHub private keys, session secrets, and webhook secrets stay in the deployment environment. The control plane never returns them to the browser. See [environment variables](/reference/environment) for the complete boundary.

## Choose your path

- If you use Perongen, begin with [Getting started](/getting-started/).
- If you own a service, read [Services and catalog](/guides/services) and [Service metadata](/reference/service-metadata).
- If you administer Perongen, begin with [Deploy Perongen](/admin/deployment) and [Connect GitHub](/admin/github).
