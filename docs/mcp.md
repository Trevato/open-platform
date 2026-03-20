# Open Platform MCP Server

Model Context Protocol server at `/mcp`. Streamable HTTP transport with session-based state. Gives AI agents full access to the platform through tool calls.

## Overview

The MCP server runs as part of the `op-api` service. Each authenticated session gets its own `McpServer` instance with Forgejo and Woodpecker clients scoped to the user's token. Sessions expire after 30 minutes of inactivity and are cleaned up every 5 minutes.

## Setup

### Dev pods (pre-configured)

Dev pods ship with MCP already configured. No setup needed.

### External use

Add to `~/.claude/.mcp.json` (or your MCP client's config):

```json
{
  "mcpServers": {
    "open-platform": {
      "type": "streamable-http",
      "url": "https://api.open-platform.sh/mcp",
      "headers": {
        "Authorization": "Bearer <forgejo-pat>"
      }
    }
  }
}
```

Replace `<forgejo-pat>` with a Forgejo personal access token.

For self-signed TLS deployments, consult your MCP client's documentation for disabling certificate verification.

## Authentication

Every request to `/mcp` requires a Bearer token in the `Authorization` header. The token is validated against Forgejo. Unauthenticated requests receive `401`.

## Session Lifecycle

1. **Initialize** -- POST to `/mcp` without a session ID. Must be an MCP `initialize` request. Returns a `mcp-session-id` header.
2. **Interact** -- POST to `/mcp` with the `mcp-session-id` header for tool calls and other messages.
3. **Stream** -- GET to `/mcp` with the session ID to open an SSE stream for server-initiated messages.
4. **Close** -- DELETE to `/mcp` with the session ID to terminate the session.

Sessions have a 30-minute TTL. Stale sessions are closed automatically.

## Tool Catalog

### User

| Tool     | Description                         |
| -------- | ----------------------------------- |
| `whoami` | Get current authenticated user info |

### Organizations

| Tool         | Description                      |
| ------------ | -------------------------------- |
| `list_orgs`  | List accessible organizations    |
| `create_org` | Create organization (admin only) |

### Repositories

| Tool                        | Description                            |
| --------------------------- | -------------------------------------- |
| `list_repos`                | List repos in an organization          |
| `get_repo`                  | Get repository details                 |
| `create_repo`               | Create empty repository                |
| `delete_repo`               | Delete repository (destructive)        |
| `create_repo_from_template` | Generate repo from the system template |

### Pull Requests

| Tool            | Description                         |
| --------------- | ----------------------------------- |
| `list_prs`      | List PRs with state filter          |
| `create_pr`     | Create pull request                 |
| `merge_pr`      | Merge PR (merge, rebase, or squash) |
| `approve_pr`    | Approve PR with optional comment    |
| `comment_on_pr` | Add comment to PR                   |

### Issues

| Tool               | Description                                                   |
| ------------------ | ------------------------------------------------------------- |
| `list_issues`      | List issues with filters (state, labels, milestone, assignee) |
| `create_issue`     | Create issue with labels, milestone, assignees                |
| `update_issue`     | Update issue fields                                           |
| `comment_on_issue` | Comment on issue                                              |

### Labels and Milestones

| Tool               | Description                                        |
| ------------------ | -------------------------------------------------- |
| `list_labels`      | List labels with IDs (needed for issue operations) |
| `create_label`     | Create label with color                            |
| `create_milestone` | Create milestone with optional due date            |

### Branches

| Tool            | Description                    |
| --------------- | ------------------------------ |
| `list_branches` | List branches with commit info |
| `create_branch` | Create branch from base        |
| `delete_branch` | Delete branch                  |

### Files

| Tool                    | Description                                          |
| ----------------------- | ---------------------------------------------------- |
| `get_file_content`      | Read file from repo (decoded UTF-8, optional ref)    |
| `create_or_update_file` | Write file via direct commit (provide sha to update) |

### CI/CD Pipelines

| Tool                  | Description                                     |
| --------------------- | ----------------------------------------------- |
| `trigger_deploy`      | Trigger deployment pipeline                     |
| `get_pipeline_status` | Get pipeline status (latest if no number given) |
| `get_pipeline_logs`   | Get logs for a specific pipeline step           |

### Apps

| Tool                  | Description                                     |
| --------------------- | ----------------------------------------------- |
| `list_apps`           | List all deployed applications                  |
| `get_app_status`      | Get application deployment status               |
| `get_platform_status` | Full platform health with all services and apps |

### Platform (admin only)

| Tool                     | Description                     |
| ------------------------ | ------------------------------- |
| `list_platform_services` | Service health statuses         |
| `list_platform_users`    | List Forgejo users (paginated)  |
| `create_platform_user`   | Create Forgejo user             |
| `list_platform_apps`     | List deployed applications      |
| `create_platform_app`    | Create app from system template |

### Instances (vCluster)

| Tool                         | Description                                  |
| ---------------------------- | -------------------------------------------- |
| `list_instances`             | List instances (all flag for admin)          |
| `create_instance`            | Create instance with slug, name, email, tier |
| `get_instance`               | Instance detail with events                  |
| `delete_instance`            | Terminate instance                           |
| `get_instance_credentials`   | Get admin credentials                        |
| `reset_instance_credentials` | Reset admin password                         |
| `get_instance_kubeconfig`    | Get kubeconfig                               |
| `list_instance_services`     | Services in instance                         |
| `list_instance_apps`         | Apps in instance                             |

### Dev Pods

| Tool                       | Description                                    |
| -------------------------- | ---------------------------------------------- |
| `list_dev_pods`            | List host dev pods                             |
| `create_dev_pod`           | Create dev pod (optional cpu, memory, storage) |
| `get_dev_pod`              | Get dev pod status by username                 |
| `control_dev_pod`          | Start or stop dev pod                          |
| `delete_dev_pod`           | Delete dev pod                                 |
| `list_instance_dev_pods`   | List dev pods in an instance                   |
| `create_instance_dev_pod`  | Create dev pod in an instance                  |
| `get_instance_dev_pod`     | Get instance dev pod status                    |
| `control_instance_dev_pod` | Start/stop instance dev pod                    |
| `delete_instance_dev_pod`  | Delete instance dev pod                        |
