# Environment variables

Environment variables contain deployment location, credentials, and bootstrap values. Secret values must come from the deployment platform's secret store.

## Runtime and URLs

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | No | API port; defaults to `4000` |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `PUBLIC_URL` | Yes | Public API origin used for callbacks and webhooks |
| `APP_URL` | Yes | Browser UI origin; may equal `PUBLIC_URL` in production |
| `SESSION_SECRET` | Yes | Long random value used to protect sessions |

## Canonical configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `NORTHSTAR_CONFIG_REPOSITORY` | Yes | GitHub `owner/repository` containing configuration |
| `NORTHSTAR_CONFIG_BRANCH` | Yes | Configuration branch |
| `NORTHSTAR_CONFIG_DIRECTORY` | Yes | Directory containing the seven YAML files; legacy installations may initially omit `integrations.yaml` |
| `NORTHSTAR_CONFIG_INSTALLATION_ID` | Yes | GitHub App installation with configuration repository access |
| `NORTHSTAR_CONFIG_POLL_INTERVAL_SECONDS` | No | Recovery poll interval; defaults to `60` |
| `NORTHSTAR_CONFIG_PATH` | Migration only | Legacy file read by `config:export` |

## GitHub App and OAuth

| Variable | Required | Purpose |
| --- | --- | --- |
| `GITHUB_APP_ID` | Yes | GitHub App identifier |
| `GITHUB_CLIENT_ID` | Yes | OAuth client identifier |
| `GITHUB_CLIENT_SECRET` | Yes | OAuth client secret |
| `GITHUB_PRIVATE_KEY` | One of two | Private key with newlines escaped when necessary |
| `GITHUB_PRIVATE_KEY_PATH` | One of two | Absolute path to a mounted private key |
| `GITHUB_WEBHOOK_SECRET` | Yes | HMAC secret shared with the GitHub App |
| `GITHUB_ADMIN_LOGINS` | No | Comma-separated break-glass administrator logins |
| `GITHUB_INSTALLATION_ID` | No | Deployment fallback for the catalog installation |

## Example local environment

```dotenv
PORT=4000
DATABASE_URL=postgres://northstar:northstar@localhost:5440/northstar
NORTHSTAR_CONFIG_REPOSITORY=your-org/portal-config
NORTHSTAR_CONFIG_BRANCH=main
NORTHSTAR_CONFIG_DIRECTORY=perongen
NORTHSTAR_CONFIG_INSTALLATION_ID=12345678
NORTHSTAR_CONFIG_POLL_INTERVAL_SECONDS=60
GITHUB_APP_ID=123456
GITHUB_CLIENT_ID=Iv1.example
GITHUB_CLIENT_SECRET=replace-me
GITHUB_PRIVATE_KEY_PATH=/absolute/path/to/app.pem
GITHUB_WEBHOOK_SECRET=replace-me
SESSION_SECRET=replace-with-a-long-random-value
PUBLIC_URL=http://localhost:4000
APP_URL=http://localhost:5173
GITHUB_ADMIN_LOGINS=your-github-login
```

`ACTION_REPOSITORY` and `ACTION_WORKFLOW` support the included bogus-provision test path. Normal published actions come from canonical action configuration.
