import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getInstanceAccess } from "@/lib/instance-access";
import {
  createInstanceDevPod,
  getInstanceDevPodStatus,
} from "@/lib/devpod";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const access = await getInstanceAccess(slug);
  if (!access) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { session, isAdmin } = access;

  let result;
  if (isAdmin) {
    result = await pool.query(
      `SELECT dp.*, u.name as user_name, u.email as user_email, u.image as user_image
       FROM dev_pods dp
       JOIN "user" u ON u.id = dp.user_id
       WHERE dp.instance_slug = $1
       ORDER BY dp.created_at DESC`,
      [slug]
    );
  } else {
    result = await pool.query(
      `SELECT dp.*, u.name as user_name, u.email as user_email, u.image as user_image
       FROM dev_pods dp
       JOIN "user" u ON u.id = dp.user_id
       WHERE dp.user_id = $1 AND dp.instance_slug = $2
       ORDER BY dp.created_at DESC`,
      [session.user.id, slug]
    );
  }

  // Enrich with live K8s status from the instance's vCluster
  const pods = await Promise.all(
    result.rows.map(async (row) => {
      let liveStatus = row.status;
      try {
        const k8sStatus = await getInstanceDevPodStatus(
          slug,
          row.forgejo_username
        );

        if (k8sStatus.exists) {
          if (k8sStatus.replicas === 0) {
            liveStatus = "stopped";
          } else if (k8sStatus.readyReplicas > 0) {
            liveStatus = "running";
          } else {
            liveStatus = "starting";
          }
        }
      } catch {
        // Instance k8s not reachable, keep DB status
      }

      if (liveStatus !== row.status) {
        await pool.query(
          `UPDATE dev_pods SET status = $1, updated_at = NOW() WHERE id = $2`,
          [liveStatus, row.id]
        );
      }

      return { ...row, status: liveStatus };
    })
  );

  return NextResponse.json({ pods });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const access = await getInstanceAccess(slug);
  if (!access) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { session } = access;

  // Check if user already has a dev pod for this instance
  const existing = await pool.query(
    `SELECT id FROM dev_pods WHERE user_id = $1 AND instance_slug = $2`,
    [session.user.id, slug]
  );
  if (existing.rows.length > 0) {
    return NextResponse.json(
      { error: "Dev pod already exists for this instance" },
      { status: 409 }
    );
  }

  const username = session.user.name;
  const podNameVal = `devpod-${username}`;
  const pvcNameVal = `devpod-${username}-home`;

  const body = await request.json().catch(() => ({}));
  const cpuLimit = body.cpuLimit || "2000m";
  const memoryLimit = body.memoryLimit || "4Gi";
  const storageSize = body.storageSize || "20Gi";

  await pool.query(
    `INSERT INTO dev_pods (user_id, forgejo_username, instance_slug, status, pod_name, pvc_name, cpu_limit, memory_limit, storage_size)
     VALUES ($1, $2, $3, 'starting', $4, $5, $6, $7, $8)`,
    [
      session.user.id,
      username,
      slug,
      podNameVal,
      pvcNameVal,
      cpuLimit,
      memoryLimit,
      storageSize,
    ]
  );

  try {
    await createInstanceDevPod(slug, {
      username,
      email: session.user.email,
      fullName: session.user.name,
      forgejoToken: "",
      forgejoUrl: "",
      cpuLimit,
      memoryLimit,
      storageSize,
    });

    await pool.query(
      `UPDATE dev_pods SET status = 'running', updated_at = NOW()
       WHERE forgejo_username = $1 AND instance_slug = $2`,
      [username, slug]
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await pool.query(
      `UPDATE dev_pods SET status = 'error', error_message = $1, updated_at = NOW()
       WHERE forgejo_username = $2 AND instance_slug = $3`,
      [message, username, slug]
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json(
    { created: true, username, podName: podNameVal },
    { status: 201 }
  );
}
