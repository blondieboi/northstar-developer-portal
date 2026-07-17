# Application Intake

Application Intake turns repositories visible to the GitHub App into reviewed, repository-owned catalog entries. It does not create shadow entities in the database and never writes directly to a default branch.

## Discover uncatalogued repositories

Open **Application intake** as an administrator. Perongen enumerates the configured catalog installation and removes repositories already referenced by a stored service. For each remaining repository it reads:

- repository name, description, language, topics, archive state, and homepage;
- the repository tree, including workflow and deployment filenames;
- up to six relevant manifests and `CODEOWNERS` files.

Markdown under `docs/` and the root README provide documentation evidence. `depends-on-*` repository topics become reviewable catalog relationship suggestions; Perongen does not translate third-party package dependencies into service relationships.

The scan is bounded to five repositories at a time. Active, non-fork repositories are ordered by their latest push so the queue starts with software most likely to be shipping now; forks and archived repositories remain visible but appear later. Perongen reuses a successful discovery for up to one minute when the installation, catalog, and relevant configuration are unchanged. Select **Scan again** to bypass that cache after installing the GitHub App on another repository or merging an onboarding pull request.

One repository with unreadable contents does not stop the discovery queue. Its dossier shows the provider error and marks unsupported evidence unavailable for manual review.

## Review evidence

Every recommendation names its source and confidence. Repository names, GitHub descriptions, language, matching topics, and `CODEOWNERS` are explicit evidence. File structure and dependency matches are inferences.

Perongen may suggest a risk value from deployment, persistence, or authentication dependencies, but it deliberately leaves all three risk controls unselected. An administrator must confirm exposure, data sensitivity, and authentication before valid YAML is generated. An accountable owner is also required. Archived state, experiment topics, and deployment automation can provide a strong lifecycle signal; otherwise the suggested lifecycle remains unselected until an administrator confirms it.

Optional tier, type, and system values remain visibly unclassified when the repository provides no matching evidence. Application Intake only offers values accepted by the active catalog configuration.

## Open the onboarding pull request

The right-hand proposal is generated and validated by the server against the same service metadata schema used during synchronization. Select **Open onboarding pull request** to:

1. create a dedicated `perongen/application-intake-*` branch;
2. add the configured service metadata path, normally `.portal/service.yaml`;
3. open a pull request describing the reviewed onboarding change.

If metadata appeared after discovery, Perongen creates neither a branch nor a commit. If file creation or pull-request creation fails, it removes the temporary branch. The GitHub App needs **Contents: read and write** and **Pull requests: read and write**.

The intake request contract also limits field sizes and rejects documentation directories that are absolute or traverse outside the repository.

After the pull request merges, the Push webhook registers the service. Enabled GitHub plugins begin collecting evidence, risk-scoped scorecards apply, and remaining gaps appear in the Engineering inbox.

## Understand plugin recommendations

The guardrail plan shows which built-in GitHub plugins are relevant to the repository and whether each is enabled globally. Application Intake does not silently change portal configuration. Enable missing providers under **Settings → Integrations**, where the change remains a separately reviewed configuration commit.
