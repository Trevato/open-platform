import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/auth";
import pool from "@/lib/db";
import { deleteServerDeployment } from "@/lib/k8s";

export async function POST(
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

  await pool.query("UPDATE servers SET status = $1 WHERE id = $2", [
    "stopping",
    id,
  ]);

  await deleteServerDeployment(id);

  await pool.query(
    "UPDATE servers SET status = $1, port = NULL WHERE id = $2",
    ["stopped", id],
  );

  return NextResponse.json({ status: "stopped" });
}
