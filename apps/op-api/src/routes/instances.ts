import { Elysia, t } from "elysia";
import { authPlugin } from "../auth.js";
import {
  listInstances,
  createInstance,
  getInstanceAccess,
  deleteInstance,
  getCredentials,
  resetCredentials,
  getKubeconfig,
  getEvents,
} from "../services/instance.js";
import {
  getInstanceServiceStatuses,
  getInstanceApps,
} from "../services/k8s.js";
import pool from "../services/db.js";
import {
  createInstanceDevPod,
  startInstanceDevPod,
  stopInstanceDevPod,
  deleteInstanceDevPod,
  getInstanceDevPodStatus,
  podName as toPodName,
  pvcName as toPvcName,
} from "../services/devpod.js";

const PLATFORM_DOMAIN = process.env.PLATFORM_DOMAIN || "";

/** Strip sensitive fields from instance objects returned in list/detail responses. */
function sanitize({
  admin_password,
  kubeconfig,
  cluster_ip,
  ...safe
}: Record<string, unknown>) {
  return safe;
}

function deriveInstanceLiveStatus(
  k8sStatus: { exists: boolean; replicas: number; readyReplicas: number },
  dbStatus: string,
): string {
  if (!k8sStatus.exists) return dbStatus;
  if (k8sStatus.replicas === 0) return "stopped";
  if (k8sStatus.readyReplicas > 0) return "running";
  return "starting";
}

