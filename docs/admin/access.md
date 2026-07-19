# Access and audit

GitHub identifies portal users by immutable numeric GitHub ID. A sign-in is
accepted only when GitHub confirms active membership in at least one
organization listed by `GITHUB_ALLOWED_ORGANIZATIONS`. Perongen assigns the
identity the `member` or `admin` role and combines canonical access
configuration with deployment break-glass administrators.

Interactive authorization requests GitHub's read-only `read:org` OAuth scope
so private as well as public active memberships can be verified. The temporary
user token is discarded as soon as verification finishes and is never stored.

## Configure administrators

Add normal administrators to `access.yaml`:

```yaml
apiVersion: perongen.dev/v1
access:
  admins:
    - 12345678
    - 87654321
```

Use numeric GitHub user IDs, which remain stable when a login changes. At least
one administrator must exist in `access.yaml` when `GITHUB_ADMIN_IDS` is empty.

## Break-glass access

`GITHUB_ADMIN_IDS` is a comma-separated deployment variable for emergency
administrators. These users cannot be demoted through the portal. Keep the list
short, protect changes through deployment controls, and use the Git-backed
access file for normal administration.

## Member capabilities

Members can browse catalog data, teams, people, scorecards, tools, and published
global actions. Service lifecycle changes, remediation pull requests, and waiver
requests require membership in the service's owning team; administrators
bypass that ownership check. Administrator-only configuration APIs enforce the
role on the server; hiding Settings in the UI is not the security boundary.

Browser sessions are opaque, server-revocable credentials with an eight-hour
absolute lifetime. Signing out revokes the session immediately. Deleting a user
or changing their authorization invalidates access on the next request.

Member API responses intentionally omit email, biographies, role assignments,
database identifiers and timestamps, GitHub installation IDs, workflow inputs,
raw synchronization results, and provider errors. Administrative diagnostics
remain available only through authorized control-plane endpoints.

## Audit ledger

The audit ledger records relevant administrative activity, including configuration and role changes. Review it after access changes, configuration conflicts, and incident recovery.

Git history remains the durable review trail for canonical YAML changes. The audit ledger adds portal actor and application context.

## Migrating login-based administrators

Before deploying the ID-based configuration, resolve existing logins against
the portal's user records:

```bash
npm run admins:migrate -- octocat hubot
```

Comma-separated login arguments are also accepted. With no arguments, the
one-time helper reads legacy `GITHUB_ADMIN_LOGINS`. Review the numeric-ID
`access.yaml` it prints and commit that configuration before deployment. Do not
guess IDs from display names.
