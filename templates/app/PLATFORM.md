# PROJECT_NAME

Built on [Open Platform](https://forgejo.product-garden.com/system/open-platform).

## Quick Start

1. Replace all `PROJECT_NAME` placeholders with your app name
2. Push to `main` — OAuth2 app and secrets are auto-created by the platform

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@postgres-rw.postgres.svc.cluster.local:5432/PROJECT_NAME` |
| `S3_ENDPOINT` | MinIO S3 API endpoint | `http://minio.minio.svc:9000` |
| `S3_BUCKET` | S3 bucket name | `PROJECT_NAME` |
| `S3_ACCESS_KEY` | MinIO access key | |
| `S3_SECRET_KEY` | MinIO secret key | |
| `BETTER_AUTH_SECRET` | Session encryption key | (auto-generated, stored in K8s secret) |
| `BETTER_AUTH_URL` | Public app URL (canonical) | `https://PROJECT_NAME.product-garden.com` |
| `AUTH_FORGEJO_ID` | Forgejo OAuth2 client ID | (auto-generated) |
| `AUTH_FORGEJO_SECRET` | Forgejo OAuth2 client secret | (auto-generated) |
| `AUTH_FORGEJO_URL` | Forgejo URL for browser-facing OAuth redirects | `https://forgejo.product-garden.com` |
| `AUTH_FORGEJO_INTERNAL_URL` | Forgejo URL for server-side token exchange | `https://forgejo.dev.test` |
| `NODE_EXTRA_CA_CERTS` | Path to platform CA cert (auto-mounted) | `/etc/ssl/custom/ca.crt` |

### Dual-Domain Auth

Apps use a split URL pattern for Forgejo OAuth2:
- **Browser-facing** (`AUTH_FORGEJO_URL`): `https://forgejo.product-garden.com` — where browsers redirect for login
- **Server-side** (`AUTH_FORGEJO_INTERNAL_URL`): `https://forgejo.dev.test` — for token exchange and user info (pod-to-pod via CoreDNS, avoids Cloudflare hairpin)

Both are set in `k8s/deployment.yaml` and consumed by `src/auth.ts`.

## CI/CD

Woodpecker pipelines in `.woodpecker/`:

| Workflow | Trigger | Steps |
|----------|---------|-------|
| `deploy.yml` | Push to `main` | Kaniko build, push to Forgejo registry, provision, apply schema, deploy |
| `preview.yml` | Pull request | Build, provision preview DB/bucket, schema, seed, deploy preview, comment URL |
| `preview-cleanup.yml` | PR closed | Delete preview deployment, DB, bucket |
| `reset.yml` | Manual | Wipe and re-seed preview data |

### Secrets

Org-level secrets (`registry_username`, `registry_token`) are set automatically at the `system` org level and inherited by all repos. No per-repo secret configuration needed.

## Database

- **Host**: `postgres-rw.postgres.svc.cluster.local:5432`
- **Provider**: CNPG (CloudNativePG)
- **Schema management**: `schema.sql` applied via `psql` in the deploy pipeline. No ORM -- use `pg` directly.
- **Seed data**: Place SQL files in `seed/sql/` and CSV/JSON in `seed/data/`.
- **Auth tables**: better-auth requires `user`, `session`, `account`, and `verification` tables (included in schema.sql).

## Storage

- **Endpoint**: `http://minio.minio.svc:9000` (internal), `https://s3.dev.test` (external)
- **Client**: `@aws-sdk/client-s3` with `forcePathStyle: true`

```typescript
import { S3Client } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
  },
});
```

## Auth

Forgejo OAuth2 via [better-auth](https://better-auth.com) with the `genericOAuth` plugin.

Sessions are stored in the database (not JWT). The `user`, `session`, `account`, and `verification` tables in `schema.sql` are managed by better-auth.

OAuth2 apps are auto-created by the platform during bootstrap (`setup-oauth2.sh`). Redirect URIs cover both domains:
- `https://PROJECT_NAME.dev.test/api/auth/oauth2/callback/forgejo`
- `https://PROJECT_NAME.product-garden.com/api/auth/oauth2/callback/forgejo`

### Session access

Server components:
```typescript
import { auth } from "@/auth";
import { headers } from "next/headers";

const session = await auth.api.getSession({ headers: await headers() });
```

Client components:
```typescript
import { authClient } from "@/lib/auth-client";

const { data: session } = authClient.useSession();
```

## Project Setup

1. **Create from template** -- generate a new repo from `system/template` on Forgejo
2. **Replace `PROJECT_NAME`** -- in `package.json`, `k8s/`, and this file
3. **Push to `main`** -- triggers the deploy pipeline. OAuth2 app, secrets, and CI are all automatic.

## Project Structure

```
src/              Application source (Next.js App Router)
k8s/              Kubernetes manifests (deployment, service, ingress)
.woodpecker/      CI/CD pipelines
schema.sql        Database schema (applied via psql)
seed/             Seed data (sql/ and data/)
public/           Static assets
```
