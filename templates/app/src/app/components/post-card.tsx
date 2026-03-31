import type { Post } from "@/lib/schemas";

function timeAgo(date: string) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function PostCard({ post }: { post: Post }) {
  return (
    <article className="card" style={{ padding: 20 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 12,
        }}
      >
        {post.author_image && (
          <img
            src={post.author_image}
            alt=""
            style={{ width: 24, height: 24, borderRadius: "50%" }}
          />
        )}
        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          {post.author}
        </span>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {timeAgo(post.created_at)}
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
      <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>
        <a href={`/posts/${post.id}`} style={{ color: "inherit" }}>
          {post.title}
        </a>
      </h2>
      {post.content && (
        <p
          style={{
            fontSize: 14,
            color: "var(--text-secondary)",
            lineHeight: 1.6,
          }}
        >
          {post.content}
        </p>
      )}
    </article>
  );
}
