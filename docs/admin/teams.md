# RBAC & Teams

Accessible from **Admin > Teams** in the sidebar (admin role required). Requires an enterprise license with the `rbac` feature enabled.

:::{note}
Without an enterprise license, the classic two-role model (admin/user) remains active. Teams and granular roles are only available with the `rbac` feature.
:::

## Roles

Roles are hierarchical — each level includes all permissions of the levels below it.

| Role | Permissions |
|------|-------------|
| **Viewer** | Read-only access to dashboards, charts, and datasets. Execute charts. |
| **Editor** | Viewer + create, edit, and delete own dashboards, charts, datasets, and connections. |
| **Admin** | Editor + manage users, connections, RLS rules, alerts, and reports. |
| **Owner** | Admin + team management, SSO configuration, and billing. |

## Teams

Teams group users together and scope resource access. Each team has its own set of members, and each member is assigned an individual role within that team.

### Creating a Team

1. Navigate to **Admin > Teams**
2. Click {guilabel}`Create Team`
3. Enter a name and optional description
4. Click {guilabel}`Save`

### Managing Members

1. Click a team row to expand the members list
2. Click {guilabel}`Add Member` — select a user from the dropdown and assign a role
3. Change a member's role via the role dropdown in the members table
4. Remove a member by clicking the delete button (click once to reveal confirmation, click again to confirm)

:::{warning}
Removing a member from a team revokes their access to all team-scoped resources immediately. If the user is not a member of any other team, they will only see public resources.
:::

### Resource Scoping

Dashboards, connections, and datasets each have a `team_id` field that determines which team owns the resource.

| Scenario | Visibility |
|----------|------------|
| Resource has `team_id` set | Only visible to members of that team |
| Resource has `is_public = true` | Visible to all authenticated users |
| No `team_id` and `is_public = false` | Only visible to the resource creator and admins |
| Admin user | Can see all resources regardless of team scope |

- When creating a new dashboard, chart, or dataset, select the owning team from the team picker
- Changing a resource's team transfers visibility to the new team's members
- Public resources remain accessible to everyone, regardless of team assignment

## API Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/api/teams` | List all teams | Admin |
| `POST` | `/api/teams` | Create a new team | Admin |
| `PUT` | `/api/teams/{id}` | Update team name/description | Admin |
| `DELETE` | `/api/teams/{id}` | Delete a team | Admin |
| `GET` | `/api/teams/{id}/members` | List team members | Admin |
| `POST` | `/api/teams/{id}/members` | Add a member to the team | Admin |
| `PUT` | `/api/teams/{team_id}/members/{user_id}` | Change a member's role | Admin |
| `DELETE` | `/api/teams/{team_id}/members/{user_id}` | Remove a member | Admin |

All endpoints require `Bearer <JWT>` authentication. Team endpoints additionally require the `rbac` license feature — requests without a valid license receive a `403 Forbidden` response.

## Important Notes

- A user can belong to multiple teams with different roles in each
- The highest role across all team memberships determines the user's effective permissions for shared resources
- Deleting a team does not delete its resources — orphaned resources become accessible only to admins until reassigned
- The global role on the `users` table (replacing the old `is_admin` boolean) serves as a floor: a user with a global `editor` role has at least editor permissions everywhere, even in teams where they are assigned `viewer`
