export default function NotFound() {
  return (
    <main className="container" style={{ paddingTop: 40, textAlign: "center" }}>
      <p style={{ fontSize: 15, marginBottom: 12, color: "var(--text-muted)" }}>
        Page not found
      </p>
      <a href="/" className="btn btn-ghost">
        Go home
      </a>
    </main>
  );
}
