# Getting Started

This guide walks through deploying Open Platform from scratch on either macOS (via Colima) or Linux (bare metal k3s). By the end, you will have a fully working developer platform with Git hosting, CI/CD, object storage, and push-to-deploy app workflows.

## Prerequisites

These tools are required regardless of platform:

- **kubectl** -- Kubernetes CLI
- **helm** -- Kubernetes package manager
- **helmfile** v1.1.9+ -- declarative Helm chart management
- **helm-diff plugin** -- required by helmfile for diff/sync operations
- **curl**, **jq**, **git** -- standard utilities

Platform-specific installation is covered in each section below.

## Mac Setup (Colima)

Colima runs a lightweight Linux VM with k3s-compatible Kubernetes. This is the recommended path for local development.

### 1. Install dependencies

```bash
brew install colima docker kubernetes-cli helm helmfile jq
```

### 2. Install the helm-diff plugin

```bash
helm plugin install https://github.com/databus23/helm-diff
```

### 3. Start Colima with Kubernetes

```bash
colima start op --kubernetes --cpu 4 --memory 8 --disk 50 --runtime containerd --network-address
```

The `--network-address` flag assigns a routable IP to the VM, which is required for DNS resolution in later steps. You can adjust CPU, memory, and disk to match your machine.

### 4. Verify the cluster

```bash
kubectl get nodes
```

You should see a single node in `Ready` state.

### 5. Get the Colima VM IP

```bash
colima list
```

Note the `ADDRESS` column (e.g., `192.168.64.4`). You will use this IP in the next step.

### 6. Configure local DNS

Open Platform uses wildcard subdomains (`*.dev.test`). You need local DNS resolution pointing all `*.dev.test` queries to the Colima VM IP.

Create a resolver so macOS delegates `.dev.test` lookups to a local nameserver:

```bash
sudo mkdir -p /etc/resolver
echo "nameserver 127.0.0.1" | sudo tee /etc/resolver/dev.test
```

Install and configure dnsmasq to resolve `*.dev.test` to the Colima VM IP:

```bash
brew install dnsmasq
```

Add the following line to `/opt/homebrew/etc/dnsmasq.conf` (replace `192.168.64.4` with your actual Colima IP from step 5):

```
address=/dev.test/192.168.64.4
```

Start dnsmasq:

```bash
sudo brew services start dnsmasq
```

Verify it works:

```bash
dig forgejo.dev.test @127.0.0.1 +short
```

This should return your Colima VM IP.

### 7. Clone and configure

```bash
git clone https://github.com/trevato/open-platform.git
cd open-platform
cp open-platform.yaml.example open-platform.yaml
```

Edit `open-platform.yaml`:

```yaml
domain: dev.test

admin:
  username: opadmin
  email: admin@dev.test

tls:
  mode: selfsigned
  email: admin@dev.test
```

### 8. Deploy

```bash
make deploy
```

This takes roughly 5 minutes on the first run. The deploy script generates all configuration from `open-platform.yaml`, bootstraps infrastructure via helmfile, configures OIDC, and activates CI pipelines.

### 9. Trust the self-signed CA

The deploy generates a CA certificate at `certs/ca.crt`. Add it to the macOS trust store so browsers accept the self-signed certificates:

```bash
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain certs/ca.crt
```

### 10. Verify

```bash
make urls
```

This prints all service URLs. Open `https://forgejo.dev.test` in your browser to confirm everything is running.

---

## Linux Setup (Bare Metal / VM)

For production servers or dedicated VMs running a standard Linux distribution.

### 1. Install k3s

```bash
curl -sfL https://get.k3s.io | sh -
```

For multi-node clusters where nodes communicate over a WAN or VPN (e.g., Tailscale), add `--flannel-external-ip` to the server flags.

### 2. Set up kubeconfig

```bash
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown $(id -u):$(id -g) ~/.kube/config
```

Verify:

```bash
kubectl get nodes
```

### 3. Install Helm

```bash
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
```

### 4. Install helmfile

