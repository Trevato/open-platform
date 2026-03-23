import { auth } from "@/auth";
import { headers } from "next/headers";
import pool from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await pool.query(
    `SELECT id, title, updated_at, jsonb_array_length(messages) as message_count
     FROM conversations
     WHERE agent_slug = $1 AND user_id = $2
     ORDER BY updated_at DESC
     LIMIT 50`,
    [slug, session.user.id],
  );

  return Response.json({ conversations: result.rows });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));

  const result = await pool.query(
    `INSERT INTO conversations (agent_slug, user_id, title)
     VALUES ($1, $2, $3)
     RETURNING id, agent_slug, user_id, title, messages, created_at, updated_at`,
    [slug, session.user.id, body.title || null],
  );

  return Response.json({ conversation: result.rows[0] }, { status: 201 });
}
