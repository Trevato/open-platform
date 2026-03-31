"use client";

import { useState } from "react";
import { CreatePostSchema } from "@/lib/schemas";

export function PostForm() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const parsed = CreatePostSchema.safeParse({
      title: title.trim(),
      content: content.trim() || null,
    });
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message || "Validation failed");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (res.ok) {
        setTitle("");
        setContent("");
        window.location.reload();
      } else {
        const data = await res.json().catch(() => null);
        setError(
          data?.error?.message ||
            data?.error ||
            `Failed to create post (${res.status})`,
        );
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
        className="input"
        style={{ width: "100%", marginBottom: 12 }}
      />
      <textarea
        placeholder="Write something..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        className="input"
        style={{ width: "100%", resize: "vertical", marginBottom: 12 }}
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
