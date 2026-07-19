# Workflow actions

An action maps a portal form to a GitHub Actions `workflow_dispatch` workflow.

## Complete example

```yaml
apiVersion: perongen.dev/v1
actions:
  definitions:
    - id: create-service
      title: Create a service repository
      description: Creates a repository from the approved service template.
      repository: your-org/platform-automation
      workflow: create-service.yml
      confirmation: Create this service repository?
      enabled: true
      published: true
      version: 1
      inputs:
        - id: serviceName
          label: Service name
          type: text
          required: true
          placeholder: payments-api
        - id: owner
          label: Owning team
          type: select
          required: true
          options: [platform, payments, checkout]
```

## Action fields

| Field | Validation |
| --- | --- |
| `id` | Lowercase letters, digits, and hyphens |
| `title` | Non-empty |
| `description` | String; defaults to empty |
| `repository` | GitHub `owner/repository` form |
| `workflow` | Non-empty workflow filename or ID |
| `confirmation` | Defaults to `Run this action?` |
| `enabled` | Controls whether the action can run |
| `published` | Controls whether members can see it |
| `version` | Positive integer |
| `inputs` | Array of validated form definitions |

## Input fields

Input IDs must begin with a letter and then contain letters, digits, underscores, or hyphens. Supported types are `text`, `multiline`, `number`, `boolean`, and `select`.

A `select` input must provide at least one option. Placeholders are optional. The input ID must match the name expected by the GitHub workflow.

## Matching workflow

```yaml
on:
  workflow_dispatch:
    inputs:
      serviceName:
        required: true
        type: string
      owner:
        required: true
        type: string
```

Perongen dispatches against the workflow's `main` ref. Ensure the workflow exists on that branch and the GitHub App installation includes the repository with **Actions: write** permission.
