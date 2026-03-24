# Open Platform

Self-hosted developer platform where AI agents are first-class citizens. They have real Forgejo accounts, respond to @mentions in issues and PRs, run on cron schedules, and chat in real-time through the console. One command deploys Git hosting, CI/CD, a Kubernetes dashboard, object storage, a management console, and PostgreSQL -- all authenticated through a single identity provider and served on one wildcard domain.

```
*.yourdomain.com
  forgejo.   -- Git, packages, container registry, SSO
  ci.        -- CI/CD pipelines
  headlamp.  -- Kubernetes dashboard
  minio.     -- Object storage console
  s3.        -- S3-compatible API
  console.   -- Management dashboard
  api.       -- REST API + MCP server (61 tools for AI agents)
  {app}.     -- Your apps (push-to-deploy from template)
```

## Why

Setting up a modern dev environment means stitching together a dozen SaaS products, managing separate auth for each, and hoping they integrate. Open Platform replaces all of that with a single deploy that just works -- self-hosted, self-managing, and designed for teams that want to own their infrastructure.

After bootstrap, Flux GitOps takes over. Push to the platform repo on Forgejo and changes reconcile automatically. No manual Helm commands in steady state.

Beyond infrastructure, Open Platform treats AI agents as native participants. Create managed agent identities that respond to @mentions in issues and PRs, run on cron schedules, or chat in real-time through the console -- each with their own Forgejo account, access token, and org memberships.

## Features

**One-command deploy.** `make deploy` bootstraps everything from a single `open-platform.yaml` config file -- generates secrets, installs services, configures OAuth2 between them, and hands off to Flux.

**App template.** Create a new repo from the built-in template and get a production-ready Next.js 15 app with PostgreSQL, S3 storage, Forgejo OAuth2, and four CI workflows. Push to main and it deploys. Open a PR and it gets its own isolated preview environment.

**PR preview environments.** Every pull request gets a dedicated namespace, database, and S3 bucket. Seed data is applied automatically. OAuth2-Proxy requires Forgejo login to access. Closing the PR cleans up everything.

**Dev Pods.** Cloud development environments running in your cluster. Ubuntu + Nix + nixvim + Claude Code + Docker-in-Docker. Pre-configured with your Forgejo credentials, the `op` CLI, and a pre-connected MCP server. Create one with `op devpod create` or from the Console UI.

**Multi-tenant hosting.** Provision fully isolated platform instances via vCluster. Each tenant gets their own Forgejo, CI, storage, and database at `{slug}-forgejo.{domain}`, `{slug}-ci.{domain}`, etc. Managed through the Console or CLI.

**Managed Agents.** Create AI identities with real Forgejo accounts. They respond to @mentions in issues and PRs, run on cron schedules, and chat in real-time through the console. Quality gates enforce typecheck before every commit.

**MCP Server.** 61 tools across 13 categories give AI agents programmatic access to repos, issues, PRs, pipelines, apps, agents, instances, and dev pods. Streamable HTTP transport with session management.

**CLI.** The `op` command handles everything: apps, PRs, issues, pipelines, users, instances, dev pods. Authenticates via Forgejo personal access token.

## Architecture

```
Browser --> Traefik (ingress, wildcard DNS)
              |-- forgejo    --> Forgejo (git, packages, OIDC provider)
              |-- ci         --> Woodpecker (CI/CD, K8s-native backend)
              |-- headlamp   --> Headlamp (K8s dashboard, OIDC auth)
              |-- minio / s3 --> MinIO (S3-compatible object storage)
              |-- console    --> Console (management dashboard)
              |-- api        --> Platform API (REST + MCP, 61 AI tools)
              |-- {apps}     --> Apps (from template, push-to-deploy)

Flux (GitOps) --> system/open-platform on Forgejo --> reconciles all services
Woodpecker CI --> builds and deploys apps per push
PostgreSQL    --> CNPG-managed cluster (shared infrastructure)
```

All services authenticate through Forgejo as the single OIDC/OAuth2 identity provider. Sign in once, access everything.

## Services

| Service      | Domain                           | Role                                            |
| ------------ | -------------------------------- | ----------------------------------------------- |
| Forgejo      | `forgejo.{domain}`               | Git, packages, container registry, SSO provider |
| Woodpecker   | `ci.{domain}`                    | CI/CD with K8s-native pipeline backend          |
| Headlamp     | `headlamp.{domain}`              | Kubernetes dashboard with OIDC                  |
| MinIO        | `minio.{domain}` / `s3.{domain}` | S3-compatible object storage                    |
| Console      | `console.{domain}`               | Instance and dev pod management                 |
| Platform API | `api.{domain}`                   | REST + MCP (61 tools), agent management         |
| PostgreSQL   | internal                         | CNPG-managed database cluster                   |
| Flux         | internal                         | GitOps -- self-managing after bootstrap         |

