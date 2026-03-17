"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "50vh",
        color: "var(--text-primary)",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Something went wrong</h2>
        <p
          style={{
            fontSize: 14,
            color: "var(--text-secondary)",
            marginBottom: 16,
          }}
        >
          {error.message || "An unexpected error occurred."}
        </p>
        <button className="btn btn-sm btn-accent" onClick={reset}>
          Try again
        </button>
      </div>
    </div>
  );
}
