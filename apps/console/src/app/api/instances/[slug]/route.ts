import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { headers } from "next/headers";
import pool from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;

  const result = await pool.query(
    `SELECT i.*, c.tier as customer_tier, c.email as customer_email
     FROM instances i
     JOIN customers c ON c.id = i.customer_id
     WHERE i.slug = $1 AND c.user_id = $2`,
    [slug, session.user.id]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const instance = result.rows[0];

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
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;

  const result = await pool.query(
    `UPDATE instances SET status = 'terminating'
     FROM customers
     WHERE instances.customer_id = customers.id
       AND instances.slug = $1
       AND customers.user_id = $2
       AND instances.status NOT IN ('terminated', 'terminating')
     RETURNING instances.*`,
    [slug, session.user.id]
  );

  if (result.rows.length === 0) {
    return NextResponse.json(
      { error: "Not found or already terminating" },
      { status: 404 }
    );
  }

  await pool.query(
    `INSERT INTO provision_events (instance_id, phase, status, message)
     VALUES ($1, 'teardown', 'info', 'Teardown requested')`,
    [result.rows[0].id]
  );

  return NextResponse.json({ instance: result.rows[0] });
}
