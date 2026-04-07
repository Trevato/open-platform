import { Elysia, t } from "elysia";
import { randomBytes } from "crypto";
import { requireAdminPlugin } from "../auth.js";
import { ForgejoClient } from "../services/forgejo.js";
import {
  getPlatformApps,
  getWorkloadApps,
  PLATFORM_SERVICES,
  deleteNamespace,
  dropAppDatabase,
  deleteAppBucket,
  scaleDeployment,
  listNodes,
  labelNode,
  cordonNode,
  uncordonNode,
  deleteNode,
  getJoinToken,
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
      const apps = await getPlatformApps();
      const svcMap = new Map(PLATFORM_SERVICES.map((s) => [s.repo, s]));
      const services = apps.map((a) => ({
        name: a.repo,
        namespace: a.namespace,
        ready: a.status === "running",
        replicas: { ready: a.replicas.ready, total: a.replicas.total },
        url: a.url,
        subdomain: svcMap.get(a.repo)?.subdomain || "",
      }));
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
      const [platformApps, deployedApps, orgs] = await Promise.all([
        getPlatformApps(),
        getWorkloadApps(),
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

      // Build set of archived repo keys to filter from main list
      const archivedKeys = new Set(
        allRepos
          .filter((repo) => repo.archived)
          .map((repo) => `${repo.owner.login}/${repo.name}`),
      );

      // Filter archived apps OUT of deployed apps
      const activeApps = deployedApps.filter(
        (a) => !archivedKeys.has(`${a.org}/${a.repo}`),
      );

      // Enrich archived apps with K8s status
      const archivedApps = allRepos
        .filter((repo) => repo.archived)
        .map((repo) => {
          const key = `${repo.owner.login}/${repo.name}`;
          const deployed = deployedApps.find(
            (a) => `${a.org}/${a.repo}` === key,
          );
          return {
            org: repo.owner.login,
            repo: repo.name,
            namespace: `op-${repo.owner.login}-${repo.name}`,
            archived_at: repo.updated_at,
            status: deployed?.status || "stopped",
            replicas: deployed?.replicas || { ready: 0, desired: 0, total: 0 },
            url: deployed?.url || "",
          };
        });

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

      return {
        apps: [...platformApps, ...activeApps, ...pendingApps],
        archivedApps,
        orgs,
      };
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
        const activated = await woodpecker.activateRepo(
          repo.id,
          `${body.org}/${body.name}`,
        );
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

      // No need to deactivate Woodpecker — archived repos are read-only in Forgejo,
      // so no pushes = no webhook triggers. Keeping the Woodpecker record allows restore.

      // If no Forgejo repo, clean up orphaned K8s-only app entirely
      if (!repoFound) {
        try {
          await deleteNamespace(`op-${org}-${repo}`);
        } catch {}
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
          const activated = await woodpecker.activateRepo(
            forgejoRepo.id,
            `${org}/${repo}`,
          );
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

  // POST /apps/:org/:repo/stop — scale deployment to 0
  .post(
    "/apps/:org/:repo/stop",
    async ({ params, set }) => {
      try {
        await scaleDeployment(`op-${params.org}-${params.repo}`, 0);
        return { stopped: true };
      } catch {
        set.status = 404;
        return { error: "No deployment found" };
      }
    },
    {
      params: t.Object({ org: t.String(), repo: t.String() }),
      detail: { tags: ["Platform"], summary: "Stop an app" },
    },
  )

  // POST /apps/:org/:repo/start — scale deployment to 1
  .post(
    "/apps/:org/:repo/start",
    async ({ params, set }) => {
      try {
        await scaleDeployment(`op-${params.org}-${params.repo}`, 1);
        return { started: true };
      } catch {
        set.status = 404;
        return { error: "No deployment found" };
      }
    },
    {
      params: t.Object({ org: t.String(), repo: t.String() }),
      detail: { tags: ["Platform"], summary: "Start an app" },
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

      const errors: string[] = [];
      const namespace = `op-${org}-${repo}`;

      // Deactivate Woodpecker
      try {
        const woodpecker = new WoodpeckerClient();
        const wpRepo = await woodpecker.lookupRepo(`${org}/${repo}`);
        if (wpRepo) await woodpecker.deleteRepo(wpRepo.id);
      } catch (e) {
        errors.push(
          `woodpecker: ${e instanceof Error ? e.message : String(e)}`,
        );
      }

      // Delete namespace (cascades deployments, services, ingresses)
      try {
        await deleteNamespace(namespace);
      } catch (e) {
        errors.push(`namespace: ${e instanceof Error ? e.message : String(e)}`);
      }

      // Drop database and user
      try {
        await dropAppDatabase(org, repo);
      } catch (e) {
        errors.push(`database: ${e instanceof Error ? e.message : String(e)}`);
      }

      // Remove S3 bucket
      try {
        await deleteAppBucket(org, repo);
      } catch (e) {
        errors.push(`bucket: ${e instanceof Error ? e.message : String(e)}`);
      }

      return { deleted: true, ...(errors.length > 0 ? { errors } : {}) };
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
  )

  // GET /nodes — list all cluster nodes
  .get(
    "/nodes",
    async () => {
      const nodes = await listNodes();
      return { nodes };
    },
    {
      detail: { tags: ["Platform"], summary: "List cluster nodes" },
    },
  )

  // GET /nodes/join-token — get k3s join token (must precede /:name routes)
  .get(
    "/nodes/join-token",
    async () => {
      const result = await getJoinToken();
      if (!result)
        return {
          error: "Join token not available (not running on server node)",
        };
      return result;
    },
    {
      detail: { tags: ["Platform"], summary: "Get k3s join token" },
    },
  )

  // PATCH /nodes/:name — update node labels
  .patch(
    "/nodes/:name",
    async ({ params, body }) => {
      await labelNode(params.name, body.labels);
      return { updated: true };
    },
    {
      params: t.Object({ name: t.String() }),
      body: t.Object({
        labels: t.Record(t.String(), t.Union([t.String(), t.Null()])),
      }),
      detail: { tags: ["Platform"], summary: "Update node labels" },
    },
  )

  // POST /nodes/:name/cordon — mark node unschedulable
  .post(
    "/nodes/:name/cordon",
    async ({ params }) => {
      await cordonNode(params.name);
      return { cordoned: true };
    },
    {
      params: t.Object({ name: t.String() }),
      detail: { tags: ["Platform"], summary: "Cordon a node" },
    },
  )

  // POST /nodes/:name/uncordon — mark node schedulable
  .post(
    "/nodes/:name/uncordon",
    async ({ params }) => {
      await uncordonNode(params.name);
      return { uncordoned: true };
    },
    {
      params: t.Object({ name: t.String() }),
      detail: { tags: ["Platform"], summary: "Uncordon a node" },
    },
  )

  // DELETE /nodes/:name — remove node from cluster
  .delete(
    "/nodes/:name",
    async ({ params }) => {
      await deleteNode(params.name);
      return { deleted: true };
    },
    {
      params: t.Object({ name: t.String() }),
      detail: { tags: ["Platform"], summary: "Remove node from cluster" },
    },
  );
