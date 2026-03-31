import { auth } from "@/auth";
import { headers } from "next/headers";
import db from "@/lib/db";
import { Header } from "@/app/components/header";
import { PostForm } from "@/app/components/post-form";
import { PostCard } from "@/app/components/post-card";
import { Pagination } from "@/app/components/pagination";
import { SearchBar } from "@/app/components/search-bar";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    sort?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() || "";
  const status = sp.status || "published";
  const sort = sp.sort || "newest";
  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const session = await auth.api.getSession({ headers: await headers() });

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
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const result = await db.query(
    `SELECT p.id, p.title, p.content, p.published, p.created_at,
            u.name as author, u.image as author_image
     FROM posts p JOIN "user" u ON p.author_id = u.id
     ${where}
     ORDER BY p.created_at ${orderCol}
     LIMIT $${i} OFFSET $${i + 1}`,
    [...params, PAGE_SIZE, offset],
  );
  const posts = result.rows;

  return (
    <>
      <Header />
      <main className="container">
        {session && <PostForm />}
        <div className="toolbar">
          <SearchBar />
          <select
            name="status"
            defaultValue={status}
            style={{ display: "none" }}
            aria-label="Filter by status"
          />
          <div style={{ display: "flex", gap: 8 }}>
            <a
              href={`/?${new URLSearchParams({ ...(q && { q }), ...(sort !== "newest" && { sort }), status: "published" }).toString()}`}
              className={`btn btn-ghost${status === "published" ? " active" : ""}`}
              style={{ fontSize: 12, padding: "4px 10px" }}
            >
              Published
            </a>
            <a
              href={`/?${new URLSearchParams({ ...(q && { q }), ...(sort !== "newest" && { sort }), status: "draft" }).toString()}`}
              className={`btn btn-ghost${status === "draft" ? " active" : ""}`}
              style={{ fontSize: 12, padding: "4px 10px" }}
            >
              Drafts
            </a>
            <a
              href={`/?${new URLSearchParams({ ...(q && { q }), ...(sort !== "newest" && { sort }), status: "all" }).toString()}`}
              className={`btn btn-ghost${status === "all" ? " active" : ""}`}
              style={{ fontSize: 12, padding: "4px 10px" }}
            >
              All
            </a>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <a
              href={`/?${new URLSearchParams({ ...(q && { q }), ...(status !== "published" && { status }), sort: "newest" }).toString()}`}
              className={`btn btn-ghost${sort === "newest" ? " active" : ""}`}
              style={{ fontSize: 12, padding: "4px 10px" }}
            >
              Newest
            </a>
            <a
              href={`/?${new URLSearchParams({ ...(q && { q }), ...(status !== "published" && { status }), sort: "oldest" }).toString()}`}
              className={`btn btn-ghost${sort === "oldest" ? " active" : ""}`}
              style={{ fontSize: 12, padding: "4px 10px" }}
            >
              Oldest
            </a>
          </div>
        </div>
        {posts.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        ) : (
          <div
            style={{
              textAlign: "center",
              padding: "80px 20px",
              color: "var(--text-muted)",
            }}
          >
            <p style={{ fontSize: 15, marginBottom: 8 }}>No posts yet</p>
            {!session && (
              <p style={{ fontSize: 13 }}>Sign in to create the first post</p>
            )}
          </div>
        )}
        {totalPages > 1 && (
          <Pagination page={page} totalPages={totalPages} params={sp} />
        )}
      </main>
    </>
  );
}
