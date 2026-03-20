# Multi-Agent Development Workflow

Documented from the Foundry experiment: 6 agents (nova, orbit, nebula, atlas, prism, forge) across 2 teams building 2 apps in parallel using real Forgejo workflows.

## Organization Pattern

- **Org**: `foundry` with a `developers` team (write access, `includes_all_repositories: true`)
- **Repos**: `foundry/pulse` (discussion platform), `foundry/craft` (code snippet sharing)
- **Users**: One Forgejo account per agent (e.g., `nova` / `novaPass1234`). Avoids `!` in passwords (JSON escape issues).
- **Project board**: "Foundry v1" — Forgejo projects are web UI only (no API), created via Playwright
- **Labels**: `feature`, `bug`, `foundation`, `ui`, `integration`, `priority:high`, `priority:medium`
- **Milestones**: `v1.0 — Foundation`, `v1.1 — Features`, `v2.0 — Integration`

## Team Structure

Each app has 3 agents with distinct roles:

1. **Foundation agent** (nova/atlas): Schema + API routes. Works first, others depend on output.
2. **Pages agent** (orbit/prism): Server components, layouts, core UI pages.
3. **Interactions agent** (nebula/forge): Client components, forms, supplementary endpoints.

## Development Phases

- **Phase 1**: Foundation agents build API routes (2 agents in parallel, one per app)
- **Phase 2**: Feature agents build UI (4 agents in parallel, 2 per app)
- **Phase 3**: Polish + cross-app features (6 agents in parallel, one issue each)
- **Phase 4+**: Integration, new features, perpetual iteration

## Agent Workflow (per agent)

1. Clone repo from Forgejo (admin credentials via `GIT_ASKPASS`, `GIT_SSL_NO_VERIFY=1`)
2. Create feature branch from main
3. Read existing code to understand patterns
4. Implement changes (only NEW files where possible to avoid merge conflicts)
5. Commit with agent identity (`git -c user.name="nova" -c user.email="nova@foundry.dev"`)
6. Push branch, create PR via Forgejo API (using agent's own credentials)
7. Comment on assigned issues with PR reference

## Manager Responsibilities

- Create issues with detailed specs and clear file boundaries
- Review PRs (approve via API)
- Merge PRs in correct dependency order (foundation → pages → interactions)
- Monitor Woodpecker pipelines between phases
- Move project board items
- Create new issues/milestones as work completes

## Conflict Avoidance Strategy

Each agent works on **non-overlapping files**. Within the same phase:

- Foundation agent: `src/app/api/**` (API routes only)
- Pages agent: `src/app/page.tsx`, `src/app/*/page.tsx`, `src/app/components/{page-components}.tsx`, `src/app/layout.tsx`
- Interactions agent: `src/app/{feature}/page.tsx` (NEW pages only), `src/app/api/{supplementary}/route.ts`, `src/app/components/{form-components}.tsx`

## Key Learnings

- **File isolation is critical**: Agents working on different files = clean merges. Same file = merge conflicts.
- **Foundation-first ordering**: API routes must merge before UI agents start, so pages can call real endpoints.
- **Wait for pipelines**: Always verify deploy pipeline succeeds before launching dependent agents.
- **Sculptor agents work well**: Each agent cloned, read existing code, implemented, and pushed autonomously.
- **PR merge ordering matters**: Within a phase, merge the "broader" PR first (pages before interactions) to minimize conflicts.
- **6 agents x 3 phases = 14 PRs merged**: Each PR took ~2-5 minutes of agent work plus ~4 minutes of CI pipeline time.
- **Total pipeline count**: ~20 pipelines per repo across the experiment (push events, PR events, manual triggers).

## Forgejo Org Setup Checklist

1. Create user accounts (one per agent)
2. Create org
3. Create team with `units` + `includes_all_repositories: true`
4. Add all agents to team
5. Create repos, push scaffolds with app-specific schemas
6. Create OAuth2 apps + K8s auth secrets per app
7. Copy minio-credentials, forgejo-registry to app namespaces
8. Activate repos in Woodpecker, create org CI secrets
9. Trigger initial deploy pipelines
10. Create labels, milestones, issues
11. Create project board via Playwright
