import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import {
  getForgejoUser,
  createUserToken,
} from "@/lib/forgejo";
import { createDevPod, getDevPodStatus } from "@/lib/devpod";
import { getSessionWithRole } from "@/lib/session-role";

export async function GET() {
  const sessionResult = await getSessionWithRole();
  if (!sessionResult) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { session, role } = sessionResult;

  let result;
  if (role === "admin") {
    result = await pool.query(
      `SELECT dp.*, u.name as user_name, u.email as user_email, u.image as user_image
       FROM dev_pods dp
       JOIN "user" u ON u.id = dp.user_id
       ORDER BY dp.created_at DESC`
    );
  } else {
    result = await pool.query(
      `SELECT dp.*, u.name as user_name, u.email as user_email, u.image as user_image
       FROM dev_pods dp
       JOIN "user" u ON u.id = dp.user_id
       WHERE dp.user_id = $1
       ORDER BY dp.created_at DESC`,
      [session.user.id]
    );
  }

  // Enrich with live K8s status
  const pods = await Promise.all(
    result.rows.map(async (row) => {
      const k8sStatus = await getDevPodStatus(row.forgejo_username);
      let liveStatus = row.status;

      if (k8sStatus.exists) {
        if (k8sStatus.replicas === 0) {
          liveStatus = "stopped";
        } else if (k8sStatus.readyReplicas > 0) {
          liveStatus = "running";
        } else {
          liveStatus = "starting";
        }
      }

      // Update DB if status changed
      if (liveStatus !== row.status) {
        await pool.query(
          `UPDATE dev_pods SET status = $1, updated_at = NOW() WHERE id = $2`,
          [liveStatus, row.id]
        );
      }

      return {
        ...row,
        status: liveStatus,
      };
    })
  );

  return NextResponse.json({ pods });
}

export async function POST(request: NextRequest) {
  const sessionResult = await getSessionWithRole();
  if (!sessionResult) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { session } = sessionResult;

  // Get the user's Forgejo identity
  const forgejoUser = await getForgejoUser(session.user.name);
  if (!forgejoUser) {
    return NextResponse.json(
      { error: "Forgejo user not found" },
      { status: 404 }
    );
  }

  // Check if user already has a dev pod
  const existing = await pool.query(
    `SELECT id FROM dev_pods WHERE user_id = $1`,
    [session.user.id]
  );
  if (existing.rows.length > 0) {
    return NextResponse.json(
      { error: "Dev pod already exists" },
      { status: 409 }
    );
  }

  const username = forgejoUser.login;
  const domain = process.env.PLATFORM_DOMAIN || "";
  const prefix = process.env.SERVICE_PREFIX || "";
  const forgejoUrl = `https://${prefix}forgejo.${domain}`;

  // Create a Forgejo PAT for the dev pod
  const token = await createUserToken(username, `devpod-${username}`);

  // Insert DB record
  const podNameVal = `devpod-${username}`;
  const pvcNameVal = `devpod-${username}-home`;

  const body = await request.json().catch(() => ({}));
  const cpuLimit = body.cpuLimit || "2000m";
  const memoryLimit = body.memoryLimit || "4Gi";
  const storageSize = body.storageSize || "20Gi";

  await pool.query(
    `INSERT INTO dev_pods (user_id, forgejo_username, status, pod_name, pvc_name, cpu_limit, memory_limit, storage_size)
     VALUES ($1, $2, 'starting', $3, $4, $5, $6, $7)`,
    [
      session.user.id,
      username,
      podNameVal,
      pvcNameVal,
      cpuLimit,
      memoryLimit,
      storageSize,
    ]
  );

  // Create K8s resources
  try {
    await createDevPod({
      username,
      email: forgejoUser.email,
      fullName: forgejoUser.full_name || username,
      forgejoToken: token.sha1,
      forgejoUrl,
      cpuLimit,
      memoryLimit,
      storageSize,
    });

    await pool.query(
      `UPDATE dev_pods SET status = 'running', updated_at = NOW() WHERE forgejo_username = $1`,
      [username]
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await pool.query(
      `UPDATE dev_pods SET status = 'error', error_message = $1, updated_at = NOW() WHERE forgejo_username = $2`,
      [message, username]
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json(
    { created: true, username, podName: podNameVal },
    { status: 201 }
  );
}
