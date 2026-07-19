# Teams and people

Teams connect services to people. Service ownership references a stable team name, while team metadata provides the human-readable title, description, members, and useful links.

## Team workspaces

Open **Teams** and select a team to see:

- services whose `spec.owner` matches the team;
- average metadata standards coverage;
- members resolved from GitHub usernames;
- shared destinations such as a board, runbook, or dashboard.

An ownership value uses the form `team:<name>`, for example `team:platform`. The `<name>` must match `metadata.name` in the team document.

## Membership

Team membership comes from `.portal/team.yaml`. Perongen resolves listed usernames against GitHub and records their current profile details.

```yaml
apiVersion: perongen.dev/v1
kind: Team
metadata:
  name: platform
  title: Platform
  description: Owns shared developer experience tooling.
spec:
  members:
    - octocat
  links:
    - name: Team runbook
      url: https://docs.example.com/platform/runbook
```

## Primary team

Members of more than one team can choose a primary team from the overview. This preference changes their default workspace only; it does not change ownership or team metadata.

## People directory

The people directory includes GitHub profiles referenced by synchronized team metadata or recorded through portal sign-in. Search by name, login, or team. A person with no team appears as unassigned until team metadata includes their GitHub username.