export const instancesPlugin = new Elysia({ prefix: "/instances" })
  .use(authPlugin)

  // GET / — list instances (query: ?all=true for admin view)
  .get(
    "/",
    async ({ query, user }) => {
      const all = query.all === "true";
      const instances = await listInstances(user, all);
      return {
        instances: instances.map((i) =>
          sanitize(i as unknown as Record<string, unknown>),
        ),
      };
    },
    {
      query: t.Object({
        all: t.Optional(t.String()),
      }),
      detail: { tags: ["Instances"], summary: "List instances" },
    },
  )

  // POST / — create instance
  .post(
    "/",
    async ({ body, user, set }) => {
      const result = await createInstance(user, body);
      if ("error" in result) {
        set.status = result.status;
        return { error: result.error };
      }
      set.status = 201;
      return {
        instance: sanitize(
          result.instance as unknown as Record<string, unknown>,
        ),
      };
    },
    {
      body: t.Object({
        slug: t.String(),
        display_name: t.String(),
        admin_email: t.String(),
        tier: t.Optional(t.String()),
      }),
      detail: { tags: ["Instances"], summary: "Create instance" },
    },
  )

  // GET /:slug — instance detail with events and service URLs
  .get(
    "/:slug",
    async ({ params: { slug }, user, set }) => {
      const access = await getInstanceAccess(slug, user);
      if (!access) {
        set.status = 404;
        return { error: "Not found" };
      }

      const { instance } = access;
      const events = await getEvents(slug, user);
      if ("error" in events) {
        set.status = events.status;
        return { error: events.error };
      }

      return {
        instance: sanitize(instance as unknown as Record<string, unknown>),
        events,
        services:
          instance.status === "ready"
            ? {
                forgejo: `https://${slug}-forgejo.${PLATFORM_DOMAIN}`,
                ci: `https://${slug}-ci.${PLATFORM_DOMAIN}`,
                headlamp: `https://${slug}-headlamp.${PLATFORM_DOMAIN}`,
                minio: `https://${slug}-minio.${PLATFORM_DOMAIN}`,
                s3: `https://${slug}-s3.${PLATFORM_DOMAIN}`,
              }
            : null,
      };
    },
    {
      detail: { tags: ["Instances"], summary: "Get instance detail" },
    },
  )

  // DELETE /:slug — request instance termination
  .delete(
    "/:slug",
    async ({ params: { slug }, user, set }) => {
      const result = await deleteInstance(slug, user);
      if ("error" in result) {
        set.status = result.status;
        return { error: result.error };
      }
      return {
        instance: sanitize(
          result.instance as unknown as Record<string, unknown>,
        ),
      };
    },
    {
      detail: { tags: ["Instances"], summary: "Request instance termination" },
    },
  )

  // GET /:slug/credentials — get admin credentials
  .get(
    "/:slug/credentials",
    async ({ params: { slug }, user, set }) => {
      const result = await getCredentials(slug, user);
      if ("error" in result) {
        set.status = result.status;
        return { error: result.error };
      }
      return result;
    },
    {
      detail: { tags: ["Instances"], summary: "Get admin credentials" },
    },
  )

  // POST /:slug/credentials — reset admin password
  .post(
    "/:slug/credentials",
    async ({ params: { slug }, user, set }) => {
      const result = await resetCredentials(slug, user);
      if ("error" in result) {
        set.status = result.status;
        return { error: result.error };
      }
      return result;
    },
    {
      detail: { tags: ["Instances"], summary: "Reset admin password" },
    },
  )

  // GET /:slug/kubeconfig — download kubeconfig
  .get(
    "/:slug/kubeconfig",
    async ({ params: { slug }, user, set }) => {
      const result = await getKubeconfig(slug, user);
      if ("error" in result) {
        set.status = result.status;
        return { error: result.error };
      }
      return result;
    },
    {
      detail: { tags: ["Instances"], summary: "Download kubeconfig" },
    },
  )

  // GET /:slug/services — live service health from instance's vCluster
  .get(
    "/:slug/services",
    async ({ params: { slug }, user, set }) => {
      const access = await getInstanceAccess(slug, user);
      if (!access) {
        set.status = 404;
        return { error: "Not found" };
      }
      if (access.instance.status !== "ready") return { services: [] };
      const services = await getInstanceServiceStatuses(slug);
      return { services };
    },
    {
      detail: { tags: ["Instances"], summary: "Live service health" },
    },
  )

  // GET /:slug/apps — deployed apps in instance's vCluster
  .get(
    "/:slug/apps",
    async ({ params: { slug }, user, set }) => {
      const access = await getInstanceAccess(slug, user);
      if (!access) {
        set.status = 404;
        return { error: "Not found" };
      }
      if (access.instance.status !== "ready") return { apps: [] };
      const apps = await getInstanceApps(slug);
      return { apps };
    },
    {
      detail: { tags: ["Instances"], summary: "List instance apps" },
    },
  )

  // ─── Instance-scoped dev pods ───

  // GET /:slug/dev-pods — list instance dev pods
  .get(
    "/:slug/dev-pods",
    async ({ params: { slug }, user, set }) => {
      const access = await getInstanceAccess(slug, user);
      if (!access) {
        set.status = 404;
        return { error: "Not found" };
      }

      let result;
      if (access.isAdmin) {
        result = await pool.query(
          `SELECT dp.*, u.name as user_name, u.email as user_email, u.image as user_image
         FROM dev_pods dp
         JOIN "user" u ON u.id = dp.user_id
         WHERE dp.instance_slug = $1
         ORDER BY dp.created_at DESC`,
          [slug],
        );
      } else {
        const userResult = await pool.query(
          `SELECT id FROM "user" WHERE name = $1`,
          [user.login],
        );
        const userId = userResult.rows[0]?.id;
        if (!userId) return { pods: [] };
        result = await pool.query(
          `SELECT dp.*, u.name as user_name, u.email as user_email, u.image as user_image
         FROM dev_pods dp
         JOIN "user" u ON u.id = dp.user_id
         WHERE dp.user_id = $1 AND dp.instance_slug = $2
         ORDER BY dp.created_at DESC`,
          [userId, slug],
        );
      }

      // Enrich with live K8s status from the instance's vCluster
      const pods = await Promise.all(
        result.rows.map(async (row) => {
          let liveStatus = row.status;
          try {
            const k8sStatus = await getInstanceDevPodStatus(
              slug,
              row.forgejo_username,
            );
            liveStatus = deriveInstanceLiveStatus(k8sStatus, row.status);
          } catch {
            // Instance K8s not reachable, keep DB status
          }

          if (liveStatus !== row.status) {
            await pool.query(
              `UPDATE dev_pods SET status = $1, updated_at = NOW() WHERE id = $2`,
              [liveStatus, row.id],
            );
          }

          return { ...row, status: liveStatus };
        }),
      );

      return { pods };
    },
    {
      detail: { tags: ["Instances"], summary: "List instance dev pods" },
    },
  )

  // POST /:slug/dev-pods — create instance dev pod
  .post(
    "/:slug/dev-pods",
    async ({ params: { slug }, body, user, set }) => {
      const access = await getInstanceAccess(slug, user);
      if (!access) {
        set.status = 404;
        return { error: "Not found" };
      }

      const username = user.login;

      // Resolve better-auth user ID
      const userResult = await pool.query(
        `SELECT id FROM "user" WHERE name = $1`,
        [username],
      );
      const userId = userResult.rows[0]?.id;
      if (!userId) {
        set.status = 400;
        return {
          error:
            "No console account found for this user. Please log in to the console first.",
        };
      }

      // Check uniqueness
      const existing = await pool.query(
        `SELECT id FROM dev_pods WHERE user_id = $1 AND instance_slug = $2`,
        [userId, slug],
      );
      if (existing.rows.length > 0) {
        set.status = 409;
        return { error: "Dev pod already exists for this instance" };
      }

      const podNameVal = toPodName(username);
      const pvcNameVal = toPvcName(username);
      const cpuLimit = body.cpuLimit || "2000m";
      const memoryLimit = body.memoryLimit || "4Gi";
      const storageSize = body.storageSize || "20Gi";

      // Insert DB row
      try {
        await pool.query(
          `INSERT INTO dev_pods (user_id, forgejo_username, instance_slug, status, pod_name, pvc_name, cpu_limit, memory_limit, storage_size)
         VALUES ($1, $2, $3, 'starting', $4, $5, $6, $7, $8)`,
          [
            userId,
            username,
            slug,
            podNameVal,
            pvcNameVal,
            cpuLimit,
            memoryLimit,
            storageSize,
          ],
        );
      } catch (err: unknown) {
        if (
          err &&
          typeof err === "object" &&
          "code" in err &&
          err.code === "23505"
        ) {
          set.status = 409;
          return { error: "Dev pod already exists for this instance" };
        }
        throw err;
      }

      // Create K8s resources in the instance's vCluster
      try {
        await createInstanceDevPod(slug, {
          username,
          email: user.email,
          fullName: user.fullName || username,
          forgejoToken: "",
          forgejoUrl: "",
          cpuLimit,
          memoryLimit,
          storageSize,
        });

        await pool.query(
          `UPDATE dev_pods SET status = 'running', updated_at = NOW()
         WHERE forgejo_username = $1 AND instance_slug = $2`,
          [username, slug],
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        await pool.query(
          `UPDATE dev_pods SET status = 'error', error_message = $1, updated_at = NOW()
         WHERE forgejo_username = $2 AND instance_slug = $3`,
          [message, username, slug],
        );
        set.status = 500;
        return { error: message };
      }

      set.status = 201;
      return { created: true, username, podName: podNameVal };
    },
    {
      body: t.Object({
        cpuLimit: t.Optional(t.String()),
        memoryLimit: t.Optional(t.String()),
        storageSize: t.Optional(t.String()),
      }),
      detail: { tags: ["Instances"], summary: "Create instance dev pod" },
    },
  )

  // GET /:slug/dev-pods/:username — get instance dev pod status
  .get(
    "/:slug/dev-pods/:username",
    async ({ params: { slug, username }, user, set }) => {
      const access = await getInstanceAccess(slug, user);
      if (!access) {
        set.status = 404;
        return { error: "Not found" };
      }

      const result = await pool.query(
        `SELECT dp.*, u.name as user_name, u.email as user_email, u.image as user_image
         FROM dev_pods dp
         JOIN "user" u ON u.id = dp.user_id
         WHERE dp.forgejo_username = $1 AND dp.instance_slug = $2`,
        [username, slug],
      );

      if (result.rows.length === 0) {
        set.status = 404;
        return { error: "Dev pod not found" };
      }

      const pod = result.rows[0];
      let liveStatus = pod.status;

      try {
        const k8sStatus = await getInstanceDevPodStatus(slug, username);
        liveStatus = deriveInstanceLiveStatus(k8sStatus, pod.status);
      } catch {
        // Instance K8s not reachable
      }

      if (liveStatus !== pod.status) {
        await pool.query(
          `UPDATE dev_pods SET status = $1, updated_at = NOW() WHERE id = $2`,
          [liveStatus, pod.id],
        );
      }

      return { pod: { ...pod, status: liveStatus } };
    },
    {
      detail: { tags: ["Instances"], summary: "Get instance dev pod" },
    },
  )

  // PATCH /:slug/dev-pods/:username — start/stop instance dev pod
  .patch(
    "/:slug/dev-pods/:username",
    async ({ params: { slug, username }, body, user, set }) => {
      const access = await getInstanceAccess(slug, user);
      if (!access) {
        set.status = 404;
        return { error: "Not found" };
      }

      const result = await pool.query(
        `SELECT * FROM dev_pods WHERE forgejo_username = $1 AND instance_slug = $2`,
        [username, slug],
      );

      if (result.rows.length === 0) {
        set.status = 404;
        return { error: "Dev pod not found" };
      }

      const pod = result.rows[0];

      // Verify ownership or admin
      const userResult = await pool.query(
        `SELECT id FROM "user" WHERE name = $1`,
        [user.login],
      );
      const userId = userResult.rows[0]?.id;
      if (pod.user_id !== userId && !access.isAdmin) {
        set.status = 403;
        return { error: "Forbidden" };
      }

      if (body.action !== "start" && body.action !== "stop") {
        set.status = 400;
        return { error: 'action must be "start" or "stop"' };
      }

      try {
        if (body.action === "start") {
          await pool.query(
            `UPDATE dev_pods SET status = 'starting', error_message = NULL, updated_at = NOW() WHERE id = $1`,
            [pod.id],
          );
          await startInstanceDevPod(slug, username);
        } else {
          await pool.query(
            `UPDATE dev_pods SET status = 'stopping', updated_at = NOW() WHERE id = $1`,
            [pod.id],
          );
          await stopInstanceDevPod(slug, username);
          await pool.query(
            `UPDATE dev_pods SET status = 'stopped', updated_at = NOW() WHERE id = $1`,
            [pod.id],
          );
        }

        return { success: true, action: body.action };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        await pool.query(
          `UPDATE dev_pods SET status = 'error', error_message = $1, updated_at = NOW() WHERE id = $2`,
          [message, pod.id],
        );
        set.status = 500;
        return { error: message };
      }
    },
    {
      body: t.Object({
        action: t.String(),
      }),
      detail: {
        tags: ["Instances"],
        summary: "Start or stop instance dev pod",
      },
    },
  )

  // DELETE /:slug/dev-pods/:username — delete instance dev pod
  .delete(
    "/:slug/dev-pods/:username",
    async ({ params: { slug, username }, user, set }) => {
      const access = await getInstanceAccess(slug, user);
      if (!access) {
        set.status = 404;
        return { error: "Not found" };
      }

      const result = await pool.query(
        `SELECT * FROM dev_pods WHERE forgejo_username = $1 AND instance_slug = $2`,
        [username, slug],
      );

      if (result.rows.length === 0) {
        set.status = 404;
        return { error: "Dev pod not found" };
      }

      const pod = result.rows[0];

      // Verify ownership or admin
      const userResult = await pool.query(
        `SELECT id FROM "user" WHERE name = $1`,
        [user.login],
      );
      const userId = userResult.rows[0]?.id;
      if (pod.user_id !== userId && !access.isAdmin) {
        set.status = 403;
        return { error: "Forbidden" };
      }

      try {
        await deleteInstanceDevPod(slug, username);
        await pool.query(`DELETE FROM dev_pods WHERE id = $1`, [pod.id]);
        return { deleted: true };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        set.status = 500;
        return { error: message };
      }
    },
    {
      detail: { tags: ["Instances"], summary: "Delete instance dev pod" },
    },
  );
