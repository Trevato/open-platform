import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { headers } from "next/headers";
import { randomBytes } from "crypto";
import pool from "@/lib/db";

export const dynamic = "force-dynamic";

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
    `SELECT i.admin_username, i.admin_password
     FROM instances i
     JOIN customers c ON c.id = i.customer_id
     WHERE i.slug = $1 AND c.user_id = $2`,
    [slug, session.user.id]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    username: result.rows[0].admin_username,
    password: result.rows[0].admin_password,
  });
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;

  const result = await pool.query(
    `SELECT i.id, i.admin_username, i.admin_password, i.status
     FROM instances i
     JOIN customers c ON c.id = i.customer_id
     WHERE i.slug = $1 AND c.user_id = $2`,
    [slug, session.user.id]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { id, admin_username, admin_password, status } = result.rows[0];

  if (status !== "ready") {
    return NextResponse.json(
      { error: "Instance must be ready to reset credentials" },
      { status: 400 }
    );
  }

  if (!admin_password) {
    return NextResponse.json(
      { error: "No existing credentials — instance may still be provisioning" },
      { status: 400 }
    );
  }

  // Generate new password and store in DB.
  // The reconciler applies it to Forgejo asynchronously (within ~60s).
  const newPassword = randomBytes(24).toString("hex");

  await pool.query(
    `UPDATE instances
     SET admin_password = $1, password_reset_at = NOW(), updated_at = NOW()
     WHERE id = $2`,
    [newPassword, id]
  );

  await pool.query(
    `INSERT INTO provision_events (instance_id, phase, status, message)
     VALUES ($1, 'password_reset', 'info', 'Password reset requested')`,
    [id]
  );

  return NextResponse.json({
    username: admin_username,
    password: newPassword,
  });
}
