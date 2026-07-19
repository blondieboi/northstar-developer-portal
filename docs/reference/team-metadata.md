# Team metadata

Place a team document at the configured team metadata path in a repository visible to the catalog installation. The default is `.portal/team.yaml`.

## Complete example

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
    - monalisa
  links:
    - name: Jira board
      url: https://jira.example.com/platform
    - name: Team runbook
      url: https://docs.example.com/platform/runbook
```

## Field reference

| Field | Required | Notes |
| --- | --- | --- |
| `apiVersion` | Yes | Accepted as a string; use `perongen.dev/v1` |
| `kind` | Yes | Must be `Team` |
| `metadata.name` | Yes | Non-empty key used by service ownership |
| `metadata.title` | Yes | Human-readable team name |
| `metadata.description` | No | Defaults to an empty string |
| `spec.members` | No | GitHub usernames; defaults to an empty array |
| `spec.links` | No | Name and valid URL pairs; defaults to an empty array |

## Membership behavior

During synchronization, Perongen fetches each listed GitHub profile and replaces the team's stored membership set with the document's current list. Removing a username from the document removes that membership on the next successful sync.

An invalid or inaccessible GitHub username causes team processing to fail for that repository. Correct the login or App access, then synchronize again.

## Link ownership correctly

If `metadata.name` is `platform`, services should declare:

```yaml
spec:
  owner: team:platform
```

Changing a team key requires coordinating every service that references it.
