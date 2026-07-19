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

The included Compose service is development-only, requires an explicit password,
and publishes PostgreSQL on loopback only:

```bash
POSTGRES_PASSWORD='choose-a-non-default-local-password' \
  docker compose --profile development up -d postgres
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

Set `PERONGEN_CONFIG_REPOSITORY`, `PERONGEN_CONFIG_BRANCH`, `PERONGEN_CONFIG_DIRECTORY`, and `PERONGEN_CONFIG_INSTALLATION_ID` to that location. Add at least one administrator to `access.yaml` or configure a break-glass GitHub ID through `GITHUB_ADMIN_IDS`.

## Configure the environment

Copy `.env.example` for local development and replace every placeholder. Never commit `.env`, a private key, session secret, OAuth secret, or webhook secret.

The minimum production foundation is:

```dotenv
DATABASE_URL=postgres://user:password@database:5432/perongen
PERONGEN_CONFIG_REPOSITORY=your-org/portal-config
PERONGEN_CONFIG_BRANCH=main
PERONGEN_CONFIG_DIRECTORY=perongen
PERONGEN_CONFIG_INSTALLATION_ID=12345678
GITHUB_APP_ID=123456
GITHUB_CLIENT_ID=Iv1.example
GITHUB_CLIENT_SECRET=stored-in-your-secret-manager
GITHUB_PRIVATE_KEY_PATH=/run/secrets/github-app.pem
GITHUB_WEBHOOK_SECRET=stored-in-your-secret-manager
GITHUB_ALLOWED_ORGANIZATIONS=your-org,partner-org
GITHUB_ADMIN_IDS=12345678
PUBLIC_URL=https://portal.example.com
APP_URL=https://portal.example.com
TRUST_PROXY_HOPS=1
```

Use [Environment variables](/reference/environment) for the full list.

Production startup fails closed when the database, GitHub OAuth/App,
webhook, allowed-organization, configuration repository, or URL contract is
incomplete. `PUBLIC_URL` must be HTTPS, and `APP_URL` must use the same origin.
Development may use the documented localhost origins; CORS is limited to that
exact UI origin.

Production assumes one HTTPS reverse-proxy hop so authentication and mutation
rate limits use the real client IP. Set `TRUST_PROXY_HOPS` to the exact number
of trusted hops in front of the app, keep the container unreachable except
through that proxy, and use `0` only when clients connect directly.

## Build and start

```bash
npm ci
npm run build
npm start
```

The included `Dockerfile` compiles the API and shared runtime modules, installs
production dependencies only, runs as a non-root user, and exposes a health
check. Mount secrets and configuration through the deployment platform; do not
bake them into the image. Run the image with a read-only root filesystem and a
small temporary filesystem when the platform supports it, for example
`--read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m`.

Before launch, run `npm run audit:production` in addition to tests and builds.
VitePress is a documentation-development dependency and its development server
must remain bound to a trusted local environment; it is not installed in the
production image. Track its Vite/esbuild advisory chain and upgrade when a
stable compatible release is available.

If this repository was ever submitted to a remote Docker builder before the
strict `.dockerignore` was added, rotate every production-equivalent secret
that may have been present and purge the affected builder cache. Image history
and remote caches are not made safe merely by deleting the local file.

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

Installations that previously keyed administrators by login must also translate
those logins to immutable GitHub IDs before launch:

```bash
npm run admins:migrate -- octocat hubot
```

Review and commit the generated access configuration, then replace any legacy
break-glass login setting with `GITHUB_ADMIN_IDS`.
