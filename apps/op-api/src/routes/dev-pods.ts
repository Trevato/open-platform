import { Elysia, t } from "elysia";
import { authPlugin, isSystemOrgMember } from "../auth.js";
import type { AuthenticatedUser } from "../auth.js";
import pool from "../services/db.js";
import {
  createDevPod,
  startDevPod,
  stopDevPod,
  deleteDevPod,
  getDevPodStatus,
  ensureHostInfrastructure,
  podName as toPodName,
  pvcName as toPvcName,
} from "../services/devpod.js";

const FORGEJO_URL =
  process.env.FORGEJO_INTERNAL_URL || process.env.FORGEJO_URL || "";
const FORGEJO_ADMIN_USER = process.env.FORGEJO_ADMIN_USER || "";
const FORGEJO_ADMIN_PASSWORD = process.env.FORGEJO_ADMIN_PASSWORD || "";
const PLATFORM_DOMAIN = process.env.PLATFORM_DOMAIN || "";
const SERVICE_PREFIX = process.env.SERVICE_PREFIX || "";

// ─── Helpers ───

async function resolveIsAdmin(user: AuthenticatedUser): Promise<boolean> {
  return user.isAdmin || (await isSystemOrgMember(user.token, user.login));
}

async function getUserIdByLogin(login: string): Promise<string | null> {
  const result = await pool.query(`SELECT id FROM "user" WHERE name = $1`, [
    login,
  ]);
  return result.rows.length > 0 ? result.rows[0].id : null;
}

function deriveLiveStatus(
  k8sStatus: { exists: boolean; replicas: number; readyReplicas: number },
  dbStatus: string,
): string {
  if (!k8sStatus.exists) return dbStatus;
  if (k8sStatus.replicas === 0) return "stopped";
  if (k8sStatus.readyReplicas > 0) return "running";
  return "starting";
}

/**
 * Create a Forgejo PAT using admin credentials against the Forgejo API.
 */
