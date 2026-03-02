import { auth } from "@/auth";
import { headers } from "next/headers";
import pool from "@/lib/db";
import { PostForm } from "@/app/components/post-form";
import { SignInButton, SignOutButton } from "@/app/components/sign-in-button";

interface Post {
  id: number;
  author_username: string;
  author_avatar: string | null;
  body: string;
  image_url: string | null;
  created_at: string;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000,
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  const result = await pool.query<Post>(
    "SELECT * FROM posts ORDER BY created_at DESC",
  );
  const posts = result.rows;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f5f5f5",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <header
        style={{
          background: "#fff",
          borderBottom: "1px solid #e0e0e0",
          padding: "14px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: "-0.02em",
          }}
        >
          social
        </h1>
        {session?.user ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 14, color: "#555" }}>
              {session.user.name}
            </span>
            <SignOutButton />
          </div>
        ) : (
          <SignInButton />
        )}
      </header>

      <div
        style={{
          maxWidth: 608,
          margin: "0 auto",
          padding: "24px 16px",
        }}
      >
        {session?.user && <PostForm />}

        {posts.length === 0 ? (
          <p
            style={{
              textAlign: "center",
              color: "#999",
              padding: "48px 0",
              fontSize: 15,
            }}
          >
            No posts yet. Be the first to share something.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {posts.map((post) => (
              <article
                key={post.id}
                style={{
                  background: "#fff",
                  border: "1px solid #e0e0e0",
                  borderRadius: 12,
                  padding: "18px 20px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 10,
                  }}
                >
                  {post.author_avatar ? (
                    <img
                      src={post.author_avatar}
                      alt=""
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background: "#e0e0e0",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 14,
                        fontWeight: 600,
                        color: "#888",
                      }}
                    >
                      {post.author_username[0]?.toUpperCase()}
                    </div>
                  )}
                  <div>
                    <span
                      style={{ fontSize: 14, fontWeight: 600, color: "#111" }}
                    >
                      {post.author_username}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        color: "#999",
                        marginLeft: 8,
                      }}
                    >
                      {timeAgo(post.created_at)}
                    </span>
                  </div>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: 15,
                    lineHeight: 1.55,
                    color: "#222",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {post.body}
                </p>
                {post.image_url && (
                  <img
                    src={post.image_url}
                    alt=""
                    style={{
                      marginTop: 12,
                      maxWidth: "100%",
                      borderRadius: 8,
                      border: "1px solid #eee",
                    }}
                  />
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
