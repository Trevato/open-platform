# Open Platform CLI

Command-line interface for the Open Platform. Built with Commander.js, runs on Bun.

## Installation

For manual installation:

```bash
cd tools/op-cli
bun install
bun build src/index.ts --compile --outfile op
mv op /usr/local/bin/
```

## Authentication

```bash
op login https://api.open-platform.sh --token <forgejo-pat>
```

The token is validated against the API, then saved to `~/.op/config.yaml` (mode 0600). Use `-k` / `--insecure` for self-signed TLS.

Alternatively, set environment variables (no login required):

```bash
export OP_API_URL=https://api.open-platform.sh
export FORGEJO_TOKEN=<your-pat>
```

Config file takes precedence when both exist.

## Commands

### Authentication

| Command                     | Description                  |
| --------------------------- | ---------------------------- |
| `op login <url> -t <token>` | Authenticate and save config |
| `op whoami`                 | Show current user            |

### Platform Status

| Command           | Description                                |
| ----------------- | ------------------------------------------ |
| `op status`       | Platform health overview (services + apps) |
| `op service list` | List platform services with health status  |

### Apps

| Command                                   | Description                                              |
| ----------------------------------------- | -------------------------------------------------------- |
| `op app list`                             | List deployed apps                                       |
| `op app status <org/repo>`                | Show app deployment status                               |
| `op app deploy <org/repo>`                | Trigger deploy pipeline (`--branch main`)                |
| `op app create --org <org> --name <name>` | Create app from template (`--description`, `--template`) |

### Repositories

Repos are managed through the Forgejo API endpoints. Use `op app create` to generate from template, or interact via the API directly.

### Pull Requests

| Command                                               | Description                                 |
| ----------------------------------------------------- | ------------------------------------------- |
| `op pr list <org/repo>`                               | List PRs (`--state open\|closed\|all`)      |
| `op pr create <org/repo> --title <t> --head <branch>` | Create PR (`--base main`, `--body`)         |
| `op pr merge <org/repo> <number>`                     | Merge PR (`--method merge\|rebase\|squash`) |
| `op pr approve <org/repo> <number>`                   | Approve PR (`--body` for review comment)    |

### Issues

| Command                                              | Description                                                                  |
| ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| `op issue list <org/repo>`                           | List issues (`--state`, `--labels`, `--milestone`, `--assignee`)             |
| `op issue create <org/repo> --title <t>`             | Create issue (`--body`, `--labels <ids>`, `--milestone <id>`, `--assignees`) |
| `op issue update <org/repo> <number>`                | Update issue fields (`--title`, `--state`, `--labels`, etc.)                 |
| `op issue comment <org/repo> <number> --body <text>` | Comment on issue                                                             |

### Labels

| Command                                               | Description                    |
| ----------------------------------------------------- | ------------------------------ |
| `op label list <org/repo>`                            | List labels with IDs           |
| `op label create <org/repo> --name <n> --color <hex>` | Create label (`--description`) |

### Milestones

| Command                                      | Description                                            |
| -------------------------------------------- | ------------------------------------------------------ |
| `op milestone list <org/repo>`               | List milestones (`--state`)                            |
| `op milestone create <org/repo> --title <t>` | Create milestone (`--description`, `--due <ISO-date>`) |

### Branches

| Command                                  | Description                   |
| ---------------------------------------- | ----------------------------- |
| `op branch list <org/repo>`              | List branches                 |
| `op branch create <org/repo> --name <n>` | Create branch (`--from main`) |
| `op branch delete <org/repo> <name>`     | Delete branch                 |

### Files

| Command                                                 | Description                                  |
| ------------------------------------------------------- | -------------------------------------------- |
| `op file get <org/repo> <path>`                         | Read file content (`--ref` for branch/tag)   |
| `op file put <org/repo> <path> --message <msg> --stdin` | Write file (`--branch`, `--sha` for updates) |

Example: pipe content into a file update:

```bash
echo "hello" | op file put system/social README.md --message "Update readme" --stdin
```

### Pipelines

| Command                                | Description                             |
| -------------------------------------- | --------------------------------------- |
| `op pipeline list <org/repo>`          | List pipelines with status and duration |
| `op pipeline logs <org/repo> <number>` | Show step logs (`--step 2`)             |

### Users (admin)

| Command                             | Description                           |
| ----------------------------------- | ------------------------------------- |
| `op user list`                      | List platform users                   |
| `op user create <username> <email>` | Create user (prints initial password) |
| `op user whoami`                    | Show current user                     |

## Environment Variables

| Variable        | Description                              |
| --------------- | ---------------------------------------- |
| `OP_API_URL`    | API base URL (alternative to `op login`) |
| `FORGEJO_TOKEN` | Forgejo PAT (alternative to `op login`)  |

## Config File

Stored at `~/.op/config.yaml`:

```yaml
url: https://api.open-platform.sh
token: <forgejo-pat>
insecure: false
```
