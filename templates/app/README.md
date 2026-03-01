# App

Built on [Open Platform](https://forgejo.dev.test/system/open-platform).

## Development

```bash
bun install
bun dev          # http://localhost:3000
```

## Commands

```bash
bun lint         # check formatting and lint rules
bun run typecheck # type check without emitting
bun test         # run tests
```

## Deployment

The app deploys automatically on push to `main` via Woodpecker CI:

1. **Build** — Kaniko builds the container image
2. **Push** — image pushed to `forgejo.dev.test/<owner>/<app>`
3. **Deploy** — `kubectl set image` updates the deployment

### First-time CI setup

Add these secrets in Woodpecker (ci.dev.test → repo settings → secrets):

| Secret | Value |
|--------|-------|
| `registry_username` | Your Forgejo username |
| `registry_token` | Forgejo personal access token with `write:packages` scope |

### Switching from whoami to your app

The default `k8s/deployment.yaml` uses `traefik/whoami` so the app works immediately without CI. Once your CI secrets are configured and the first deploy pipeline succeeds, update the deployment image:

```yaml
# k8s/deployment.yaml
image: forgejo.dev.test/<owner>/<app>:latest
```

Update the host in `k8s/ingress.yaml` to match your app:

```yaml
host: <app>.dev.test
```

## Project structure

```
src/              Application source
k8s/              Kubernetes manifests (deployment, service, ingress)
.woodpecker/      CI/CD pipelines (test on PR, deploy on merge)
Dockerfile        Container build
```
