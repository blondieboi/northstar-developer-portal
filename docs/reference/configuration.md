# Portal configuration

Canonical non-secret configuration consists of six strict YAML documents. Each document contains `apiVersion: northstar.dev/v1` and exactly one named section.

Unknown properties fail validation. Use the files in `config.example/` as the maintained starting point.

## General

```yaml
apiVersion: northstar.dev/v1
general:
  name: Perongen
  logoUrl: ""
  accentColor: "#b07a32"
  supportUrl: ""
  documentationUrl: https://blondieboi.github.io/northstar-developer-portal/
```

URLs may be empty. `accentColor` must be a six-digit hexadecimal color.

## Catalog

```yaml
apiVersion: northstar.dev/v1
catalog:
  serviceMetadataPath: .portal/service.yaml
  teamMetadataPath: .portal/team.yaml
  lifecycles: [production, experimental, deprecated]
  tiers:
    - id: critical
      title: Critical
      description: Customer-facing or business-critical services
    - id: high
      title: High
      description: Important services with significant operational impact
    - id: standard
      title: Standard
      description: Normal production services
    - id: low
      title: Low
      description: Low-impact or internal services
  installationId: 12345678
```

The paths and lifecycle list must not be empty. Tier IDs are unique lowercase slugs; their array order runs from highest to lowest criticality. An empty or omitted tier list disables tiering for older configurations. The installation ID is a positive integer or `null`.

## Access

```yaml
apiVersion: northstar.dev/v1
access:
  admins:
    - your-github-login
```

## Tools

```yaml
apiVersion: northstar.dev/v1
tools:
  items:
    - id: github
      name: GitHub
      description: Repositories and engineering collaboration.
      iconUrl: ""
      destinations:
        - label: Open GitHub
          url: https://github.com
```

A tool ID uses lowercase letters, digits, and hyphens. Every tool needs at least one destination.

## Scorecards and actions

These sections contain arrays under `rules` and `definitions`. Use [Scorecard rules](/reference/scorecards) and [Workflow actions](/reference/actions) for their complete shapes.

## Activation and recovery

All files are read from the repository, branch, and directory configured in the deployment. Perongen validates the complete revision before activation and stores the last-known-good result in PostgreSQL. Valid UI saves create Git commits; valid external commits arrive through webhooks or polling.
