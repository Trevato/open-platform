import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { headers } from "next/headers";
import db from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await db.query(
    `SELECT p.*, u.name as author, u.image as author_image
     FROM posts p JOIN "user" u ON p.author_id = u.id WHERE p.id = $1`,
    [id],
  );
  if (!result.rows[0])
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(result.rows[0]);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const post = await db.query(`SELECT author_id FROM posts WHERE id = $1`, [
    id,
  ]);
  if (!post.rows[0])
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (post.rows[0].author_id !== session.user.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { title, content, published } = await req.json();
  const result = await db.query(
    `UPDATE posts SET
      title = COALESCE($1, title),
      content = COALESCE($2, content),
      published = COALESCE($3, published),
      updated_at = NOW()
     WHERE id = $4 RETURNING *`,
    [title, content, published, id],
  );
  return NextResponse.json(result.rows[0]);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const post = await db.query(`SELECT author_id FROM posts WHERE id = $1`, [
    id,
  ]);
  if (!post.rows[0])
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (post.rows[0].author_id !== session.user.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await db.query(`DELETE FROM posts WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
