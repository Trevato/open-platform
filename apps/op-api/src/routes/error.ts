import type { Response } from "express";

/**
 * Propagate Forgejo/Woodpecker HTTP status codes from error messages.
 * Pattern: "Forgejo API 404: ..." or "Forgejo delete branch 403: ..."
 */
export function handleErr(err: unknown, res: Response) {
  const message = err instanceof Error ? err.message : "Unknown error";
  const match = message.match(/(?:Forgejo|Woodpecker)\s+.+?(\d{3})/);
  const status = match ? parseInt(match[1]) : 500;
  res.status(status).json({ error: message });
}
