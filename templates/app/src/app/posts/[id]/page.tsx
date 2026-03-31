import { notFound } from "next/navigation";
import db from "@/lib/db";
import { Header } from "@/app/components/header";
import type { Post } from "@/lib/schemas";

export default async function PostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await db.query(
    `SELECT p.id, p.title, p.content, p.published, p.created_at,
            u.name as author, u.image as author_image
     FROM posts p JOIN "user" u ON p.author_id = u.id WHERE p.id = $1`,
    [id],
  );
  const post: Post | undefined = result.rows[0];
  if (!post) notFound();

  return (
    <>
      <Header />
      <main className="container" style={{ maxWidth: 720 }}>
        <a
          href="/"
          style={{
            fontSize: 13,
            color: "var(--text-muted)",
            display: "inline-block",
            marginBottom: 24,
          }}
        >
          &larr; Back
        </a>
        <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 12 }}>
          {post.title}
        </h1>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 24,
            fontSize: 13,
            color: "var(--text-secondary)",
          }}
        >
          {post.author_image && (
            <img
              src={post.author_image}
              alt=""
              style={{ width: 24, height: 24, borderRadius: "50%" }}
            />
          )}
          <span>{post.author}</span>
          <span style={{ color: "var(--text-muted)" }}>
            {new Date(post.created_at).toLocaleDateString()}
          </span>
          {!post.published && (
            <span
              className="badge"
              style={{ background: "var(--accent-bg)", color: "var(--accent)" }}
            >
              Draft
            </span>
          )}
        </div>
        {post.content && (
          <div
            style={{
              fontSize: 15,
              lineHeight: 1.7,
              color: "var(--text-secondary)",
            }}
          >
            {post.content}
          </div>
        )}
      </main>
    </>
  );
}
