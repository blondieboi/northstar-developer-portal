# Scorecards

Scorecards turn metadata and plugin signals into visible, weighted checks. Administrators can create multiple named scorecards for concerns such as metadata quality, delivery health, or security posture. One primary scorecard supplies the catalog-wide coverage value.

## Read coverage

Open **Scorecards** and select a card to compare current service scores. A service dossier shows every enabled card's score; select a score in its **Health** section to inspect that card's checks without leaving the service.

The score is calculated as:

```text
weight of passing applicable rules ÷ weight of all applicable rules × 100
```

If there are no enabled rules, the service score is 100.

Rules may target configured service tiers, service types, or both. They may read synchronized service metadata or normalized facts from an enabled plugin. A missing plugin snapshot makes its rules not applicable. The Scorecards page shows source and scope and counts only eligible services in each pass rate.

## Required and recommended rules

Severity communicates organizational intent. Both `required` and `recommended` rules contribute according to their weight; severity does not change the calculation by itself.

Administrators can create cards, choose the primary card, add, edit, disable, preview, source, and scope rules in **Settings → Scorecards**. Plugin providers are managed under **Settings → Integrations**. Changes apply immediately after saving and are recorded in the audit ledger.

Enabling GitHub repository standards writes a default **Repository standards** card to `scorecards.yaml`. Administrators can customize it like any other card; an existing card with the same ID is preserved when the plugin is enabled.

## Improve a service score

1. Open the service dossier.
2. Find a check marked **Needs attention**.
3. Read the metadata path and expected condition.
4. Update the service metadata in its repository.
5. Merge and synchronize the repository.

Use [Scorecard rules](/reference/scorecards) for the exact operators and value shapes.
