# Getting started

This guide assumes your organization has already deployed Perongen and connected its GitHub App. Administrators setting up a new installation should use the [deployment guide](/admin/deployment).

## Sign in

Select **Sign in with GitHub** and authorize the organization account connected to the portal. Your GitHub login determines your portal identity and administrator access.

After sign-in, Perongen combines:

- teams that list your GitHub username in team metadata;
- the primary team saved in your user profile;
- administrator status from deployment or portal access configuration.

::: tip No team yet?
You can still browse organization-wide information. Ask a team owner to add your GitHub username to `.portal/team.yaml` if team context is missing.
:::

## Start from your overview

The overview shows the active team, its owned services, average standards coverage, systems, and recent synchronization activity. Use the team selector to switch between teams you belong to. Choose **Make primary** to make one team the default on future visits.

## Find a service

1. Open **Catalog**.
2. Search by service name, owner, or system.
3. Select a service to open its dossier.
4. Review ownership, lifecycle, language, source repository, useful links, stored metadata, and scorecard results.

The dossier reflects the latest synchronized repository metadata. If a field is incorrect, update the repository rather than trying to edit the service in the portal.

## Understand a score

Every enabled rule contributes its configured weight to the service score. A score of 100 means the stored metadata passes all active checks; it does not claim that the service is operationally healthy.

Open **Scorecards** for organization-wide coverage, or review the checks in a service dossier for a single service.

## Run an action

Published actions appear under **Actions**. Open an action, fill in its inputs, review the confirmation, and dispatch it. Perongen calls the configured GitHub `workflow_dispatch` endpoint and records the request in its run history.

Only run an action when you understand its confirmation text and expected effect. Access depends on the action and your portal role.

## Get help

When the administrator has set a documentation or support URL, Perongen exposes those destinations from the portal. Configuration and integration problems are also covered in [Troubleshooting](/reference/troubleshooting).
