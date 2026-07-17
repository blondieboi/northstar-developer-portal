# Portal analytics

Portal analytics answer whether Perongen is being used to find context and remove engineering work.

## Recorded events

Perongen records a narrow event envelope:

- page destination;
- signed-in GitHub login when available;
- optional catalog entity kind and key;
- action dispatches, remediation PRs, campaign creation and launch, and waiver requests;
- command-palette queries only when they return no result.

It does not record document contents, metadata values, form input values, secrets, browser identifiers, or successful search text.

## Dashboard

Administrators can open **Analytics** and choose a 7, 30, or 90 day window. The dashboard reports active signed-in users, page views, useful actions, daily activity, popular destinations, unanswered searches, and campaign target outcomes.

Use unanswered searches to identify missing catalog entities, tools, or documentation. Use campaign outcomes and remediation PR counts to measure whether surfaced standards gaps are actually being resolved.

Event data is stored in PostgreSQL. Operators can apply normal database retention or export policies appropriate to their organization.
