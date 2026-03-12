import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getInstanceAccess } from "@/lib/instance-access";
import {
  startInstanceDevPod,
  stopInstanceDevPod,
  deleteInstanceDevPod,
  getInstanceDevPodStatus,
} from "@/lib/devpod";

type Params = { params: Promise<{ slug: string; username: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { slug, username } = await params;
  const access = await getInstanceAccess(slug);
  if (!access) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await pool.query(
    `SELECT dp.*, u.name as user_name, u.email as user_email, u.image as user_image
     FROM dev_pods dp
     JOIN "user" u ON u.id = dp.user_id
     WHERE dp.forgejo_username = $1 AND dp.instance_slug = $2`,
    [username, slug]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Dev pod not found" }, { status: 404 });
  }

  const pod = result.rows[0];
  let liveStatus = pod.status;

  try {
    const k8sStatus = await getInstanceDevPodStatus(slug, username);
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

  if (liveStatus !== pod.status) {
    await pool.query(
      `UPDATE dev_pods SET status = $1, updated_at = NOW() WHERE id = $2`,
      [liveStatus, pod.id]
    );
  }

  return NextResponse.json({ ...pod, status: liveStatus });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { slug, username } = await params;
  const access = await getInstanceAccess(slug);
  if (!access) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { session, isAdmin } = access;

  const result = await pool.query(
    `SELECT * FROM dev_pods WHERE forgejo_username = $1 AND instance_slug = $2`,
    [username, slug]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Dev pod not found" }, { status: 404 });
  }

  const pod = result.rows[0];
  if (pod.user_id !== session.user.id && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { action } = body;

  if (action !== "start" && action !== "stop") {
    return NextResponse.json(
      { error: 'action must be "start" or "stop"' },
      { status: 400 }
    );
  }

  try {
    if (action === "start") {
      await pool.query(
        `UPDATE dev_pods SET status = 'starting', error_message = NULL, updated_at = NOW() WHERE id = $1`,
        [pod.id]
      );
      await startInstanceDevPod(slug, username);
    } else {
      await pool.query(
        `UPDATE dev_pods SET status = 'stopping', updated_at = NOW() WHERE id = $1`,
        [pod.id]
      );
      await stopInstanceDevPod(slug, username);
      await pool.query(
        `UPDATE dev_pods SET status = 'stopped', updated_at = NOW() WHERE id = $1`,
        [pod.id]
      );
    }

    return NextResponse.json({ success: true, action });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await pool.query(
      `UPDATE dev_pods SET status = 'error', error_message = $1, updated_at = NOW() WHERE id = $2`,
      [message, pod.id]
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { slug, username } = await params;
  const access = await getInstanceAccess(slug);
  if (!access) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { session, isAdmin } = access;

  const result = await pool.query(
    `SELECT * FROM dev_pods WHERE forgejo_username = $1 AND instance_slug = $2`,
    [username, slug]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Dev pod not found" }, { status: 404 });
  }

  const pod = result.rows[0];
  if (pod.user_id !== session.user.id && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await deleteInstanceDevPod(slug, username);
    await pool.query(`DELETE FROM dev_pods WHERE id = $1`, [pod.id]);
    return NextResponse.json({ deleted: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
