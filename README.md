# Northstar

A simple, self-hosted developer portal with a software catalog, ownership metadata, configurable scorecards, and GitHub workflow-backed self-service actions.

## Run locally

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

Without a database or GitHub credentials the UI starts with representative demo data. Once the API is connected to PostgreSQL, synced catalog data replaces the demo catalog automatically.

## Self-hosted setup

1. Start PostgreSQL with `docker compose up -d postgres` (port `5440` by default).
2. Copy `.env.example` to `.env` and configure `DATABASE_URL`.
3. Create a GitHub App and add its App ID and private key to `.env`.
4. Grant repository **Contents: read** and **Actions: write** permissions.
5. Set the GitHub App callback URL to `http://localhost:4000/api/auth/callback` (or your `PUBLIC_URL`).
6. Add a strong `SESSION_SECRET` and list portal administrators in `GITHUB_ADMIN_LOGINS`.
7. Install the app into your GitHub organization, sign in with GitHub, and sync from the Integrations screen.

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
  system: commerce
  language: TypeScript
  links:
    - name: Documentation
      url: https://docs.example.com/checkout
```

## Current scope

- Responsive overview with catalog topology and health
- Searchable service catalog with service metadata details
- Metadata standards and per-service scorecard coverage
- GitHub App installation-token authentication
- Repository discovery and `.portal/service.yaml` ingestion
- PostgreSQL catalog persistence
- Metadata score evaluation during sync
- GitHub Actions `workflow_dispatch` API
- Self-service action catalog with dispatch feedback
- Desktop and mobile navigation

The remaining production-hardening work is the administrator setup UI, encrypted credential storage, OAuth user sessions, and access-control enforcement.
