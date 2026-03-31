export function Pagination({
  page,
  totalPages,
  params,
}: {
  page: number;
  totalPages: number;
  params: Record<string, string | undefined>;
}) {
  function href(p: number) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v && k !== "page") sp.set(k, v);
    }
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `/?${qs}` : "/";
  }

  return (
    <nav className="pagination">
      {page > 1 ? (
        <a href={href(page - 1)} className="btn btn-ghost">
          Previous
        </a>
      ) : (
        <span />
      )}
      <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
        {page} / {totalPages}
      </span>
      {page < totalPages ? (
        <a href={href(page + 1)} className="btn btn-ghost">
          Next
        </a>
      ) : (
        <span />
      )}
    </nav>
  );
}
