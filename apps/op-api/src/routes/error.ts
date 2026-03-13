import type { Response } from "express";

/**
 * Propagate upstream HTTP status codes and sanitize error messages.
 * Strips Forgejo internal details (swagger URLs, function names) from client responses.
 */
export function handleErr(err: unknown, res: Response) {
  const raw = err instanceof Error ? err.message : "Unknown error";

  // Extract status code from structured error messages
  const match = raw.match(/(?:Forgejo|Woodpecker)\s+.+?(\d{3})/);
  const status = match ? parseInt(match[1]) : 500;

  // Sanitize: strip Forgejo swagger URLs and internal function references
  const message = raw
    .replace(/,?\s*message=\S+/g, "")
    .replace(/,?\s*url=\S+/g, "")
    .replace(/\s*\{[^}]*\}\s*$/g, "")
    .trim();

  res.status(status).json({ error: message });
}
