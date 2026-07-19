# Environment variables

Perongen development and build tooling requires Node.js 22.12 or newer.

Environment variables contain deployment location, credentials, and bootstrap values. Secret values must come from the deployment platform's secret store.

## Runtime and URLs

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | No | API port; defaults to `4000` |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `PUBLIC_URL` | Yes | Public API origin used for callbacks and webhooks |
| `APP_URL` | Yes | Browser UI origin; may equal `PUBLIC_URL` in production |
| `TRUST_PROXY_HOPS` | No | Reverse-proxy hops trusted for client IP rate limits; defaults to `1` in production and `0` in development |

## Canonical configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `PERONGEN_CONFIG_REPOSITORY` | Yes | GitHub `owner/repository` containing configuration |
| `PERONGEN_CONFIG_BRANCH` | Yes | Configuration branch |
| `PERONGEN_CONFIG_DIRECTORY` | Yes | Directory containing the seven YAML files; legacy installations may initially omit `integrations.yaml` |
| `PERONGEN_CONFIG_INSTALLATION_ID` | Yes | GitHub App installation with configuration repository access |
| `PERONGEN_CONFIG_POLL_INTERVAL_SECONDS` | No | Recovery poll interval; defaults to `60` |
| `PERONGEN_CONFIG_PATH` | Migration only | Legacy file read by `config:export` |

## GitHub App and OAuth

| Variable | Required | Purpose |
| --- | --- | --- |
| `GITHUB_APP_ID` | Yes | GitHub App identifier |
| `GITHUB_CLIENT_ID` | Yes | OAuth client identifier |
| `GITHUB_CLIENT_SECRET` | Yes | OAuth client secret |
| `GITHUB_PRIVATE_KEY` | One of two | Private key with newlines escaped when necessary |
| `GITHUB_PRIVATE_KEY_PATH` | One of two | Absolute path to a mounted private key |
| `GITHUB_WEBHOOK_SECRET` | Yes | HMAC secret shared with the GitHub App |
| `GITHUB_ALLOWED_ORGANIZATIONS` | Yes | Comma-separated organization slugs; active membership in any entry grants sign-in |
| `GITHUB_ADMIN_IDS` | No | Comma-separated numeric GitHub IDs for break-glass administrators |
| `GITHUB_INSTALLATION_ID` | No | Deployment fallback for the catalog installation |

## Example local environment

```dotenv
PORT=4000
DATABASE_URL=postgres://perongen:choose-a-non-default-password@localhost:5440/perongen
PERONGEN_CONFIG_REPOSITORY=your-org/portal-config
PERONGEN_CONFIG_BRANCH=main
PERONGEN_CONFIG_DIRECTORY=perongen
PERONGEN_CONFIG_INSTALLATION_ID=12345678
PERONGEN_CONFIG_POLL_INTERVAL_SECONDS=60
GITHUB_APP_ID=123456
GITHUB_CLIENT_ID=Iv1.example
GITHUB_CLIENT_SECRET=replace-me
GITHUB_PRIVATE_KEY_PATH=/absolute/path/to/app.pem
GITHUB_WEBHOOK_SECRET=replace-me
PUBLIC_URL=http://localhost:4000
APP_URL=http://localhost:5173
TRUST_PROXY_HOPS=0
GITHUB_ALLOWED_ORGANIZATIONS=your-org,partner-org
GITHUB_ADMIN_IDS=12345678
```

`ACTION_REPOSITORY` and `ACTION_WORKFLOW` support the included bogus-provision test path. Normal published actions come from canonical action configuration.
