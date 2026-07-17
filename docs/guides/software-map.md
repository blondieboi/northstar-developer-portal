# Software map

The Software map turns catalog metadata into impact paths across services, systems, APIs, and infrastructure resources.

## Declare relationships

```yaml
spec:
  system: commerce
  dependsOn:
    - service:inventory-api
  providesApis:
    - api:checkout
  consumesApis:
    - api:pricing
  resources:
    - name: checkout-db
      type: database
      relation: reads-writes
      url: https://console.example.com/databases/checkout
```

Entity references use `kind:key`. `dependsOn` defaults to the `service` kind when the prefix is omitted. API fields default to `api`.

Resources are intentionally open-ended. Common types include `database`, `queue`, `bucket`, `cluster`, and `cloud-resource`. `relation` should be a short verb such as `uses`, `publishes-to`, or `reads-writes`.

## Investigate impact

Open **Software map**, search for an entity, and select it. The inspector distinguishes outgoing dependencies from reverse “used by” paths. Selecting a connected entity continues the investigation; selecting a service can open its full dossier.

The graph is rebuilt during catalog synchronization. It can also derive relationships from already-stored metadata immediately after an upgrade, before the next full synchronization.
