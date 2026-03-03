import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/auth";
import pool from "@/lib/db";
import { createServerDeployment } from "@/lib/k8s";

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

  const server = result.rows[0];

  if (server.status === "running" || server.status === "starting") {
    return NextResponse.json(
      { error: `Server is already ${server.status}` },
      { status: 409 },
    );
  }

  await pool.query("UPDATE servers SET status = $1 WHERE id = $2", [
    "starting",
    id,
  ]);

  try {
    const port = await createServerDeployment(server);

    await pool.query("UPDATE servers SET port = $1 WHERE id = $2", [port, id]);

    return NextResponse.json({ status: "starting", port });
  } catch (err) {
    await pool.query("UPDATE servers SET status = $1 WHERE id = $2", [
      "error",
      id,
    ]);

    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to start server", detail: message },
      { status: 500 },
    );
  }
}
