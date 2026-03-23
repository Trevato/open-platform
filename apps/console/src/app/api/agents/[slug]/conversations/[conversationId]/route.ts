import { auth } from "@/auth";
import { headers } from "next/headers";
import pool from "@/lib/db";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string; conversationId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { slug, conversationId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await pool.query(
    `SELECT id, agent_slug, user_id, title, messages, created_at, updated_at
     FROM conversations
     WHERE id = $1 AND agent_slug = $2 AND user_id = $3`,
    [conversationId, slug, session.user.id],
  );

  if (result.rows.length === 0) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  return Response.json({ conversation: result.rows[0] });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { slug, conversationId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await pool.query(
    `DELETE FROM conversations WHERE id = $1 AND agent_slug = $2 AND user_id = $3`,
    [conversationId, slug, session.user.id],
  );

  return new Response(null, { status: 204 });
}
