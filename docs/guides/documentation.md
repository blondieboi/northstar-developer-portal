# Repository documentation

Perongen indexes Markdown from each registered service repository so documentation remains reviewed and versioned with the software it describes.

## What is indexed

On catalog synchronization Perongen reads:

- the root `README.md`, when present;
- up to 30 Markdown files under `docs/`;
- or Markdown under the service-specific `spec.docsPath`.

```yaml
spec:
  docsPath: engineering/docs
```

The previous successful document snapshot remains available when GitHub is temporarily unavailable. Each page records its repository path, blob SHA, fetch time, and latest source commit date.

## Search and freshness

Open **Documentation** to search page titles, service names, owners, paths, and Markdown contents. Pages whose latest source commit is at least 180 days old are marked stale. The service dossier also provides a compact documentation index and reader.

Perongen renders Markdown as React content and does not execute embedded HTML. Use the GitHub link on a page to propose changes through the normal repository review flow.

## Documentation standards

Documentation health can be enforced with existing scorecards, for example requiring a documentation link or repository README. Freshness appears directly in the documentation surface so teams can distinguish missing knowledge from merely old knowledge.
