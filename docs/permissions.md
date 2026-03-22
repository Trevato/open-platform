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

Admins can manage all instances, users, dev pods, services, and apps regardless of ownership.

### Developer

Any authenticated Forgejo user. Developers can:

- Manage their own dev pods (create, start, stop, delete)
- Access instances they own (via customer record)
- Interact with repos, issues, PRs, branches, and files they have Forgejo access to
- View platform status

Developers cannot see other users' dev pods or instances.

### AI Agent

Managed agents are first-class platform entities with dedicated Forgejo identities. Each agent gets its own user account (`agent-{slug}`), PAT, and org memberships. Agents are triggered via `@agent-{slug}` mentions in issues/PRs or manual activation.

Ad-hoc agents (e.g., Claude Code in a dev pod) use a Forgejo PAT scoped by token permissions. The agent operates with the same identity and access as the user who created the PAT.

## Forgejo as RBAC

The platform does not implement custom RBAC. Instead, it delegates authorization to Forgejo:

- **Org/team membership** controls who can access which repos
- **Repo permissions** (read, write, admin) are enforced by Forgejo when op-api proxies requests using the caller's token
- **Admin status** is determined by Forgejo's `is_admin` flag or `system` org membership

When op-api calls Forgejo on behalf of a user (repos, issues, PRs, files, branches), it passes the user's token directly. Forgejo enforces its own permission model on every proxied request. If a user lacks access to a repo, the Forgejo API returns 403/404 and op-api surfaces that error.

## API Permission Boundaries

### Admin-Only Endpoints (requireAdminPlugin)

All routes under `/platform` require admin access (403 if not admin):

| Endpoint                 | Purpose                     |
| ------------------------ | --------------------------- |
| `GET /platform/services` | Platform service health     |
| `GET /platform/users`    | List all Forgejo users      |
| `POST /platform/users`   | Create a Forgejo user       |
| `GET /platform/apps`     | List deployed apps and orgs |
| `POST /platform/apps`    | Create app from template    |

Org creation also checks `user.isAdmin` directly:

| Endpoint     | Purpose              |
| ------------ | -------------------- |
| `POST /orgs` | Create a Forgejo org |

### Owner-or-Admin Endpoints (authPlugin + ownership check)

These routes authenticate all users but enforce ownership. Admins see everything; developers see only their own resources.

| Endpoint                           | Behavior                                                         |
| ---------------------------------- | ---------------------------------------------------------------- |
| `GET /dev-pods`                    | Admin: all pods. Developer: own pods only.                       |
| `GET /dev-pods/:username`          | Admin: any pod. Developer: own pod only (403 otherwise).         |
| `PATCH /dev-pods/:username`        | Admin: any pod. Developer: own pod only.                         |
| `DELETE /dev-pods/:username`       | Admin: any pod. Developer: own pod only.                         |
| `GET /instances`                   | Admin with `?all=true`: all instances. Developer: own instances. |
| `GET /instances/:slug`             | Admin: any instance. Developer: own instance only.               |
| `DELETE /instances/:slug`          | Admin: any instance. Developer: own instance only.               |
| `GET /instances/:slug/credentials` | Same ownership check.                                            |
| `GET /instances/:slug/dev-pods`    | Admin: all pods in instance. Developer: own pods in instance.    |

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

The console does not perform its own admin checks at the auth layer. Instance visibility is controlled by the op-api: admin users see all instances, developers see only instances linked to their customer record. Customer records are auto-created from Forgejo profile data on first API interaction.

## Setting Up a Developer

1. Create a Forgejo user account (via admin UI or `POST /platform/users`)
2. Add the user to the relevant org on Forgejo
3. Add them to a team with appropriate repo access (read, write, or admin)
4. The user authenticates to op-api with a PAT or to the console via OAuth2
5. Repo-level access is inherited from Forgejo team membership -- no op-api configuration needed

## Setting Up Managed Agents

Managed agents run in dev pods and respond to `@agent-{slug}` mentions in Forgejo issues and PRs.

1. **Create via API or console**: `POST /api/v1/agents` with `name`, `instructions`, `orgs[]`, and optional `model`/`max_steps`
2. The platform automatically:
   - Creates a Forgejo user (`agent-{slug}`) with a generated password
   - Generates a PAT with required scopes (user, repo, org, issue, package)
   - Adds the agent to specified orgs (Owners team)
   - Registers org-level webhooks for `issue_comment`, `pull_request`, and `issues` events
3. **Trigger**: mention `@agent-{slug}` in any issue or PR comment within the agent's orgs
4. The agent receives a dev pod, pulls the repo, reads `CLAUDE.md` for project conventions, and executes with Claude Code
5. Results are posted back as a comment from the agent's Forgejo identity

### Agent Quality Gates

The app template includes three defense layers that prevent agents from pushing broken code:

1. **`CLAUDE.md`** -- project conventions (import patterns, stack, commands) loaded into the agent's system prompt
2. **`.claude/settings.json`** -- `PreToolUse` hook that runs `npm run typecheck` before every `git commit`
3. **`--append-system-prompt`** -- universal quality instructions appended at execution time (typecheck before commit, read CLAUDE.md, keep changes minimal)

### Agent Configuration

| Field           | Default                    | Description                           |
| --------------- | -------------------------- | ------------------------------------- |
| `model`         | `claude-sonnet-4-20250514` | Claude model for execution            |
| `max_steps`     | `50`                       | Maximum turns per execution           |
| `instructions`  | (none)                     | Agent-specific system prompt          |
| `allowed_tools` | (none)                     | Tool restrictions (unused currently)  |
| `orgs`          | (none)                     | Forgejo orgs the agent can access     |
| `schedule`      | (none)                     | Cron schedule for periodic activation |

## Setting Up Claude Code (ad-hoc)

For manual Claude Code sessions (not managed agents):

1. Create a Forgejo user account for the agent (e.g., `claude-dev`)
2. Add the user to the appropriate org and team on Forgejo
3. Create a PAT for the user with the required scopes:
   - `read:user` -- identity validation
   - `read:repository`, `write:repository` -- code access
   - `read:organization` -- org membership checks
   - `read:issue`, `write:issue` -- issue and PR management
   - `read:package`, `write:package` -- container registry access
4. Configure the MCP server or API client with the PAT as the bearer token
5. The agent operates with the same permissions as the Forgejo user -- constrained by org/team/repo membership

Dev pods created for an agent user automatically provision a scoped Forgejo PAT with the above scopes, injected into the pod environment.
