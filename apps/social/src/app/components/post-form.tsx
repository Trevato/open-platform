"use client";

import { useRouter } from "next/navigation";
import { useState, useRef } from "react";

export function PostForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);

    try {
      const formData = new FormData(e.currentTarget);
      const res = await fetch("/api/posts", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to create post");
        return;
      }

      formRef.current?.reset();
      setFileName(null);
      router.refresh();
    } catch {
      alert("Failed to create post");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      style={{
        width: "100%",
        maxWidth: 560,
        padding: "20px 24px",
        background: "#fff",
        border: "1px solid #e0e0e0",
        borderRadius: 12,
        marginBottom: 32,
      }}
    >
      <textarea
        name="body"
        placeholder="What's on your mind?"
        required
        rows={3}
        style={{
          width: "100%",
          padding: "12px 14px",
          border: "1px solid #ddd",
          borderRadius: 8,
          fontSize: 15,
          fontFamily: "inherit",
          resize: "vertical",
          outline: "none",
          boxSizing: "border-box",
          lineHeight: 1.5,
        }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 12,
          gap: 12,
        }}
      >
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            cursor: "pointer",
            fontSize: 14,
            color: "#666",
          }}
        >
          <input
            type="file"
            name="image"
            accept="image/*"
            onChange={(e) => setFileName(e.target.files?.[0]?.name || null)}
            style={{ display: "none" }}
          />
          <span
            style={{
              padding: "6px 12px",
              border: "1px solid #ddd",
              borderRadius: 6,
              fontSize: 13,
              color: "#555",
              background: "#fafafa",
            }}
          >
            {fileName || "Attach image"}
          </span>
        </label>
        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: "8px 20px",
            background: submitting ? "#999" : "#111",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            cursor: submitting ? "not-allowed" : "pointer",
            transition: "background 0.15s",
          }}
        >
          {submitting ? "Posting..." : "Post"}
        </button>
      </div>
    </form>
  );
}
