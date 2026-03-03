import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/auth";
import pool from "@/lib/db";
import { deleteServerDeployment } from "@/lib/k8s";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const result = await pool.query(
    "SELECT * FROM servers WHERE id = $1 AND owner_id = $2",
    [id, session.user.id],
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Server not found" }, { status: 404 });
  }

  return NextResponse.json(result.rows[0]);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const result = await pool.query(
    "SELECT * FROM servers WHERE id = $1 AND owner_id = $2",
    [id, session.user.id],
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Server not found" }, { status: 404 });
  }

  const server = result.rows[0];

  if (server.status !== "stopped") {
    await deleteServerDeployment(id);
  }

  await pool.query("DELETE FROM servers WHERE id = $1", [id]);

  return NextResponse.json({ deleted: true });
}
