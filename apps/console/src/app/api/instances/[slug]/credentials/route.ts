import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
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

  return NextResponse.json({
    username: access.instance.admin_username,
    password: access.instance.admin_password,
  });
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const access = await getInstanceAccess(slug);

  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { instance } = access;

  if (instance.status !== "ready") {
    return NextResponse.json(
      { error: "Instance must be ready to reset credentials" },
      { status: 400 }
    );
  }

  if (!instance.admin_password) {
    return NextResponse.json(
      { error: "No existing credentials — instance may still be provisioning" },
      { status: 400 }
    );
  }

  const newPassword = randomBytes(24).toString("hex");

  await pool.query(
    `UPDATE instances
     SET admin_password = $1, password_reset_at = NOW(), updated_at = NOW()
     WHERE id = $2`,
    [newPassword, instance.id]
  );

  await pool.query(
    `INSERT INTO provision_events (instance_id, phase, status, message)
     VALUES ($1, 'password_reset', 'info', 'Password reset requested')`,
    [instance.id]
  );

  return NextResponse.json({
    username: instance.admin_username,
    password: newPassword,
  });
}
