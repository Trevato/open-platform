# Open Platform API

Elysia on Bun. REST API at `/api/v1/*`, interactive Swagger docs at `/swagger`.

## Base URL

| Context    | URL                                                          |
| ---------- | ------------------------------------------------------------ |
| External   | `https://api.{domain}` (e.g. `https://api.open-platform.sh`) |
| In-cluster | `http://op-api.op-system-op-api.svc:80`                      |

## Authentication

All `/api/v1/*` endpoints require a Forgejo personal access token (PAT) in the `Authorization` header:

```
Authorization: Bearer <forgejo-token>
```

The token is validated against Forgejo's `/api/v1/user` endpoint. Results are cached for 60 seconds (max 1000 entries). An invalid or missing token returns `401`.

Admin endpoints (`/api/v1/platform/*`) additionally verify the user is a Forgejo site admin or a member of the `system` organization. Non-admin users receive `403`.

## Endpoints

### Health (no auth)

| Method | Path       | Description               |
| ------ | ---------- | ------------------------- |
| GET    | `/healthz` | Returns `{"status":"ok"}` |

### Status

| Method | Path             | Description                         |
| ------ | ---------------- | ----------------------------------- |
| GET    | `/api/v1/status` | Platform health, services, and apps |

### Users

| Method | Path               | Description          |
| ------ | ------------------ | -------------------- |
| GET    | `/api/v1/users/me` | Current user profile |

### Organizations

| Method | Path           | Description             |
| ------ | -------------- | ----------------------- |
| GET    | `/api/v1/orgs` | List orgs               |
| POST   | `/api/v1/orgs` | Create org (admin only) |

### Organization Domains

| Method | Path                        | Description                  |
| ------ | --------------------------- | ---------------------------- |
| GET    | `/api/v1/orgs/domains`      | List available domains       |
| GET    | `/api/v1/orgs/:name/domain` | Get domain assigned to org   |
| PUT    | `/api/v1/orgs/:name/domain` | Assign domain to org (admin) |

### Repositories

| Method | Path                                | Description                 |
| ------ | ----------------------------------- | --------------------------- |
| GET    | `/api/v1/repos/:org`                | List repos in org           |
| GET    | `/api/v1/repos/:org/:repo`          | Get repo details            |
| POST   | `/api/v1/repos/:org`                | Create repo                 |
| DELETE | `/api/v1/repos/:org/:repo`          | Delete repo                 |
| POST   | `/api/v1/repos/:org/:repo/generate` | Generate repo from template |

### Pull Requests

| Method | Path                                      | Description                           |
| ------ | ----------------------------------------- | ------------------------------------- |
| GET    | `/api/v1/prs/:org/:repo`                  | List PRs (`?state=open\|closed\|all`) |
| GET    | `/api/v1/prs/:org/:repo/:number`          | Get PR                                |
| POST   | `/api/v1/prs/:org/:repo`                  | Create PR                             |
| POST   | `/api/v1/prs/:org/:repo/:number/merge`    | Merge PR                              |
| POST   | `/api/v1/prs/:org/:repo/:number/approve`  | Approve PR                            |
| GET    | `/api/v1/prs/:org/:repo/:number/comments` | List PR comments                      |
| POST   | `/api/v1/prs/:org/:repo/:number/comments` | Comment on PR                         |

### Issues, Labels, Milestones

| Method | Path                                         | Description                                                    |
| ------ | -------------------------------------------- | -------------------------------------------------------------- |
| GET    | `/api/v1/issues/:org/:repo`                  | List issues (filterable by state, labels, milestone, assignee) |
| GET    | `/api/v1/issues/:org/:repo/:number`          | Get issue                                                      |
| POST   | `/api/v1/issues/:org/:repo`                  | Create issue                                                   |
| PATCH  | `/api/v1/issues/:org/:repo/:number`          | Update issue                                                   |
| POST   | `/api/v1/issues/:org/:repo/:number/comments` | Comment on issue                                               |
| GET    | `/api/v1/issues/:org/:repo/labels`           | List labels                                                    |
| POST   | `/api/v1/issues/:org/:repo/labels`           | Create label                                                   |
| GET    | `/api/v1/issues/:org/:repo/milestones`       | List milestones                                                |
| POST   | `/api/v1/issues/:org/:repo/milestones`       | Create milestone                                               |

### Branches

| Method | Path                            | Description                              |
| ------ | ------------------------------- | ---------------------------------------- |
| GET    | `/api/v1/branches/:org/:repo`   | List branches                            |
| POST   | `/api/v1/branches/:org/:repo`   | Create branch                            |
| DELETE | `/api/v1/branches/:org/:repo/*` | Delete branch (supports slashes in name) |

### Files

| Method | Path                         | Description                                               |
| ------ | ---------------------------- | --------------------------------------------------------- |
| GET    | `/api/v1/files/:org/:repo/*` | Read file content (decoded UTF-8, `?ref=` for branch/tag) |
| PUT    | `/api/v1/files/:org/:repo/*` | Create or update file (direct commit)                     |

### Pipelines (CI/CD)

| Method | Path                                        | Description               |
| ------ | ------------------------------------------- | ------------------------- |
| GET    | `/api/v1/pipelines/:org/:repo`              | List pipelines            |
| POST   | `/api/v1/pipelines/:org/:repo`              | Trigger pipeline          |
| GET    | `/api/v1/pipelines/:org/:repo/:number`      | Get pipeline              |
| GET    | `/api/v1/pipelines/:org/:repo/:number/logs` | Get step logs (`?step=N`) |

### Apps

| Method | Path                      | Description                    |
| ------ | ------------------------- | ------------------------------ |
| GET    | `/api/v1/apps`            | List deployed apps             |
| GET    | `/api/v1/apps/:org/:repo` | Get app status                 |
| POST   | `/api/v1/apps/:org/:repo` | Deploy app (triggers pipeline) |

### Platform (admin only)

| Method | Path                                       | Description                     |
| ------ | ------------------------------------------ | ------------------------------- |
| GET    | `/api/v1/platform/services`                | Platform service health         |
| GET    | `/api/v1/platform/users`                   | List all Forgejo users          |
| POST   | `/api/v1/platform/users`                   | Create Forgejo user             |
| GET    | `/api/v1/platform/apps`                    | List deployed apps and orgs     |
| POST   | `/api/v1/platform/apps`                    | Create app from system template |
| POST   | `/api/v1/platform/apps/:org/:repo/archive` | Archive app (soft delete)       |
| POST   | `/api/v1/platform/apps/:org/:repo/restore` | Restore archived app            |
| POST   | `/api/v1/platform/apps/:org/:repo/stop`    | Stop app (scale to 0)           |
| POST   | `/api/v1/platform/apps/:org/:repo/start`   | Start app (scale to 1)          |
| DELETE | `/api/v1/platform/apps/:org/:repo`         | Permanently delete app          |
| GET    | `/api/v1/platform/config`                  | Read platform configuration     |
| PATCH  | `/api/v1/platform/config`                  | Update platform configuration   |

## Error Format

All errors return JSON with a single `error` field:

```json
{ "error": "Description of what went wrong" }
```

Validation errors return `422`. Upstream Forgejo/Woodpecker errors are sanitized -- internal URLs and implementation details are stripped. Status codes from upstream services are preserved where meaningful (404, 409, etc.) and default to 500 otherwise.
