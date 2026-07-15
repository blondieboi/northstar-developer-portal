# Synchronize the catalog

Catalog synchronization discovers installed repositories, validates their metadata, persists valid entities, and recalculates service scorecards.

## Configure ingestion

In `catalog.yaml` or **Settings → Catalog**, configure:

```yaml
apiVersion: northstar.dev/v1
catalog:
  serviceMetadataPath: .portal/service.yaml
  teamMetadataPath: .portal/team.yaml
  lifecycles:
    - production
    - experimental
    - deprecated
  installationId: 12345678
```

`installationId` must be a positive integer or `null`. A lifecycle must appear in the configured list before a service using it can register.

## Initial synchronization

Use the first-run setup or **Settings → Integrations** to save the catalog installation ID and run synchronization. Perongen enumerates repositories visible to the installation in pages, then checks both configured metadata paths.

For each valid service it stores the metadata, source repository, ownership, lifecycle, language, and current score. Team documents update team details and replace the synchronized membership set.

## Push-driven synchronization

After initial setup, a signed push delivery triggers repository-level synchronization only when a commit adds, modifies, or removes a configured metadata path. This avoids rescanning the installation for unrelated source changes.

Configuration repository pushes use a separate path: Perongen loads all six documents at one Git revision and activates them together only after complete validation.

## Interpret results

| Status | Meaning |
| --- | --- |
| `registered` | Valid service metadata was persisted |
| `unregistered` | No service metadata file exists at the configured path |
| `invalid` | YAML, schema, lifecycle, or related team processing failed |

Sync and webhook history are available in the overview and integration ledger. Invalid documents are not substituted with demo entities.
