"use client";

import { useState } from "react";

export function PostForm() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim() || null,
        }),
      });
      if (res.ok) {
        setTitle("");
        setContent("");
        window.location.reload();
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || `Failed to create post (${res.status})`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="card"
      style={{ padding: 20, marginBottom: 24 }}
    >
      <input
        type="text"
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={{
          width: "100%",
          padding: "8px 12px",
          background: "var(--bg-inset)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-btn)",
          color: "var(--text-primary)",
          marginBottom: 12,
        }}
      />
      <textarea
        placeholder="Write something..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        style={{
          width: "100%",
          padding: "8px 12px",
          background: "var(--bg-inset)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-btn)",
          color: "var(--text-primary)",
          resize: "vertical",
          marginBottom: 12,
        }}
      />
      {error && (
        <p
          style={{
            color: "var(--error, #ef4444)",
            marginBottom: 12,
            fontSize: 14,
          }}
        >
          {error}
        </p>
      )}
      <button
        type="submit"
        className="btn btn-accent"
        disabled={submitting || !title.trim()}
      >
        {submitting ? "Posting..." : "Post"}
      </button>
    </form>
  );
}
