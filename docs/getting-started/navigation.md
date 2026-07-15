# Navigate the portal

Perongen uses one stable navigation model on desktop and mobile. The available destinations depend on your role and the data synchronized into the catalog.

## Main navigation

| Destination | Use it to |
| --- | --- |
| Overview | See active-team responsibility, standards coverage, and recent changes |
| Catalog | Search and inspect registered services |
| Scorecards | Compare metadata standards across the catalog |
| Actions | Run published GitHub workflows and inspect dispatch history |
| Tools | Open shared engineering systems |
| Teams | Browse ownership groups and their services |
| People | Find GitHub identities and team memberships |
| Settings | Administer the portal; visible only to administrators |

## Team context

The team selector on the overview contains only teams that list you as a member. Changing the active team filters overview metrics and recent services without changing catalog data.

Your primary team is stored in Perongen and becomes the default after sign-in. It does not modify `.portal/team.yaml`.

## Theme and responsive navigation

Use the sun or moon control in the header to switch appearance. The choice is stored in the browser. On smaller screens, the navigation moves into the menu button and preserves the same destinations.

## Search behavior

Catalog and people search operate on the synchronized data already loaded by the portal. They do not query GitHub live. If a recently merged metadata change is missing, wait for the webhook delivery or ask an administrator to synchronize the catalog.
