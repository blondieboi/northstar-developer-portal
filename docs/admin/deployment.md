# Deploy Perongen

Perongen runs as a Vite frontend, a Fastify API, and PostgreSQL. The API serves the production frontend and owns GitHub, configuration, session, and persistence operations.

The first-run target is a scored repository, not a perfectly customized portal. Complete the foundation, connect GitHub, register one service, and confirm its default metadata-quality scorecard before changing branding or publishing workflows.

## Activation path

| Checkpoint | You are done when |
| --- | --- |
| Deploy | `/api/health` responds and reports the configuration state |
| Sign in | The bootstrap administrator can open the control plane |
| Connect | The GitHub installation ID is saved and synchronization completes |
| Catalog | One repository is registered from metadata or an Application Intake pull request |
| Score | The service appears in the default Metadata quality scorecard |

The in-product setup panel reads these conditions from the running system. Its gate cards are selectable, so operators can revisit completed steps or inspect a later requirement without losing progress.

## Prerequisites

- Node.js compatible with the repository's current Vite toolchain;
- PostgreSQL;
- a GitHub App installed on the configuration and catalog repositories;
- a public HTTPS origin for OAuth callbacks and webhooks;
- a secret store for deployment-only values.

## Prepare the database

For local evaluation, start the included database:

```bash
docker compose up -d postgres
```

The default connection uses port `5440`. Production deployments should provide a managed PostgreSQL URL through `DATABASE_URL` and should back up the database according to their recovery requirements.

## Prepare canonical configuration

Copy all seven files from `config.example/` into one directory in a GitHub repository:

```text
perongen/
├── access.yaml
├── actions.yaml
├── catalog.yaml
├── general.yaml
├── integrations.yaml
├── scorecards.yaml
└── tools.yaml
```

Set `NORTHSTAR_CONFIG_REPOSITORY`, `NORTHSTAR_CONFIG_BRANCH`, `NORTHSTAR_CONFIG_DIRECTORY`, and `NORTHSTAR_CONFIG_INSTALLATION_ID` to that location. Add at least one administrator to `access.yaml` or configure a break-glass login through `GITHUB_ADMIN_LOGINS`.

## Configure the environment

Copy `.env.example` for local development and replace every placeholder. Never commit `.env`, a private key, session secret, OAuth secret, or webhook secret.

The minimum production foundation is:

```dotenv
DATABASE_URL=postgres://user:password@database:5432/perongen
NORTHSTAR_CONFIG_REPOSITORY=your-org/portal-config
NORTHSTAR_CONFIG_BRANCH=main
NORTHSTAR_CONFIG_DIRECTORY=perongen
NORTHSTAR_CONFIG_INSTALLATION_ID=12345678
GITHUB_APP_ID=123456
GITHUB_CLIENT_ID=Iv1.example
GITHUB_CLIENT_SECRET=stored-in-your-secret-manager
GITHUB_PRIVATE_KEY_PATH=/run/secrets/github-app.pem
GITHUB_WEBHOOK_SECRET=stored-in-your-secret-manager
SESSION_SECRET=long-random-deployment-secret
PUBLIC_URL=https://portal.example.com
APP_URL=https://portal.example.com
```

Use [Environment variables](/reference/environment) for the full list.

## Build and start

```bash
npm ci
npm run build
npm start
```

The included `Dockerfile` can package the same production build. Mount secrets and configuration through the deployment platform; do not bake them into the image.

## Complete first-run setup

Sign in as an administrator. The first-run flight path verifies:

1. Database, GitHub App, OAuth, webhook secret, and configuration repository.
2. GitHub installation and canonical configuration revision.
3. At least one synchronized service.
4. At least one enabled scorecard evaluating the catalog.

Each gate reads the running system rather than storing a manual checklist.

If installed repositories do not contain `.portal/service.yaml` yet, open **Application Intake** from the catalog gate. Perongen will inspect repository evidence, ask an administrator to confirm ownership, lifecycle, and risk facts, then open the first metadata file as a reviewable pull request. Merge it and select **Synchronize again**.

Publishing self-service actions, enabling additional GitHub plugins, changing portal identity, and adding more scorecards are deliberately post-activation tasks. They do not keep first-run setup open.

## Migrate an older installation

Export existing file/database-backed configuration before enabling Git-backed variables:

```bash
npm run config:export -- --output ./perongen-config
```

The exporter validates all seven documents and includes current database administrators. It refuses to overwrite output unless `--force` is supplied. Review and commit the result before pointing production at it. Existing Git-backed installations may add `integrations.yaml` later; Perongen supplies an empty in-memory section until its first UI save.
