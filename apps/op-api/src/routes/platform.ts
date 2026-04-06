import { Elysia, t } from "elysia";
import { randomBytes } from "crypto";
import { requireAdminPlugin } from "../auth.js";
import { ForgejoClient } from "../services/forgejo.js";
import {
  getServiceStatuses,
  getApps,
  deleteNamespace,
  dropAppDatabase,
  deleteAppBucket,
} from "../services/k8s.js";
import { PlatformConfigService } from "../services/platform-config.js";
import { WoodpeckerClient } from "../services/woodpecker.js";

const FORGEJO_URL =
  process.env.FORGEJO_INTERNAL_URL || process.env.FORGEJO_URL || "";

export const platformPlugin = new Elysia({ prefix: "/platform" })
  .use(requireAdminPlugin)

  // GET /services — platform service health
  .get(
    "/services",
    async () => {
      const services = await getServiceStatuses();
      return { services };
    },
    {
      detail: { tags: ["Platform"], summary: "List platform service health" },
    },
  )

  // GET /users — list all Forgejo users (admin API)
  .get(
    "/users",
    async ({ user }) => {
      const users: unknown[] = [];
      let page = 1;
      while (true) {
        const resp = await fetch(
          `${FORGEJO_URL}/api/v1/admin/users?limit=50&page=${page}`,
          {
            headers: {
              Authorization: `token ${user.token}`,
              Accept: "application/json",
            },
          },
        );
        if (!resp.ok) {
          const body = await resp.text();
          throw new Error(`Forgejo API ${resp.status}: ${body}`);
        }
        const batch = await resp.json();
        if (!Array.isArray(batch) || batch.length === 0) break;
        users.push(...batch);
        if (batch.length < 50) break;
        page++;
      }
      return { users };
    },
    {
      detail: { tags: ["Platform"], summary: "List Forgejo users" },
    },
  )

  // POST /users — create a Forgejo user
  .post(
    "/users",
    async ({ body, user, set }) => {
      const initialPassword = randomBytes(16).toString("hex");

      const resp = await fetch(`${FORGEJO_URL}/api/v1/admin/users`, {
        method: "POST",
        headers: {
          Authorization: `token ${user.token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          username: body.username,
          email: body.email,
          password: body.password || initialPassword,
          must_change_password: true,
        }),
      });
      if (!resp.ok) {
        const respBody = await resp.text();
        throw new Error(`Forgejo API ${resp.status}: ${respBody}`);
      }
      const created = await resp.json();
      set.status = 201;
      return { user: created, initialPassword };
    },
    {
      body: t.Object({
        username: t.String({ minLength: 1 }),
        email: t.String({ minLength: 1 }),
        password: t.Optional(t.String()),
      }),
      detail: { tags: ["Platform"], summary: "Create Forgejo user" },
    },
  )

  // GET /apps — list deployed apps and orgs (includes undeployed repos as pending)
  .get(
    "/apps",
    async ({ user }) => {
      const client = new ForgejoClient(user.token);
      const [deployedApps, orgs] = await Promise.all([
        getApps(),
        client.listOrgs(),
      ]);

      // Infrastructure repos that should never appear in the apps list
      const INFRA_REPOS = new Set([
        "console",
        "op-api",
        "open-platform",
        "template",
      ]);

      // Build a set of deployed app keys for fast lookup
      const deployedKeys = new Set(
        deployedApps.map((a) => `${a.org}/${a.repo}`),
      );

      // Fetch repos from all orgs to find undeployed apps
      const orgRepoLists = await Promise.all(
        orgs.map(async (org) => {
          try {
            return await client.listRepos(org.name);
          } catch {
            return [];
          }
        }),
      );

      const allRepos = orgRepoLists
        .flat()
        .filter((repo) => !repo.template && !INFRA_REPOS.has(repo.name));

      const archivedApps = allRepos
        .filter((repo) => repo.archived)
        .map((repo) => ({
          org: repo.owner.login,
          repo: repo.name,
          namespace: `op-${repo.owner.login}-${repo.name}`,
          archived_at: repo.updated_at,
        }));

      const pendingApps = allRepos
        .filter(
          (repo) =>
            !repo.archived &&
            !deployedKeys.has(`${repo.owner.login}/${repo.name}`),
        )
        .map((repo) => ({
          org: repo.owner.login,
          repo: repo.name,
          namespace: `op-${repo.owner.login}-${repo.name}`,
          ready: false,
          status: "pending" as const,
          replicas: { ready: 0, desired: 0, total: 0 },
          url: "",
        }));

      // Check Woodpecker for running pipelines on pending apps
      const woodpecker = new WoodpeckerClient();
      await Promise.all(
        pendingApps.map(async (app) => {
          try {
            const wpRepo = await woodpecker.lookupRepo(
              `${app.org}/${app.repo}`,
            );
            if (!wpRepo) return;
            const pipelines = await woodpecker.listPipelines(wpRepo.id, 1);
            if (pipelines.length > 0) {
              const latest = pipelines[0];
              if (latest.status === "running" || latest.status === "pending") {
                (app as { status: string }).status = "deploying";
              }
            }
          } catch {
            // Keep as pending if lookup fails
          }
        }),
      );

      return { apps: [...deployedApps, ...pendingApps], archivedApps, orgs };
    },
    {
      detail: { tags: ["Platform"], summary: "List deployed apps and orgs" },
    },
  )

  // POST /apps — create app from system template
  .post(
    "/apps",
    async ({ body, user, set }) => {
      const client = new ForgejoClient(user.token);
      const repo = await client.generateFromTemplate("system", "template", {
        owner: body.org,
        name: body.name,
        description: body.description,
      });

      let pipeline = null;
      let activationError: string | undefined;
      try {
        const woodpecker = new WoodpeckerClient();
        const activated = await woodpecker.activateRepo(repo.id);
        pipeline = await woodpecker.triggerPipeline(activated.id);
      } catch (err) {
        activationError =
          err instanceof Error ? err.message : "Woodpecker activation failed";
      }

      set.status = 201;
      return {
        repo,
        pipeline,
        ...(activationError ? { error: activationError } : {}),
      };
    },
    {
      body: t.Object({
        org: t.String({ minLength: 1 }),
        name: t.String({ minLength: 1 }),
        description: t.Optional(t.String()),
      }),
      detail: { tags: ["Platform"], summary: "Create app from template" },
    },
  )

  // POST /apps/:org/:repo/archive — soft delete (archive)
  .post(
    "/apps/:org/:repo/archive",
    async ({ params, user }) => {
      const { org, repo } = params;
      const client = new ForgejoClient(user.token);
      const repoFound = await client.archiveRepo(org, repo);

      // Best-effort: deactivate Woodpecker
      try {
        const woodpecker = new WoodpeckerClient();
        const wpRepo = await woodpecker.lookupRepo(`${org}/${repo}`);
        if (wpRepo) await woodpecker.deleteRepo(wpRepo.id);
      } catch {}

      // Delete namespace (always — cleans up orphaned K8s-only apps)
      try {
        await deleteNamespace(`op-${org}-${repo}`);
      } catch {}

      // If no Forgejo repo, also clean up DB and S3 (orphaned app — full cleanup)
      if (!repoFound) {
        try {
          await dropAppDatabase(org, repo);
        } catch {}
        try {
          await deleteAppBucket(org, repo);
        } catch {}
      }

      return { archived: true };
    },
    {
      params: t.Object({ org: t.String(), repo: t.String() }),
      detail: { tags: ["Platform"], summary: "Archive an app" },
    },
  )

  // POST /apps/:org/:repo/restore — unarchive
  .post(
    "/apps/:org/:repo/restore",
    async ({ params, user }) => {
      const { org, repo } = params;
      const client = new ForgejoClient(user.token);
      await client.unarchiveRepo(org, repo);

      // Best-effort: reactivate Woodpecker and trigger deploy
      try {
        const woodpecker = new WoodpeckerClient();
        const forgejoRepo = await client.getRepo(org, repo);
        if (forgejoRepo) {
          const activated = await woodpecker.activateRepo(forgejoRepo.id);
          await woodpecker.triggerPipeline(activated.id);
        }
      } catch {}

      return { restored: true };
    },
    {
      params: t.Object({ org: t.String(), repo: t.String() }),
      detail: { tags: ["Platform"], summary: "Restore an archived app" },
    },
  )

  // DELETE /apps/:org/:repo — permanent delete (must be archived first)
  .delete(
    "/apps/:org/:repo",
    async ({ params, user, set }) => {
      const { org, repo } = params;
      const client = new ForgejoClient(user.token);

      // Verify repo is archived before permanent deletion
      const forgejoRepo = await client.getRepo(org, repo);
      if (forgejoRepo && !forgejoRepo.archived) {
        set.status = 409;
        return { error: "App must be archived before permanent deletion" };
      }

      await client.deleteRepo(org, repo);

      // Best-effort: deactivate Woodpecker
      try {
        const woodpecker = new WoodpeckerClient();
        const wpRepo = await woodpecker.lookupRepo(`${org}/${repo}`);
        if (wpRepo) await woodpecker.deleteRepo(wpRepo.id);
      } catch {}

      // Best-effort: clean up all resources
      try {
        await deleteNamespace(`op-${org}-${repo}`);
      } catch {}
      try {
        await dropAppDatabase(org, repo);
      } catch {}
      try {
        await deleteAppBucket(org, repo);
      } catch {}

      return { deleted: true };
    },
    {
      params: t.Object({ org: t.String(), repo: t.String() }),
      detail: { tags: ["Platform"], summary: "Permanently delete an app" },
    },
  )

  // GET /config — read current platform configuration
  .get(
    "/config",
    async ({ user }) => {
      const configService = new PlatformConfigService(user.token);
      const config = await configService.getConfig();
      return { config };
    },
    {
      detail: { tags: ["Platform"], summary: "Read platform configuration" },
    },
  )

  // PATCH /config — update platform configuration
  .patch(
    "/config",
    async ({ body, user }) => {
      const configService = new PlatformConfigService(user.token);
      const result = await configService.updateConfig(body);
      return result;
    },
    {
      body: t.Object({
        tls: t.Optional(
          t.Object({
            mode: t.Optional(
              t.Union([
                t.Literal("selfsigned"),
                t.Literal("letsencrypt"),
                t.Literal("cloudflare"),
              ]),
            ),
          }),
        ),
        network: t.Optional(
          t.Object({
            mode: t.Optional(
              t.Union([t.Literal("host"), t.Literal("loadbalancer")]),
            ),
            traefikIp: t.Optional(t.String()),
            addressPool: t.Optional(t.String()),
            interface: t.Optional(t.String()),
          }),
        ),
        services: t.Optional(
          t.Object({
            jitsi: t.Optional(
              t.Object({
                enabled: t.Optional(t.Boolean()),
              }),
            ),
            zulip: t.Optional(
              t.Object({
                enabled: t.Optional(t.Boolean()),
              }),
            ),
            mailpit: t.Optional(
              t.Object({
                enabled: t.Optional(t.Boolean()),
              }),
            ),
            pgadmin: t.Optional(
              t.Object({
                enabled: t.Optional(t.Boolean()),
              }),
            ),
          }),
        ),
      }),
      detail: { tags: ["Platform"], summary: "Update platform configuration" },
    },
  );