## Quick Start

### Prerequisites

- Kubernetes cluster (k3s recommended, any distribution works)
- [Helm](https://helm.sh/) and [Helmfile](https://github.com/helmfile/helmfile)
- `kubectl`, `curl`, `jq`, `git`
- Wildcard DNS (`*.yourdomain.com`) pointing to your cluster's ingress IP

#### Linux (bare metal or VM)

```bash
# Install k3s (if needed)
curl -sfL https://get.k3s.io | sh -

# Clone and configure
git clone https://github.com/trevato/open-platform.git
cd open-platform
cp open-platform.yaml.example open-platform.yaml
# Edit: set domain, admin email, tls.mode (letsencrypt recommended)

# Deploy
make deploy
```

#### macOS (Colima -- for local development)

```bash
# Start a k3s-compatible VM
colima start op --kubernetes --cpu 4 --memory 8 --disk 50 \
  --runtime containerd --network-address

# Note the VM IP from `colima list` (e.g., 192.168.64.4)
# Configure DNS: resolve *.dev.test to the VM IP (dnsmasq or /etc/hosts)

# Clone and configure
git clone https://github.com/trevato/open-platform.git
cd open-platform
cp open-platform.yaml.example open-platform.yaml
# Edit: set domain: dev.test, tls.mode: selfsigned

# Deploy
make deploy

# Trust the self-signed CA
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain certs/ca.crt
```

### After Deploy

1. Open `https://forgejo.{domain}` and sign in with the admin credentials from `open-platform.state.yaml`
2. All other services use Forgejo SSO -- click "Sign in with Forgejo"
3. Run `make urls` to see all service URLs

## Creating Apps

Create a new repository from `system/template` on Forgejo, or use the CLI:

```bash
op app create --org myorg --name myapp
```

The template includes:

- **Next.js 15** with App Router
- **PostgreSQL** database (provisioned per app)
- **S3/MinIO** storage (bucket per app)
- **Forgejo OAuth2** via better-auth
- **4 CI workflows**: deploy (main), preview (PR), preview-cleanup (PR close), reset (manual)

Push to main and Woodpecker builds, provisions infrastructure, and deploys. The app is live at `https://{appname}.{domain}`.

### PR Preview Environments

Open a pull request and an isolated preview auto-deploys:

- Dedicated namespace, database, and S3 bucket
- URL: `https://pr-{N}-{repo}.{domain}`
- Protected by OAuth2-Proxy (requires Forgejo login)
- Seed data applied automatically
- Cleaned up when the PR closes

## Dev Pods

Cloud development environments running in your cluster with pre-configured tools.

```bash
op devpod create             # Create a dev pod for the current user
op devpod list               # List all dev pods
op devpod stop alice         # Stop a dev pod (scales to 0)
op devpod start alice        # Start it back up
op devpod delete alice       # Delete pod and storage
```

Each dev pod includes: Ubuntu 24.04, Nix, nixvim, Claude Code, Node.js, Docker-in-Docker, the `op` CLI, and a pre-configured MCP connection. Persistent home directory via PVC.

Also available from the Console UI at `https://console.{domain}`.

## Agents

Managed AI identities that operate as real Forgejo users. Each agent gets a dedicated account, personal access token, and organization memberships.

### Creating Agents

From the Console at `https://console.{domain}/dashboard/agents/new`, or via the MCP/CLI:

```bash
# Via CLI
op agent create --name "Code Reviewer" \
  --model claude-sonnet-4-6 \
  --orgs system \
  --instructions "Review PRs for correctness, style, and test coverage."
```

### Triggering via @mention

Mention an agent in any issue or PR comment:

```
@agent-code-reviewer Please review this PR.
```

The agent acknowledges, pulls the repo into its dev pod, runs Claude Code with the prompt and quality gates, and posts the results back as a comment.

### Scheduling

Agents can run on a cron schedule:

```bash
op agent update code-reviewer --schedule "0 */6 * * *"
```

### Console Chat

Open `https://console.{domain}/dashboard/agents/{slug}/chat` for real-time streaming conversation. Tool calls are visualized inline. Conversations persist across sessions.

### Claude Code Integration

Click the Claude Code button on any agent card in the Console to get a setup command:

```bash
claude mcp add --transport http --scope user op-code-reviewer \
  https://api.{domain}/mcp --header "Authorization: Bearer <agent-token>"
```

All 61 platform tools are then available in Claude Code under the agent's server name.

### Quality Gates

Every agent execution enforces:

- **CLAUDE.md** -- per-repo conventions the agent must follow
- **Pre-commit typecheck hook** -- blocks commits with TypeScript errors
- **System prompt injection** -- universal quality instructions appended at runtime
- **Allowed tools** -- constrains which MCP tools are available in chat mode

## CLI

The `op` CLI authenticates with a Forgejo personal access token:

```bash
op login https://api.{domain} --token <your-pat>
```

Selected commands:

```
op status                           Platform health check
op whoami                           Current user info

op app list                         List deployed apps
op app create --org O --name N      Create app from template
op app deploy org/repo              Trigger deploy pipeline

op pr list org/repo                 List pull requests
op pr create org/repo -t "Title"    Create a PR
op pr merge org/repo 1              Merge PR #1

op issue list org/repo              List issues
op issue create org/repo -t "Bug"   Create an issue

op pipeline list org/repo           List CI pipelines
op pipeline logs org/repo 42        View pipeline logs

op devpod create                    Create dev pod
op devpod list                      List dev pods

op instance create acme             Provision tenant instance
op instance credentials show acme   Show instance credentials
```

See [docs/cli.md](docs/cli.md) for the full command reference.

## MCP Server

The MCP server gives AI agents full access to the platform through 61 tools. Inside a dev pod, it is already configured. For external use, add to your MCP client config:

```json
{
  "mcpServers": {
    "open-platform": {
      "type": "streamable-http",
      "url": "https://api.{domain}/mcp",
      "headers": {
        "Authorization": "Bearer <forgejo-pat>"
      }
    }
  }
}
```

Tool categories: orgs (2), repos (5), PRs (5), issues (7), branches (3), files (2), pipelines (3), apps (3), agents (6), users (1), platform (5), instances (9), dev pods (10).

See [docs/mcp.md](docs/mcp.md) for the full tool catalog.

## Multi-Tenant Hosting

Provision isolated platform instances for teams or customers using vCluster. Each instance gets its own Forgejo, Woodpecker, Headlamp, MinIO, and PostgreSQL.

```bash
op instance create acme --name "Acme Corp" --email admin@acme.com --tier pro
op instance list
op instance credentials show acme
```

| Tier | CPU  | Memory | Storage |
| ---- | ---- | ------ | ------- |
| Free | 500m | 2Gi    | 10Gi    |
| Pro  | 2    | 8Gi    | 50Gi    |
| Team | 4    | 16Gi   | 100Gi   |

Enable by adding `provisioner: { enabled: true }` to `open-platform.yaml`. See [docs/hosting.md](docs/hosting.md) for the full architecture.

## Configuration

`open-platform.yaml` is the single source of truth. Copy the example and edit:

```yaml
domain: myplatform.example.com

admin:
  username: opadmin
  email: admin@example.com

tls:
  mode: letsencrypt # letsencrypt | selfsigned | cloudflare
  email: admin@example.com
```

Optional sections: `service_prefix` (multi-tenant subdomain prefix), `cloudflare` (tunnel config), `provisioner` (vCluster hosting).

## Makefile Targets

```
make deploy      Full deploy -- generates config, syncs releases, bootstraps Flux (idempotent)
make generate    Regenerate config from open-platform.yaml
make diff        Preview changes without applying
make status      Check Helm release status
make urls        Show all service URLs
make teardown    Destroy all resources (requires confirmation)
make test-smoke  Run smoke tests (curl-based)
make test-e2e    Run Playwright E2E tests
```

## How It Works

1. `open-platform.yaml` defines your platform (domain, admin, TLS, optional features)
2. `generate-config.sh` templates all Helm values, Flux manifests, and env files
3. `deploy.sh` bootstraps in 5 tiers: infra, storage, identity, apps, gitops
4. Automated hooks configure OAuth2 between services, set up the system org, and seed repos
5. Flux adopts all releases -- the platform is now self-managing
6. Push changes to `system/open-platform` on Forgejo and Flux reconciles within a minute

## Documentation

| Document                                   | Description                                   |
| ------------------------------------------ | --------------------------------------------- |
| [Getting Started](docs/getting-started.md) | Install, deploy, first login, create an app   |
| [REST API](docs/api.md)                    | Endpoint reference, auth, error format        |
| [CLI](docs/cli.md)                         | Full command reference for `op`               |
| [MCP Server](docs/mcp.md)                  | Tool catalog for AI agents                    |
| [Multi-Tenant Hosting](docs/hosting.md)    | vCluster architecture and instance management |
| [Permissions](docs/permissions.md)         | Auth model, roles, AI agent setup             |
| [Services](docs/services.md)               | Per-service config, secrets, env vars         |
| [Bootstrap](docs/bootstrap.md)             | Deploy pipeline, scripts, template inventory  |
| [Known Issues](docs/known-issues.md)       | Implementation notes and debugging            |

## License

AGPL-3.0 -- see [LICENSE](LICENSE).
