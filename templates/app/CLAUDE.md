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
- `src/lib/forgejo.ts` exports `forgejoFetch` as **named export** -- call Forgejo API on behalf of signed-in user
- Path alias: `@/*` maps to `./src/*`
- Schema: `schema.sql` (applied via psql in CI). Auth tables (user, session, account, verification) are managed by better-auth — do not modify their column names.
- Seed data: `seed/sql/*.sql` (applied once on first deploy)
- Session: 30-day expiry with daily sliding window, 5-min cookie cache. Cookie prefix derived from app hostname. See `src/auth.ts`.

## Schemas (Zod)

`src/lib/schemas.ts` is the single source of truth for types and validation. Shared by client (form validation) and server (API route validation).

- `EntitySchema` — full row shape. Derive the type: `type Entity = z.infer<typeof EntitySchema>`
- `CreateEntitySchema` — creation input with `.min()`, `.max()`, etc. and custom `message` strings
- `UpdateEntitySchema` — partial update, typically `CreateEntitySchema.partial()`
- DB query results use type assertion (`as Entity`), not runtime `.parse()` — the DB is trusted
- Import schemas in both `route.ts` (server) and form components (client) — zero duplication

## API Envelope

Standard response shapes. Helpers in `src/lib/api.ts`.

- **List**: `{ data: T[], meta: { total, limit, offset } }` — use `paginated(rows, { total, limit, offset })`
- **Single**: `{ data: T }` — use `single(row)`
- **Error**: `{ error: { code, message } }` — use `error(message, code, status)`

## Adding an Entity

1. Add table to `schema.sql` — UUID PK via `gen_random_uuid()`, `created_at`/`updated_at` timestamps, `author_id UUID REFERENCES "user"(id)`
2. Add Zod schemas to `src/lib/schemas.ts` — Row, Create, Update (see Schemas section above)
3. Add API routes: `src/app/api/{entity}/route.ts` (GET list with `?limit=&offset=&search=`, POST create) and `src/app/api/{entity}/[id]/route.ts` (GET, PATCH, DELETE)
4. Add pages: `src/app/{entity}/page.tsx` (list), `src/app/{entity}/[id]/page.tsx` (detail)
5. Use `paginated()`, `single()`, `error()` from `src/lib/api.ts` in all route handlers
6. Next.js 15: `searchParams` is a `Promise` in page components — `await` it before reading

## Workflow

- Create a branch for each change: `git checkout -b feat/description`
- Open a PR against `main` -- this triggers a preview environment at `pr-N-{app}.{domain}`
- Reference issues: `Closes #N` in PR descriptions
- Keep PRs focused -- one feature or fix per PR
- Run `npm run typecheck` before pushing
- Merge PRs via Forgejo (direct push to main is blocked)

## Quality

- Run `npm run typecheck` before committing. Fix all errors.
- Server components: use `import { headers } from "next/headers"` for session access
- All database queries use parameterized queries (`$1`, `$2`, etc.) — never string interpolation
