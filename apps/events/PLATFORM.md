# events

Event planning and RSVP platform built on [Open Platform](https://forgejo.dev.test/system/open-platform).

## Features

- Create events with title, description, date, time, location, and optional cover image
- RSVP to events (Going / Maybe / Can't Go) with upsert behavior
- View attendee lists grouped by RSVP status
- Upcoming events sorted by date (soonest first)
- Past events section (collapsed by default)
- Public viewing, auth-gated creation and RSVP
- Optional max attendees with capacity enforcement

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@postgres-rw.postgres.svc.cluster.local:5432/events` |
| `S3_ENDPOINT` | MinIO S3 API endpoint | `http://minio.minio.svc:9000` |
| `S3_BUCKET` | S3 bucket name | `events` |
| `S3_ACCESS_KEY` | MinIO access key | |
| `S3_SECRET_KEY` | MinIO secret key | |
| `BETTER_AUTH_SECRET` | Session encryption key | (generate with `openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | Public app URL | `https://events.dev.test` |
| `AUTH_FORGEJO_ID` | Forgejo OAuth2 client ID | |
| `AUTH_FORGEJO_SECRET` | Forgejo OAuth2 client secret | |
| `NODE_EXTRA_CA_CERTS` | Path to platform CA cert (auto-mounted) | `/etc/ssl/custom/ca.crt` |

## API Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/events` | Public | List all events (upcoming first, then past) |
| POST | `/api/events` | Required | Create an event |
| GET | `/api/events/[id]` | Public | Get event with RSVPs |
| DELETE | `/api/events/[id]` | Organizer | Delete an event |
| POST | `/api/events/[id]/rsvp` | Required | Set RSVP status (upsert) |
| DELETE | `/api/events/[id]/rsvp` | Required | Remove RSVP |

## CI/CD

Woodpecker pipelines in `.woodpecker/`:

| Workflow | Trigger | Steps |
|----------|---------|-------|
| `deploy.yml` | Push to `main` | Kaniko build, push to Forgejo registry, provision, apply schema, deploy |
| `preview.yml` | Pull request | Build, provision preview DB/bucket, schema, seed, deploy preview, comment URL |
| `preview-cleanup.yml` | PR closed | Delete preview deployment, DB, bucket |
| `reset.yml` | Manual | Wipe and re-seed preview data |

## Project Structure

```
src/              Application source (Next.js App Router)
k8s/              Kubernetes manifests (deployment, service, ingress)
.woodpecker/      CI/CD pipelines
schema.sql        Database schema (applied via psql)
seed/             Seed data (sql/)
public/           Static assets
```
