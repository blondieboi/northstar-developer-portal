# Scorecards

Scorecards turn metadata expectations into visible, weighted checks. They help teams improve catalog quality without implying application uptime or production readiness.

## Read coverage

Open **Scorecards** to compare the current service scores. A service dossier shows the same evaluation at service level, including the field and condition behind each result.

The score is calculated as:

```text
weight of passing applicable rules ÷ weight of all applicable rules × 100
```

If there are no enabled rules, the service score is 100.

Rules may target configured service tiers. A critical-service runbook check, for example, is excluded from standard and low-tier service scores. The Scorecards page shows each rule's scope and counts only eligible services in its pass rate.

## Required and recommended rules

Severity communicates organizational intent. Both `required` and `recommended` rules contribute according to their weight; severity does not change the calculation by itself.

Administrators can add, edit, disable, and preview rules in **Settings → Scorecards**. Changes apply immediately after saving and are recorded in the audit ledger.

## Improve a service score

1. Open the service dossier.
2. Find a check marked **Needs attention**.
3. Read the metadata path and expected condition.
4. Update the service metadata in its repository.
5. Merge and synchronize the repository.

Use [Scorecard rules](/reference/scorecards) for the exact operators and value shapes.
