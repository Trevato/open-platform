import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { headers } from "next/headers";
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
    `SELECT i.kubeconfig, i.status
     FROM instances i
     JOIN customers c ON c.id = i.customer_id
     WHERE i.slug = $1 AND c.user_id = $2`,
    [slug, session.user.id]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { kubeconfig, status } = result.rows[0];

  if (status !== "ready") {
    return NextResponse.json(
      { error: "Instance must be ready to download kubeconfig" },
      { status: 400 }
    );
  }

  if (!kubeconfig) {
    return NextResponse.json(
      { error: "Kubeconfig not yet available" },
      { status: 404 }
    );
  }

  return NextResponse.json({ kubeconfig });
}
