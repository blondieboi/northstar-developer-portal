# Self-service actions

Actions expose approved GitHub Actions workflows as guided forms. Perongen validates the configured action, asks for confirmation, and dispatches `workflow_dispatch` using the GitHub App.

## Run an action

1. Open **Actions** and select a published action.
2. Complete every required input.
3. Review the confirmation message.
4. Select the final run action.
5. Check dispatch feedback and recent run history.

Perongen records the action ID, repository, workflow, inputs, status, and dispatch time. GitHub remains the source for job logs and the final workflow outcome.

::: warning Understand the effect
The portal controls form validation and dispatch. The workflow itself controls repository or infrastructure changes. Review its confirmation and repository implementation before running it.
:::

## Why an action may be unavailable

An action appears to members only when it is enabled and published. The target repository must be included in the GitHub App installation and the App needs **Actions: write** permission.

Administrators configure actions under **Settings → Actions**. See [Workflow actions](/reference/actions) for the complete configuration shape.
