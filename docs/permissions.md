# Permission Model

## Authentication

All op-api requests require a Forgejo Personal Access Token (PAT) in the `Authorization` header:

```
Authorization: Bearer <forgejo-pat>
```

On each request, op-api validates the token by calling Forgejo's `GET /api/v1/user` endpoint. The response provides the user's identity, including `is_admin` status. Validated tokens are cached for 60 seconds (max 1000 entries) to avoid redundant Forgejo calls.

The console (web UI) authenticates separately via Forgejo OAuth2 through better-auth. Users sign in with their Forgejo account and receive a session cookie.

## Roles

### Platform Admin

A user is a platform admin if **either** condition is true:

- `is_admin: true` on their Forgejo account (site administrator)
- Member of the `system` org on Forgejo

The system org membership check calls `GET /api/v1/orgs/system/members/{username}` using the caller's token. A 204 response confirms membership. This result is cached for 30 seconds.

Admins can manage all users, services, and apps regardless of ownership.

### Developer

Any authenticated Forgejo user. Developers can:

- Interact with repos, issues, PRs, branches, and files they have Forgejo access to
- View platform status

## Forgejo as RBAC

The platform does not implement custom RBAC. Instead, it delegates authorization to Forgejo:

- **Org/team membership** controls who can access which repos
- **Repo permissions** (read, write, admin) are enforced by Forgejo when op-api proxies requests using the caller's token
- **Admin status** is determined by Forgejo's `is_admin` flag or `system` org membership

When op-api calls Forgejo on behalf of a user (repos, issues, PRs, files, branches), it passes the user's token directly. Forgejo enforces its own permission model on every proxied request. If a user lacks access to a repo, the Forgejo API returns 403/404 and op-api surfaces that error.

## API Permission Boundaries

### Admin-Only Endpoints (requireAdminPlugin)

All routes under `/platform` require admin access (403 if not admin):

| Endpoint                                 | Purpose                     |
| ---------------------------------------- | --------------------------- |
| `GET /platform/services`                 | Platform service health     |
| `GET /platform/users`                    | List all Forgejo users      |
| `POST /platform/users`                   | Create a Forgejo user       |
| `GET /platform/apps`                     | List deployed apps and orgs |
| `POST /platform/apps`                    | Create app from template    |
| `POST /platform/apps/:org/:repo/archive` | Archive app (soft delete)   |
| `POST /platform/apps/:org/:repo/restore` | Restore archived app        |
| `POST /platform/apps/:org/:repo/stop`    | Stop app (scale to 0)       |
| `POST /platform/apps/:org/:repo/start`   | Start app (scale to 1)      |
| `DELETE /platform/apps/:org/:repo`       | Permanently delete app      |
| `GET /platform/config`                   | Read platform configuration |
| `PATCH /platform/config`                 | Update platform config      |

Org creation also checks `user.isAdmin` directly:

| Endpoint     | Purpose              |
| ------------ | -------------------- |
| `POST /orgs` | Create a Forgejo org |

### Forgejo-Delegated Endpoints (authPlugin only)

These routes authenticate the user, then proxy to Forgejo or Woodpecker using the caller's token. Authorization is enforced by the upstream service.

| Prefix       | Operations                                                |
| ------------ | --------------------------------------------------------- |
| `/repos`     | List, get, create, delete repos; generate from template   |
| `/branches`  | List, create, delete branches                             |
| `/files`     | Read and write file content                               |
| `/issues`    | List, create, update issues; comments, labels, milestones |
| `/prs`       | List, create, merge, approve PRs; comments                |
| `/pipelines` | List, get, trigger pipelines; view logs                   |
| `/orgs`      | List orgs (read)                                          |
| `/apps`      | List apps, get status, trigger deploy                     |
| `/users/me`  | Current user profile                                      |
| `/status`    | Platform health overview                                  |

## Console Permission Model

The console web UI authenticates via Forgejo OAuth2 (better-auth with genericOAuth plugin). After login, the user's identity comes from Forgejo's profile (`login`, `email`, `avatar_url`).

The console does not perform its own admin checks at the auth layer. Resource visibility is controlled by the op-api: admin users see everything, developers see only their own resources.

## Setting Up a Developer

1. Create a Forgejo user account (via admin UI or `POST /platform/users`)
2. Add the user to the relevant org on Forgejo
3. Add them to a team with appropriate repo access (read, write, or admin)
4. The user authenticates to op-api with a PAT or to the console via OAuth2
5. Repo-level access is inherited from Forgejo team membership -- no op-api configuration needed

## Setting Up Claude Code

To use Claude Code with the platform:

1. Create a Forgejo user account (e.g., `claude-dev`)
2. Add the user to the appropriate org and team on Forgejo
3. Create a PAT for the user with the required scopes:
   - `read:user` -- identity validation
   - `read:repository`, `write:repository` -- code access
   - `read:organization` -- org membership checks
   - `read:issue`, `write:issue` -- issue and PR management
   - `read:package`, `write:package` -- container registry access
4. Configure the MCP server or API client with the PAT as the bearer token
5. The user operates with the same permissions as the Forgejo user -- constrained by org/team/repo membership
