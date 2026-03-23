# PROJECT_NAME

Next.js 15 App Router on Open Platform. See @PLATFORM.md for env vars and infrastructure.

## Commands

- `npm run dev` — local dev server
- `npm run typecheck` — TypeScript check (runs in CI, must pass)
- `npm run build` — production build

## Stack

- **Framework**: Next.js 15 (App Router), React 19, TypeScript (strict)
- **Database**: PostgreSQL via `pg` (no ORM). Connection: `src/lib/db.ts`
- **Auth**: Forgejo OAuth2 via better-auth. Config: `src/auth.ts`
- **Storage**: MinIO S3 via `@aws-sdk/client-s3`. Client: `src/lib/s3.ts`

## Conventions

- `src/lib/db.ts` exports `pool` as **default export** — import as `import db from "@/lib/db"`
- `src/lib/s3.ts` exports `s3` as **default export** — import as `import s3 from "@/lib/s3"`
- `src/auth.ts` exports `auth` as **named export** — import as `import { auth } from "@/auth"`
- `src/lib/auth-client.ts` exports `authClient` as **named export**
- Path alias: `@/*` maps to `./src/*`
- Schema: `schema.sql` (applied via psql in CI). Auth tables (user, session, account, verification) are managed by better-auth — do not modify their column names.
- Seed data: `seed/sql/*.sql` (applied once on first deploy)
- Session: 30-day expiry with daily sliding window, 5-min cookie cache. Cookie prefix derived from app hostname. See `src/auth.ts`.

## Quality

- Run `npm run typecheck` before committing. Fix all errors.
- Server components: use `import { headers } from "next/headers"` for session access
- All database queries use parameterized queries (`$1`, `$2`, etc.) — never string interpolation
