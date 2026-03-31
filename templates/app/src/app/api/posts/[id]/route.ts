import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { headers } from "next/headers";
import db from "@/lib/db";
import { UpdatePostSchema } from "@/lib/schemas";
import { single, error } from "@/lib/api";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await db.query(
    `SELECT p.id, p.title, p.content, p.published, p.created_at,
            u.name as author, u.image as author_image
     FROM posts p JOIN "user" u ON p.author_id = u.id WHERE p.id = $1`,
    [id],
  );
  if (!result.rows[0]) return error("Not found", "NOT_FOUND", 404);
  return single(result.rows[0]);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return error("Unauthorized", "UNAUTHORIZED", 401);

  const { id } = await params;
  const post = await db.query(`SELECT author_id FROM posts WHERE id = $1`, [
    id,
  ]);
  if (!post.rows[0]) return error("Not found", "NOT_FOUND", 404);
  if (post.rows[0].author_id !== session.user.id)
    return error("Forbidden", "FORBIDDEN", 403);

  let body;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON", "INVALID_JSON", 400);
  }

  const parsed = UpdatePostSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.errors[0]?.message || "Validation failed";
    return error(msg, "VALIDATION_ERROR", 400);
  }

  const { title, content, published } = parsed.data;
  const result = await db.query(
    `UPDATE posts SET
      title = COALESCE($1, title),
      content = COALESCE($2, content),
      published = COALESCE($3, published),
      updated_at = NOW()
     WHERE id = $4
     RETURNING id, title, content, published, created_at, updated_at`,
    [title, content, published, id],
  );
  return single(result.rows[0]);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return error("Unauthorized", "UNAUTHORIZED", 401);

  const { id } = await params;
  const post = await db.query(`SELECT author_id FROM posts WHERE id = $1`, [
    id,
  ]);
  if (!post.rows[0]) return error("Not found", "NOT_FOUND", 404);
  if (post.rows[0].author_id !== session.user.id)
    return error("Forbidden", "FORBIDDEN", 403);

  await db.query(`DELETE FROM posts WHERE id = $1`, [id]);
  return single({ deleted: true });
}
