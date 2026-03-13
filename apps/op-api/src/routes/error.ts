import type { Response } from "express";

/**
 * Propagate upstream HTTP status codes and sanitize error messages.
 * Extracts user-facing details from Forgejo/Woodpecker JSON error bodies
 * while stripping internal function names and swagger URLs.
 */
export function handleErr(err: unknown, res: Response) {
  const raw = err instanceof Error ? err.message : "Unknown error";

  // Extract status code from structured error messages
  const match = raw.match(/(?:Forgejo|Woodpecker)\s+.+?(\d{3})/);
  const status = match ? parseInt(match[1]) : 500;

  // Try to extract meaningful details from JSON error body
  // Forgejo format: { errors: [...], message: "...", url: "swagger..." }
  const jsonMatch = raw.match(/\{[\s\S]*\}\s*$/);
  if (jsonMatch) {
    try {
      const body = JSON.parse(jsonMatch[0]);
      const errors = body.errors;
      // Prefer non-empty errors array (most specific)
      if (Array.isArray(errors) && errors.length > 0) {
        res.status(status).json({ error: errors.join("; ") });
        return;
      }
      // Fall back to message field (drop swagger url)
      if (body.message) {
        res.status(status).json({ error: body.message });
        return;
      }
    } catch {
      // Not valid JSON, fall through to raw message
    }
  }

  // Strip any remaining JSON artifacts from the prefix
  const prefix = raw.replace(/\s*\{[\s\S]*\}\s*$/, "").trim();
  res.status(status).json({ error: prefix || raw });
}
