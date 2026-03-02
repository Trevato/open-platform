# PROJECT_NAME

Built on [Open Platform](https://forgejo.dev.test/system/open-platform).

## Quick Start

1. Replace all `PROJECT_NAME` placeholders with your app name
2. Create a Forgejo OAuth2 app (see [Auth](#auth))
3. Add Woodpecker secrets (see [CI/CD](#cicd))
4. Push to `main`

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@postgres-rw.postgres.svc.cluster.local:5432/PROJECT_NAME` |
| `S3_ENDPOINT` | MinIO S3 API endpoint | `http://minio.minio.svc:9000` |
| `S3_PUBLIC_URL` | Public S3 URL for browser access | `https://s3.dev.test` |
| `S3_BUCKET` | S3 bucket name | `PROJECT_NAME` |
| `S3_ACCESS_KEY` | MinIO access key | |
| `S3_SECRET_KEY` | MinIO secret key | |
| `BETTER_AUTH_SECRET` | better-auth session secret | (generate with `openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | Public app URL | `https://PROJECT_NAME.dev.test` |
| `AUTH_FORGEJO_ID` | Forgejo OAuth2 client ID | |
| `AUTH_FORGEJO_SECRET` | Forgejo OAuth2 client secret | |
| `NODE_EXTRA_CA_CERTS` | Path to platform CA cert | `/etc/ssl/custom/ca.crt` |

## CI/CD

Woodpecker pipelines in `.woodpecker/`:

| Workflow | Trigger | Steps |
|----------|---------|-------|
| `deploy.yml` | Push to `main` | Kaniko build, push to Forgejo registry, provision DB/S3, apply schema, deploy |
| `preview.yml` | Pull request | Build preview image, provision isolated DB/S3/OAuth2, deploy preview, comment URL |
| `preview-cleanup.yml` | PR closed/merged | Delete preview deployment, DB, S3 bucket, OAuth2 app |

### Preview Environments

Every PR gets an isolated preview at `pr-{N}-PROJECT_NAME.dev.test` with:
- Dedicated PostgreSQL database
- Dedicated MinIO bucket (public read)
- Dedicated Forgejo OAuth2 app (correct redirect URI)
- Protected by oauth2-proxy (Forgejo login required)

Seed data runs only on first DB creation. Close and reopen the PR to reset.

## Database

- **Host**: `postgres-rw.postgres.svc.cluster.local:5432`
- **Provider**: CNPG (CloudNativePG)
- **Schema management**: `schema.sql` applied via `psql` in the deploy pipeline. No ORM -- use `pg` directly.
- **Seed data**: Place SQL files in `seed/sql/` and CSV/JSON in `seed/data/`.

## Storage

- **Endpoint**: `http://minio.minio.svc:9000` (internal), `https://s3.dev.test` (external)
- **Client**: `@aws-sdk/client-s3` with `forcePathStyle: true`
- **Public access**: Buckets get `mc anonymous set download` for browser-accessible images

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

Forgejo OAuth2 via [better-auth](https://www.better-auth.com/) with the `genericOAuth` plugin.

- **Session storage**: PostgreSQL (better-auth tables in `schema.sql`)
- **PKCE**: Enabled for secure OAuth2 flow
- **Callback URL**: `https://PROJECT_NAME.dev.test/api/auth/oauth2/callback/forgejo`

### Setup

1. Create a Forgejo OAuth2 app with redirect URL: `https://PROJECT_NAME.dev.test/api/auth/oauth2/callback/forgejo`
2. Set `AUTH_FORGEJO_ID` and `AUTH_FORGEJO_SECRET` in your environment / Woodpecker secrets

## Project Setup

1. **Create from template** -- generate a new repo from `system/template` on Forgejo
2. **Replace `PROJECT_NAME`** -- in `package.json`, `k8s/`, and this file
3. **Create OAuth2 app** -- in Forgejo with redirect URL `https://PROJECT_NAME.dev.test/api/auth/oauth2/callback/forgejo`
4. **Add Woodpecker secrets** -- in repo settings at `ci.dev.test`:
   - `registry_username` -- your Forgejo username
   - `registry_token` -- Forgejo personal access token with `write:packages` scope
5. **Push to `main`** -- triggers the deploy pipeline

## Project Structure

```
src/              Application source (Next.js App Router)
k8s/              Kubernetes manifests (deployment, service, ingress)
.woodpecker/      CI/CD pipelines
schema.sql        Database schema (applied via psql)
seed/             Seed data (sql/ and data/)
public/           Static assets
```
