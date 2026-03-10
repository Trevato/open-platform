"use client";

export default function TerminalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="terminal-page" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", color: "#cdd6f4" }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Terminal failed to load</h2>
        <p style={{ fontSize: 14, color: "#a6adc8", marginBottom: 16 }}>
          {error.message || "An unexpected error occurred."}
        </p>
        <button className="btn btn-sm btn-ghost" onClick={reset}>
          Try again
        </button>
      </div>
    </div>
  );
}
