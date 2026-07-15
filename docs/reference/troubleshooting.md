# Troubleshooting

Start with **Settings → Integrations** and the first-run readiness view. They report configuration source status, deployment foundations, and recent webhook outcomes.

## Service does not appear

Check these conditions in order:

1. The GitHub App is installed on the repository.
2. The file is at the configured `serviceMetadataPath` on the default branch.
3. The YAML matches the [service schema](/reference/service-metadata).
4. `spec.lifecycle` appears in the configured lifecycle list.
5. The webhook delivery changed the exact configured path, or an administrator ran a manual sync.
6. The latest sync result is not `invalid`.

## Team or member is missing

Confirm `.portal/team.yaml` is at the configured team path, the team name matches service ownership, and each member is a valid GitHub username accessible to the App. A failed profile lookup prevents that team update from completing.

## OAuth callback fails

The callback configured in GitHub must exactly equal `${PUBLIC_URL}/api/auth/callback`, including scheme, hostname, path, and effective port. Set `APP_URL` to the browser origin so the API returns users to the right frontend during local development.

## Webhooks are rejected

- Ensure the GitHub App and `GITHUB_WEBHOOK_SECRET` use the identical secret.
- Confirm the public webhook URL is `${PUBLIC_URL}/api/github/webhook`.
- Subscribe to Push events.
- Use public HTTPS; GitHub cannot reach localhost.
- Check the delivery ledger for duplicate, ignored, or signature-failure messages.

## Configuration is stale

Confirm the configuration repository, branch, directory, and installation ID. Check that all six YAML files exist and validate at the same revision. Use the control plane's refresh action or wait for the configured recovery poll.

Perongen continues serving its last-known-good revision during GitHub failures. This is expected; writes stay disabled until synchronization succeeds.

## Configuration save reports a conflict

Someone changed that YAML file after the control plane loaded it. Refresh, review the Git change, reapply your intended edit, and save with the new revision. Do not bypass the conflict by deleting Git history.

## Action dispatch fails

Confirm the action is enabled and published, its repository uses `owner/name`, its workflow exists on `main`, input IDs match `workflow_dispatch`, and the App has repository access plus **Actions: write** permission.

## Portal starts with empty screens

Empty screens are not demo-data failures. They mean no valid entities have been synchronized. Complete the first-run gates, add repository metadata, and run the first catalog synchronization.
