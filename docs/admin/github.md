# Connect GitHub

The GitHub App supplies repository discovery, metadata reads, configuration writes, profile lookup, workflow dispatch, user authorization, and signed push events.

## Create the App

Create a GitHub App owned by the organization that owns the catalog repositories. Configure these repository permissions:

| Permission             | Access         | Purpose                                                                       |
| ---------------------- | -------------- | ----------------------------------------------------------------------------- |
| Contents               | Read and write | Read catalog evidence and create configuration, onboarding, and remediation commits |
| Metadata               | Read           | Discover installed repositories                                               |
| Actions                | Write          | Read workflow activity and dispatch configured workflows                      |
| Pull requests          | Read and write | Build review queues and open onboarding, campaign, or standards-fix pull requests |
| Issues                 | Read           | Measure maintenance backlog and issue freshness                               |
| Deployments            | Read           | Read environment deployment status                                            |
| Administration         | Read           | Inspect default-branch protection                                             |
| Dependabot alerts      | Read           | Report vulnerable dependency alerts                                           |
| Code scanning alerts   | Read           | Report code-scanning findings                                                 |
| Secret scanning alerts | Read           | Report exposed-secret findings                                                |

Configure this organization permission as well:

| Permission | Access | Purpose |
| --- | --- | --- |
| Members | Read | Verify active membership in each allowed organization during sign-in |

Restricted security or repository-policy endpoints appear as unavailable signals instead of failing the complete plugin refresh. The service dossier explains when the GitHub App needs more access.

Subscribe the App to **Push**, **Workflow run**, **Pull request**, **Deployment**, **Deployment status**, **Issues**, and **Release** events. Push events synchronize configuration and metadata. Pull-request events update campaign completion when a generated change is merged or closed. Other repository events refresh plugin data for the affected service.

## Configure URLs

Set the user authorization callback URL exactly to:

```text
https://portal.example.com/api/auth/callback
```

Set the webhook URL to:

```text
https://portal.example.com/api/github/webhook
```

Use the same strong value for the GitHub App webhook secret and `GITHUB_WEBHOOK_SECRET`. A localhost webhook URL cannot receive GitHub deliveries; use a public HTTPS tunnel for end-to-end local testing.

## Install the App

The App must be installable by each allowed organization. When a personal
account owns the App, choose **Advanced → Make public** before installation.
This only permits other accounts to install the App; it does not list the App
in GitHub Marketplace. An App owned by the target organization can remain
private.

Install the App on:

- every organization listed in `GITHUB_ALLOWED_ORGANIZATIONS`;
- the canonical configuration repository;
- every repository that may contain service or team metadata;
- repositories containing workflows exposed as portal actions.

Record the installation ID from the installation URL. Configuration and catalog installations can use the same ID when repository access permits, or separate IDs through their respective settings.

## Configure credentials

Provide the App ID and either the private key value or a mounted private key path. Provide OAuth client credentials for interactive sign-in.

```dotenv
GITHUB_APP_ID=123456
GITHUB_CLIENT_ID=Iv1.example
GITHUB_CLIENT_SECRET=secret-store-value
GITHUB_PRIVATE_KEY_PATH=/run/secrets/github-app.pem
GITHUB_WEBHOOK_SECRET=secret-store-value
GITHUB_ALLOWED_ORGANIZATIONS=your-org,partner-org
```

Organization slugs are comma-separated and matched case-insensitively. Users
with an active membership in any configured organization may sign in; pending
memberships and users outside every configured organization are rejected. If
GitHub cannot verify membership, sign-in fails closed and the temporary user
token is discarded. The OAuth authorization requests only `read:org`, which is
needed to verify private organization memberships. The GitHub App must also be
installed on each allowed organization with **Members: read**; otherwise the
membership endpoint cannot admit that organization's users and sign-in fails
closed.

## Verify the connection

Open **Settings → Integrations**. Database, GitHub App, OAuth, configuration, and enabled plugin health should report ready. Recent push and workflow-run events appear in the webhook delivery ledger with their status and message.

Perongen rejects an invalid HMAC signature. It also ignores correctly signed
deliveries whose installation ID is not the configured catalog or configuration
installation. Duplicate deliveries are ignored, and pushes that do not change a
configured metadata or configuration path are recorded without running an
unnecessary synchronization.
