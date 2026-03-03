"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SubmitScore({ gameSlug }: { gameSlug: string }) {
  const [score, setScore] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    personalBest: number;
    rank: number;
  } | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!score || submitting) return;

    setSubmitting(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch(`/api/games/${gameSlug}/scores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score: parseInt(score, 10) }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to submit score");
        return;
      }

      const data = await res.json();
      setResult({ personalBest: data.personalBest, rank: data.rank });
      setScore("");
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        background: "#1a1a24",
        borderRadius: 12,
        padding: 24,
        border: "1px solid #2a2a3a",
      }}
    >
      <h3
        style={{
          margin: "0 0 16px",
          fontSize: 16,
          fontWeight: 600,
          color: "#e2e2e8",
        }}
      >
        Submit Score
      </h3>
      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", gap: 12, alignItems: "flex-end" }}
      >
        <div style={{ flex: 1 }}>
          <label
            htmlFor="score-input"
            style={{
              display: "block",
              fontSize: 13,
              color: "#888",
              marginBottom: 6,
            }}
          >
            Your score
          </label>
          <input
            id="score-input"
            type="number"
            min="0"
            value={score}
            onChange={(e) => setScore(e.target.value)}
            placeholder="Enter your score"
            required
            style={{
              width: "100%",
              padding: "10px 14px",
              background: "#12121a",
              border: "1px solid #2a2a3a",
              borderRadius: 8,
              color: "#e2e2e8",
              fontSize: 14,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: "10px 24px",
            background: submitting
              ? "#333"
              : "linear-gradient(135deg, #6c5ce7, #a855f7)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: submitting ? "not-allowed" : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {submitting ? "Submitting..." : "Submit"}
        </button>
      </form>

      {error && (
        <p style={{ color: "#ef4444", fontSize: 13, marginTop: 12 }}>
          {error}
        </p>
      )}

      {result && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            background: "#12121a",
            borderRadius: 8,
            border: "1px solid #2a2a3a",
            display: "flex",
            gap: 24,
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>
              Your Rank
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#a855f7" }}>
              #{result.rank}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>
              Personal Best
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#22c55e" }}>
              {result.personalBest.toLocaleString()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
