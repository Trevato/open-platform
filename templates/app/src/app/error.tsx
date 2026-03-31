"use client";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="container" style={{ paddingTop: 40 }}>
      <p style={{ color: "var(--error, #ef4444)", marginBottom: 12 }}>
        Something went wrong.
      </p>
      <button className="btn btn-ghost" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
