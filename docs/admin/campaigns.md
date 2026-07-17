# Metadata campaigns

Metadata campaigns coordinate the same catalog change across many repositories without moving source of truth into Perongen. Every accepted change is a normal GitHub pull request against the repository metadata file.

## Campaign lifecycle

1. Open **Campaigns** as an administrator.
2. Choose a dotted metadata field such as `spec.tier` and either one explicit value or per-service inference.
3. Limit the rollout by owner, existing tier, or service type when needed.
4. Run the dry preview. It lists the current value, proposed value, repository, and confidence without creating branches.
5. Save the draft campaign and inspect every target.
6. Exclude exceptional repositories with a required reason.
7. Open rollout pull requests. Perongen creates a dedicated branch, updates only the selected field, and opens a PR in each repository.
8. Review progress. Pull-request webhooks mark targets complete when merged and failed when closed without merge.

Launching an active campaign again retries only pending and failed targets. A repository that already contains the desired value is marked complete without creating an empty PR.

## Inference

Inference uses values already verified during catalog synchronization. Supported fields include description, owner, system, language, tier, and service type. A target with no trustworthy inferred value is omitted from the campaign preview. The dry run labels inferred values separately from explicit values.

## Failure and recovery

A target failure does not stop other repositories. The target retains its GitHub error and can be retried after permissions, repository state, or metadata are corrected. Perongen removes a newly created campaign branch if writing the metadata file or opening the PR fails.

The GitHub App needs **Contents: read and write** and **Pull requests: read and write** on every target repository. See [Connect GitHub](/admin/github).

## Boundaries

Campaigns are intentionally not a general workflow orchestrator. They perform one narrow operation: propose reviewable repository metadata changes and track the resulting GitHub pull requests. Runtime provisioning and service operations continue to use published GitHub Actions.
