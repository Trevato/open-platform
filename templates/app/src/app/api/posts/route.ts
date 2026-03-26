import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { headers } from "next/headers";
import db from "@/lib/db";

export async function GET() {
  const result = await db.query(
    `SELECT p.id, p.title, p.content, p.created_at, u.name as author, u.image as author_image
     FROM posts p JOIN "user" u ON p.author_id = u.id
     WHERE p.published = true
     ORDER BY p.created_at DESC
     LIMIT 50`,
  );
  return NextResponse.json(result.rows);
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { title, content } = body;
  if (!title?.trim())
    return NextResponse.json({ error: "Title required" }, { status: 400 });
  if (title.length > 200)
    return NextResponse.json(
      { error: "Title too long (max 200)" },
      { status: 400 },
    );
  if (content && content.length > 10000)
    return NextResponse.json(
      { error: "Content too long (max 10000)" },
      { status: 400 },
    );

  const result = await db.query(
    `INSERT INTO posts (title, content, author_id) VALUES ($1, $2, $3) RETURNING id`,
    [title.trim(), content?.trim() || null, session.user.id],
  );
  return NextResponse.json(result.rows[0], { status: 201 });
}
