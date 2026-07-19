# Access and audit

GitHub identifies portal users. Perongen assigns each identity the `member` or `admin` role and combines canonical access configuration with deployment break-glass administrators.

## Configure administrators

Add normal administrators to `access.yaml`:

```yaml
apiVersion: perongen.dev/v1
access:
  admins:
    - platform-admin
    - engineering-manager
```

Use lowercase or canonical GitHub logins consistently. At least one administrator must exist in `access.yaml` when `GITHUB_ADMIN_LOGINS` is empty.

## Break-glass access

`GITHUB_ADMIN_LOGINS` is a comma-separated deployment variable for emergency administrators. These users cannot be demoted through the portal. Keep the list short, protect changes through deployment controls, and use the Git-backed access file for normal administration.

## Member capabilities

Members can browse catalog data, teams, people, scorecards, tools, and published actions. Administrator-only configuration APIs enforce the role on the server; hiding Settings in the UI is not the security boundary.

## Audit ledger

The audit ledger records relevant administrative activity, including configuration and role changes. Review it after access changes, configuration conflicts, and incident recovery.

Git history remains the durable review trail for canonical YAML changes. The audit ledger adds portal actor and application context.