async function createForgejoToken(
  username: string,
  tokenName: string,
): Promise<string> {
  const authHeader =
    "Basic " +
    Buffer.from(`${FORGEJO_ADMIN_USER}:${FORGEJO_ADMIN_PASSWORD}`).toString(
      "base64",
    );

  // Delete existing token with the same name
  try {
    const listRes = await fetch(
      `${FORGEJO_URL}/api/v1/users/${encodeURIComponent(username)}/tokens`,
      {
        headers: { Authorization: authHeader, Accept: "application/json" },
      },
    );
    if (listRes.ok) {
      const tokens = (await listRes.json()) as { id: number; name: string }[];
      const existing = tokens.find((t) => t.name === tokenName);
      if (existing) {
        await fetch(
          `${FORGEJO_URL}/api/v1/users/${encodeURIComponent(username)}/tokens/${existing.id}`,
          { method: "DELETE", headers: { Authorization: authHeader } },
        );
      }
    }
  } catch {
    // Token list failed — continue to create
  }

  // Create new token
  const res = await fetch(
    `${FORGEJO_URL}/api/v1/users/${encodeURIComponent(username)}/tokens`,
    {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        name: tokenName,
        scopes: [
          "read:user",
          "write:repository",
          "read:repository",
          "read:organization",
          "write:issue",
          "read:issue",
          "read:package",
          "write:package",
        ],
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create Forgejo token: ${res.status} ${body}`);
  }

  const data = (await res.json()) as { sha1: string };
  return data.sha1;
}

// ─── Routes ───

export const devPodsPlugin = new Elysia({ prefix: "/dev-pods" })
  .use(authPlugin)

  // GET / — list dev pods
  .get(
    "/",
    async ({ user }) => {
      const isAdmin = await resolveIsAdmin(user);

      let result;
      if (isAdmin) {
        result = await pool.query(
          `SELECT dp.*, u.name as user_name, u.email as user_email, u.image as user_image
         FROM dev_pods dp
         JOIN "user" u ON u.id = dp.user_id
         WHERE dp.instance_slug IS NULL
         ORDER BY dp.created_at DESC`,
        );
      } else {
        const userId = await getUserIdByLogin(user.login);
        if (!userId) return { pods: [] };
        result = await pool.query(
          `SELECT dp.*, u.name as user_name, u.email as user_email, u.image as user_image
         FROM dev_pods dp
         JOIN "user" u ON u.id = dp.user_id
         WHERE dp.user_id = $1 AND dp.instance_slug IS NULL
         ORDER BY dp.created_at DESC`,
          [userId],
        );
      }

      // Enrich with live K8s status
      const pods = await Promise.all(
        result.rows.map(async (row) => {
          const k8sStatus = await getDevPodStatus(row.forgejo_username);
          const liveStatus = deriveLiveStatus(k8sStatus, row.status);

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
      detail: { tags: ["Dev Pods"], summary: "List host dev pods" },
    },
  )

  // POST / — create dev pod
  .post(
    "/",
    async ({ body, user, set }) => {
      const username = user.login;

      // Check uniqueness
      const existing = await pool.query(
        `SELECT id FROM dev_pods WHERE forgejo_username = $1 AND instance_slug IS NULL`,
        [username],
      );
      if (existing.rows.length > 0) {
        set.status = 409;
        return { error: "Dev pod already exists" };
      }

      // Resolve better-auth user ID
      const userId = await getUserIdByLogin(username);
      if (!userId) {
        set.status = 400;
        return {
          error:
            "No console account found for this user. Please log in to the console first.",
        };
      }

      const forgejoUrl = `https://${SERVICE_PREFIX}forgejo.${PLATFORM_DOMAIN}`;

      // Create Forgejo PAT
      let token: string;
      try {
        token = await createForgejoToken(username, `devpod-${username}`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        set.status = 500;
        return { error: `Failed to create Forgejo token: ${message}` };
      }

      const podNameVal = toPodName(username);
      const pvcNameVal = toPvcName(username);

      // Validate and cap resource limits
      const MAX_CPU_MILLICORES = 4000;
      const MAX_MEMORY_GI = 16;
      const MAX_STORAGE_GI = 100;

      const parseCpu = (v: string): number => {
        if (v.endsWith("m")) return parseInt(v);
        return parseFloat(v) * 1000;
      };
      const parseGi = (v: string): number => {
        if (v.endsWith("Gi")) return parseInt(v);
        if (v.endsWith("Mi")) return parseInt(v) / 1024;
        if (v.endsWith("Ti")) return parseInt(v) * 1024;
        return parseFloat(v) / (1024 * 1024 * 1024);
      };

      const cpuLimit = body.cpuLimit || "2000m";
      const memoryLimit = body.memoryLimit || "4Gi";
      const storageSize = body.storageSize || "20Gi";

      const cpuVal = parseCpu(cpuLimit);
      const memVal = parseGi(memoryLimit);
      const storageVal = parseGi(storageSize);

      if (isNaN(cpuVal) || cpuVal <= 0 || cpuVal > MAX_CPU_MILLICORES) {
        set.status = 400;
        return {
          error: `cpuLimit must be between 1m and ${MAX_CPU_MILLICORES}m`,
        };
      }
      if (isNaN(memVal) || memVal <= 0 || memVal > MAX_MEMORY_GI) {
        set.status = 400;
        return {
          error: `memoryLimit must be between 1Mi and ${MAX_MEMORY_GI}Gi`,
        };
      }
      if (isNaN(storageVal) || storageVal <= 0 || storageVal > MAX_STORAGE_GI) {
        set.status = 400;
        return {
          error: `storageSize must be between 1Gi and ${MAX_STORAGE_GI}Gi`,
        };
      }

      // Ensure K8s infrastructure
      await ensureHostInfrastructure();

      // Insert DB row
      try {
        await pool.query(
          `INSERT INTO dev_pods (user_id, forgejo_username, status, pod_name, pvc_name, cpu_limit, memory_limit, storage_size)
         VALUES ($1, $2, 'starting', $3, $4, $5, $6, $7)`,
          [
            userId,
            username,
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
          return { error: "Dev pod already exists" };
        }
        throw err;
      }

      // Create K8s resources
      try {
        await createDevPod({
          username,
          email: user.email,
          fullName: user.fullName || username,
          forgejoToken: token,
          forgejoUrl,
          cpuLimit,
          memoryLimit,
          storageSize,
        });

        await pool.query(
          `UPDATE dev_pods SET status = 'running', updated_at = NOW()
         WHERE forgejo_username = $1 AND instance_slug IS NULL`,
          [username],
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        await pool.query(
          `UPDATE dev_pods SET status = 'error', error_message = $1, updated_at = NOW()
         WHERE forgejo_username = $2 AND instance_slug IS NULL`,
          [message, username],
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
      detail: { tags: ["Dev Pods"], summary: "Create host dev pod" },
    },
  )

  // GET /:username — get single dev pod
  .get(
    "/:username",
    async ({ params: { username }, user, set }) => {
      const result = await pool.query(
        `SELECT dp.*, u.name as user_name, u.email as user_email, u.image as user_image
       FROM dev_pods dp
       JOIN "user" u ON u.id = dp.user_id
       WHERE dp.forgejo_username = $1 AND dp.instance_slug IS NULL`,
        [username],
      );

      if (result.rows.length === 0) {
        set.status = 404;
        return { error: "Dev pod not found" };
      }

      const pod = result.rows[0];

      // Verify ownership or admin
      const isAdmin = await resolveIsAdmin(user);
      if (!isAdmin && pod.user_id !== (await getUserIdByLogin(user.login))) {
        set.status = 403;
        return { error: "Forbidden" };
      }

      const k8sStatus = await getDevPodStatus(username);
      const liveStatus = deriveLiveStatus(k8sStatus, pod.status);

      if (liveStatus !== pod.status) {
        await pool.query(
          `UPDATE dev_pods SET status = $1, updated_at = NOW() WHERE id = $2`,
          [liveStatus, pod.id],
        );
      }

      return { pod: { ...pod, status: liveStatus } };
    },
    {
      detail: { tags: ["Dev Pods"], summary: "Get dev pod" },
    },
  )

  // PATCH /:username — start/stop
  .patch(
    "/:username",
    async ({ params: { username }, body, user, set }) => {
      const result = await pool.query(
        `SELECT * FROM dev_pods WHERE forgejo_username = $1 AND instance_slug IS NULL`,
        [username],
      );

      if (result.rows.length === 0) {
        set.status = 404;
        return { error: "Dev pod not found" };
      }

      const pod = result.rows[0];

      // Verify ownership or admin
      const isAdmin = await resolveIsAdmin(user);
      const userId = await getUserIdByLogin(user.login);
      if (!isAdmin && pod.user_id !== userId) {
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
          await startDevPod(username);
        } else {
          await pool.query(
            `UPDATE dev_pods SET status = 'stopping', updated_at = NOW() WHERE id = $1`,
            [pod.id],
          );
          await stopDevPod(username);
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
      detail: { tags: ["Dev Pods"], summary: "Start or stop dev pod" },
    },
  )

  // DELETE /:username — delete dev pod
  .delete(
    "/:username",
    async ({ params: { username }, user, set }) => {
      const result = await pool.query(
        `SELECT * FROM dev_pods WHERE forgejo_username = $1 AND instance_slug IS NULL`,
        [username],
      );

      if (result.rows.length === 0) {
        set.status = 404;
        return { error: "Dev pod not found" };
      }

      const pod = result.rows[0];

      // Verify ownership or admin
      const isAdmin = await resolveIsAdmin(user);
      const userId = await getUserIdByLogin(user.login);
      if (!isAdmin && pod.user_id !== userId) {
        set.status = 403;
        return { error: "Forbidden" };
      }

      try {
        await deleteDevPod(username);
        await pool.query(`DELETE FROM dev_pods WHERE id = $1`, [pod.id]);
        return { deleted: true };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        set.status = 500;
        return { error: message };
      }
    },
    {
      detail: { tags: ["Dev Pods"], summary: "Delete dev pod" },
    },
  );
