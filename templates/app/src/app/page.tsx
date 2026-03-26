import { auth } from "@/auth";
import { headers } from "next/headers";
import db from "@/lib/db";
import { Header } from "@/app/components/header";
import { PostForm } from "@/app/components/post-form";
import { PostCard } from "@/app/components/post-card";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });

  const result = await db.query(
    `SELECT p.id, p.title, p.content, p.created_at, u.name as author, u.image as author_image
     FROM posts p JOIN "user" u ON p.author_id = u.id
     WHERE p.published = true
     ORDER BY p.created_at DESC
     LIMIT 50`,
  );
  const posts = result.rows;

  return (
    <>
      <Header />
      <main className="container">
        {session && <PostForm />}
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
      </main>
    </>
  );
}
