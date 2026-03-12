import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getInstanceAccess } from "@/lib/instance-access";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const access = await getInstanceAccess(slug);

  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { instance } = access;

  const events = await pool.query(
    `SELECT phase, status, message, created_at
     FROM provision_events
     WHERE instance_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [instance.id]
  );

  const domain = process.env.MANAGED_DOMAIN || "open-platform.sh";

  return NextResponse.json({
    instance,
    events: events.rows,
    services:
      instance.status === "ready"
        ? {
            forgejo: `https://${slug}-forgejo.${domain}`,
            ci: `https://${slug}-ci.${domain}`,
            headlamp: `https://${slug}-headlamp.${domain}`,
            minio: `https://${slug}-minio.${domain}`,
            s3: `https://${slug}-s3.${domain}`,
          }
        : null,
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const access = await getInstanceAccess((await params).slug);

  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { instance } = access;

  if (instance.status === "terminated" || instance.status === "terminating") {
    return NextResponse.json(
      { error: "Already terminating" },
      { status: 400 }
    );
  }

  const result = await pool.query(
    `UPDATE instances SET status = 'terminating', updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [instance.id]
  );

  await pool.query(
    `INSERT INTO provision_events (instance_id, phase, status, message)
     VALUES ($1, 'teardown', 'info', 'Teardown requested')`,
    [instance.id]
  );

  return NextResponse.json({ instance: result.rows[0] });
}
