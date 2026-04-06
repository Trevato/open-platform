# PROJECT_NAME

Next.js 15 App Router on Open Platform. See @PLATFORM.md for env vars and infrastructure.

## Commands

- `npm run dev` -- local dev server
- `npm run typecheck` -- TypeScript check (runs in CI, must pass)
- `npm run build` -- production build
- `bun test` -- run tests

## Stack

- **Framework**: Next.js 15 (App Router), React 19, TypeScript (strict)
- **Database**: PostgreSQL via `pg` (no ORM). Connection: `src/lib/db.ts`
- **Auth**: Forgejo OAuth2 via better-auth. Config: `src/auth.ts`
- **Storage**: MinIO S3 via `@aws-sdk/client-s3`. Client: `src/lib/s3.ts`

## Conventions

- `src/lib/db.ts` exports `pool` as **default export** -- import as `import db from "@/lib/db"`
- `src/lib/s3.ts` exports `s3` as **default export** -- import as `import s3 from "@/lib/s3"`
- `src/auth.ts` exports `auth` as **named export** -- import as `import { auth } from "@/auth"`
- `src/lib/auth-client.ts` exports `authClient` as **named export**
- `src/lib/forgejo.ts` exports `forgejoFetch` as **named export** -- call Forgejo API on behalf of signed-in user
- Path alias: `@/*` maps to `./src/*`
- Schema: `schema.sql` (applied via psql in CI). Auth tables (user, session, account, verification) are managed by better-auth -- do not modify their column names.
- Seed data: `seed/sql/*.sql` (applied once on first deploy)
- Session: 30-day expiry with daily sliding window, 5-min cookie cache. Cookie prefix derived from app hostname.

## Schemas (Zod)

`src/lib/schemas.ts` is the single source of truth for types and validation. Shared by client and server.

- `EntitySchema` -- full row shape. Derive the type: `type Entity = z.infer<typeof EntitySchema>`
- `CreateEntitySchema` -- creation input with `.min()`, `.max()`, custom `message` strings
- `UpdateEntitySchema` -- partial update, typically `CreateEntitySchema.partial()`
- DB query results use type assertion (`as Entity`), not runtime `.parse()`

## API Envelope

Helpers in `src/lib/api.ts`:

- **List**: `{ data: T[], meta: { total, limit, offset } }` -- use `paginated(rows, { total, limit, offset })`
- **Single**: `{ data: T }` -- use `single(row)`
- **Error**: `{ error: { code, message } }` -- use `error(message, code, status)`

## Feature Flags

`src/flags.ts` is the single source of truth for feature flags. Uses the `flags` SDK with Forgejo RBAC.

- **Define flags**: `flag<boolean, FlagEntities>({ key, identify, decide, defaultValue })`
- **Use in Server Components**: `const enabled = await myFlag()`
- **Use in Client Components**: pass resolved value as prop from server parent
- **Identity**: `identify()` resolves session + Forgejo org membership per request
- **Targeting**: `decide()` evaluates against environment, orgs, user. See `/toggle-flag` skill for patterns.
- **Env**: `DEPLOY_ENV` (production/preview/development), `FLAGS_SECRET` (override cookie encryption)

## Skills

Agent skills in `.claude/skills/`. Use these when the task matches:

- `/add-entity` -- Add a new database entity (schema, Zod, routes, pages, tests)
- `/toggle-flag` -- Add, modify, or remove feature flags
- `/open-pr` -- Create branch, run checks, push, open PR
- `/fix-pipeline` -- Diagnose and fix failing CI pipelines
- `/review-pr` -- Review a PR against the project checklist
- `/implement-issue` -- End-to-end: read issue, plan, implement, test, open PR

## MCP Tools

You have access to the Open Platform MCP server with tools for git operations, CI/CD, and deployment. Use MCP tools for: creating branches, opening PRs, checking pipeline status, reading files from repos, managing issues.

## Quality

- `npm run typecheck` before committing -- zero errors
- `bun test` before committing -- all tests pass
- New code must have tests (see `src/__tests__/posts-api.test.ts` for the pattern)
- All database queries use parameterized queries (`$1`, `$2`) -- never string interpolation
- No `author_id` leakage in API responses -- JOIN for author name, never return the raw ID
- Session access: `auth.api.getSession({ headers: await headers() })`
- Next.js 15: `params` and `searchParams` are Promises -- await them

## Workflow

- Create a branch for each change: `git checkout -b feat/description`
- Open a PR against `main` -- this triggers a preview environment at `pr-N-{app}.{domain}`
- Reference issues: `Closes #N` in PR descriptions
- Keep PRs focused -- one feature or fix per PR
- Merge PRs via Forgejo (direct push to main is blocked)
