import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { headers } from "next/headers";
import db from "@/lib/db";
import { CreatePostSchema } from "@/lib/schemas";
import { paginated, single, error } from "@/lib/api";

const PAGE_SIZE = 20;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim() || "";
  const status = sp.get("status") || "published";
  const sort = sp.get("sort") || "newest";
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (status === "published") {
    conditions.push(`p.published = true`);
  } else if (status === "draft") {
    conditions.push(`p.published = false`);
  }

  if (q) {
    conditions.push(`p.title ILIKE $${i}`);
    params.push(`%${q}%`);
    i++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const orderCol = sort === "oldest" ? "ASC" : "DESC";

  const countResult = await db.query(
    `SELECT count(*)::int FROM posts p ${where}`,
    params,
  );
  const total: number = countResult.rows[0].count;

  const result = await db.query(
    `SELECT p.id, p.title, p.content, p.published, p.created_at,
            u.name as author, u.image as author_image
     FROM posts p JOIN "user" u ON p.author_id = u.id
     ${where}
     ORDER BY p.created_at ${orderCol}
     LIMIT $${i} OFFSET $${i + 1}`,
    [...params, PAGE_SIZE, offset],
  );

  return paginated(result.rows, { total, limit: PAGE_SIZE, offset });
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return error("Unauthorized", "UNAUTHORIZED", 401);

  let body;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON", "INVALID_JSON", 400);
  }

  const parsed = CreatePostSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.errors[0]?.message || "Validation failed";
    return error(msg, "VALIDATION_ERROR", 400);
  }

  const { title, content } = parsed.data;
  const result = await db.query(
    `INSERT INTO posts (title, content, author_id) VALUES ($1, $2, $3)
     RETURNING id, title, content, published, created_at`,
    [title.trim(), content?.trim() || null, session.user.id],
  );
  return single(result.rows[0], 201);
}