Download the latest release (v1.1.9 or newer) from [github.com/helmfile/helmfile/releases](https://github.com/helmfile/helmfile/releases) and place the binary on your `PATH`.

On Debian/Ubuntu:

```bash
# Example for linux amd64 — check the releases page for the latest version
curl -fsSL -o helmfile.tar.gz https://github.com/helmfile/helmfile/releases/download/v1.1.9/helmfile_1.1.9_linux_amd64.tar.gz
tar xzf helmfile.tar.gz helmfile
sudo mv helmfile /usr/local/bin/
rm helmfile.tar.gz
```

### 5. Install the helm-diff plugin

```bash
helm plugin install https://github.com/databus23/helm-diff
```

### 6. Configure wildcard DNS

Point `*.yourdomain.com` to your server's public IP. You need a wildcard A record:

```
*.yourdomain.com.  IN  A  <your-server-ip>
```

How you create this record depends on your DNS provider. The important thing is that any subdomain of your domain resolves to the server.

### 7. Clone, configure, and deploy

```bash
git clone https://github.com/trevato/open-platform.git
cd open-platform
cp open-platform.yaml.example open-platform.yaml
```

Edit `open-platform.yaml` with your domain and a valid email for Let's Encrypt:

```yaml
domain: yourdomain.com

admin:
  username: opadmin
  email: admin@yourdomain.com

tls:
  mode: letsencrypt
  email: admin@yourdomain.com
```

Deploy:

```bash
make deploy
```

---

## What You Get

After deploy completes, all services are live at `*.{domain}`:

| Service    | URL                              | Purpose                                                   |
| ---------- | -------------------------------- | --------------------------------------------------------- |
| Forgejo    | `forgejo.{domain}`               | Git hosting, container registry, OAuth2 identity provider |
| Woodpecker | `ci.{domain}`                    | CI/CD pipelines                                           |
| MinIO      | `minio.{domain}` / `s3.{domain}` | Object storage console and S3 API                         |
| Console    | `console.{domain}`               | Management dashboard                                      |
| API        | `api.{domain}`                   | REST API and MCP server                                   |

The `system` org on Forgejo contains pre-deployed example apps: social, minecraft, arcade, events, and hub.

## First Login

1. Open `open-platform.state.yaml` in the project root (generated during deploy, gitignored). Find the admin username and password.
2. Go to `https://forgejo.{domain}` and sign in with those credentials.
3. All other services use Forgejo for authentication. Click "Sign in with Forgejo" when prompted.

## Create a Developer User

Through the Forgejo admin panel at `https://forgejo.{domain}/-/admin/users`, or through the CLI:

```bash
op user create alice alice@example.com
```

This returns a generated password. Users can create personal access tokens at `https://forgejo.{domain}/user/settings/applications`.

## Create an App

### From the Forgejo UI

1. Navigate to `system/template` on Forgejo
2. Click **Use this template**
3. Replace `PROJECT_NAME` placeholders in the `k8s/` manifests with your app name
4. Push to main

### From the CLI

```bash
op app create --org myorg --name myapp
```

Woodpecker automatically picks up the new repository, builds it, provisions a database and S3 bucket, and deploys. The app goes live at `https://{appname}.{domain}`.

The template includes Next.js 15, PostgreSQL, S3/MinIO, Forgejo OAuth2 via better-auth, and four CI workflows (deploy, preview, preview-cleanup, reset).

## PR Preview Environments

Open a pull request against any app repository and an isolated preview environment auto-deploys:

- Separate namespace, database, and S3 bucket per PR
- URL: `https://pr-{N}-{repo}.{domain}`
- Protected by OAuth2-Proxy (requires Forgejo login to access)
- Seed data applied automatically
- Cleaned up when the PR is closed or merged

## CLI

The `op` CLI authenticates via Forgejo personal access token:

```bash
op login https://api.{domain} --token <forgejo-pat>
```

Config is saved to `~/.op/config.yaml`. Environment variables `OP_API_URL` and `FORGEJO_TOKEN` also work as an alternative to `op login`. Use `-k` for self-signed TLS deployments.

Common commands:

```
op status                                 # Platform health
op whoami                                 # Current user

op app list                               # Deployed apps
op app create --org O --name N            # Create from template
op app status org/repo                    # Deployment status
op app deploy org/repo                    # Trigger pipeline

op pr list org/repo                       # Pull requests
op pr create org/repo --title T --head B  # Create PR
op pr merge org/repo N                    # Merge PR

op pipeline list org/repo                 # CI pipelines
op pipeline logs org/repo N               # Pipeline logs

```

Full command reference: [docs/cli.md](cli.md)

## MCP for AI Agents

The MCP server exposes platform tools for AI-assisted development: repos, PRs, issues, pipelines, files, and more. Create a Forgejo personal access token and add this to your MCP client config (e.g., `~/.claude/.mcp.json`):

```json
{
  "mcpServers": {
    "open-platform": {
      "type": "streamable-http",
      "url": "https://api.{domain}/mcp",
      "headers": {
        "Authorization": "Bearer <your-forgejo-pat>"
      }
    }
  }
}
```

Replace `{domain}` with your platform domain and `<your-forgejo-pat>` with a valid token.

API documentation is available at `https://api.{domain}/swagger`.

Full tool catalog: [docs/mcp.md](mcp.md)

## Configuration Reference

`open-platform.yaml` is the single source of truth for platform configuration. All generated Helm values, manifests, secrets, and environment variables are derived from it.

Example configuration with all options:

```yaml
domain: yourdomain.com

# Optional: prefix for service subdomains (multi-tenant mode)
# service_prefix: myteam-

admin:
  username: opadmin
  email: admin@yourdomain.com

tls:
  # letsencrypt — real certs via cert-manager (recommended for public deployments)
  # selfsigned  — auto-generated CA (for local development)
  # cloudflare  — TLS at Cloudflare edge via tunnel
  mode: letsencrypt
  email: admin@yourdomain.com

# Optional: Cloudflare tunnel (only when tls.mode is cloudflare)
# cloudflare:
#   account_tag: ""
#   tunnel_id: ""
#   tunnel_secret: ""
```

See `open-platform.yaml.example` for the canonical reference.

## Make Targets

```bash
make deploy    # Full deploy — generate config, helmfile sync, OIDC setup, CI activation
make generate  # Regenerate config from open-platform.yaml without deploying
make diff      # Preview Helm changes without applying
make status    # Show Helm release status
make urls      # Print all service URLs
make teardown  # Destroy all resources (prompts for confirmation)
```
