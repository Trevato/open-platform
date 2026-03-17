import { Elysia } from "elysia";

/**
 * Sanitize Forgejo/Woodpecker internal error messages into user-friendly versions.
 * Maps known internal message patterns to clean, actionable messages.
 */
const FORGEJO_MESSAGE_PATTERNS: Array<
  [RegExp, string | ((m: RegExpMatchArray) => string)]
> = [
  // File/object errors
  [
    /object does not exist \[id: , rel_path: (.+?)\]/,
    (m) => `File not found: ${m[1]}`,
  ],
  [
    /object does not exist \[id: (.+?), rel_path: ?\]/,
    (m) => `Reference not found: ${m[1]}`,
  ],
  [/object does not exist/, "Resource not found"],
  [
    /repository file already exists \[path: (.+?)\]/,
    (m) => `File already exists: ${m[1]}`,
  ],
  [/branch does not exist \[name: (.+?)\]/, (m) => `Branch not found: ${m[1]}`],
  // User/org errors
  [
    /user redirect does not exist \[name: (.+?)\]/,
    (m) => `Organization or user not found: ${m[1]}`,
  ],
  [/user does not exist \[.*?name: (.+?)\]/, (m) => `User not found: ${m[1]}`],
  [/user already exists/, "User already exists"],
  // PR merge errors
  [/\[Do\]: (.{1,30})/, (m) => `Invalid merge method: ${m[1]}`],
  // Date parsing errors
  [/parsing time "(.+?)" as ".*?"/, (m) => `Invalid date format: ${m[1]}`],
];

function sanitizeMessage(message: string): string {
  for (const [pattern, replacement] of FORGEJO_MESSAGE_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      return typeof replacement === "function"
        ? replacement(match)
        : replacement;
    }
  }
  return message;
}

/**
 * Status code overrides for specific sanitized messages.
 * Forgejo sometimes returns wrong HTTP status codes (e.g. 422 for duplicates).
 */
const STATUS_OVERRIDES: Array<[RegExp, number]> = [
  [/^User already exists$/i, 409],
];

/** Apply status overrides based on sanitized message content. */
function applyStatusOverride(status: number, message: string): number {
  for (const [pattern, override] of STATUS_OVERRIDES) {
    if (pattern.test(message)) return override;
  }
  return status;
}

/**
 * Parse upstream error messages to extract HTTP status codes and user-facing details.
 * Handles Forgejo/Woodpecker JSON error bodies while stripping internal URLs.
 */
function parseUpstreamError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : "Unknown error";

  // Extract status code from structured error messages like:
  //   "Forgejo API 404: ..."
  //   "Forgejo merge PR 422: ..."
  //   "Woodpecker API 500: ..."
  const match = raw.match(/(?:Forgejo|Woodpecker)\s+\S+(?:\s+\S+)*?\s+(\d{3})/);
  let status = match ? parseInt(match[1]) : 500;

  // Try to extract meaningful details from JSON error body
  const jsonMatch = raw.match(/\{[\s\S]*\}\s*$/);
  if (jsonMatch) {
    try {
      const body = JSON.parse(jsonMatch[0]);
      const errors = body.errors;
      if (Array.isArray(errors) && errors.length > 0) {
        const message = sanitizeMessage(errors.join("; "));
        return { status: applyStatusOverride(status, message), message };
      }
      if (body.message) {
        const message = sanitizeMessage(body.message);
        return { status: applyStatusOverride(status, message), message };
      }
    } catch {
      // Not valid JSON, fall through
    }
  }

  // Extract the text after the status code prefix
  const prefix = raw.replace(/\s*\{[\s\S]*\}\s*$/, "").trim();

  // Check if the prefix ends with a colon and empty body (e.g., "Woodpecker API 404:")
  const colonSuffix = prefix.match(/^(.+?)\s+(\d{3}):?\s*$/);
  if (colonSuffix) {
    const source = colonSuffix[1];
    const code = parseInt(colonSuffix[2]);
    // Provide meaningful fallback messages for empty upstream responses
    if (code === 404)
      return { status, message: `${source}: resource not found` };
    if (code === 405)
      return { status, message: `${source}: operation not allowed` };
    if (code === 409) return { status, message: `${source}: conflict` };
    if (code === 422)
      return { status, message: `${source}: validation failed` };
    return { status, message: `${source}: request failed (${code})` };
  }

  const sanitized = sanitizeMessage(prefix || raw || "Internal server error");
  return { status: applyStatusOverride(status, sanitized), message: sanitized };
}

export const errorPlugin = new Elysia({ name: "error-handler" })
  .onError(({ error, code }) => {
    // Transform Elysia validation errors to consistent {error: string} format
    if (code === "VALIDATION") {
      let detail = "Validation failed";
      try {
        const parsed = JSON.parse(error.message);
        const parts: string[] = [];
        if (parsed.property) parts.push(parsed.property);
        if (parsed.summary) parts.push(parsed.summary);
        if (parts.length > 0)
          detail = `Validation failed: ${parts.join(" — ")}`;
      } catch {
        if (error.message) detail = `Validation failed: ${error.message}`;
      }
      return new Response(JSON.stringify({ error: detail }), {
        status: 422,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle Elysia's built-in error codes with proper JSON responses
    if (code === "PARSE") {
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    if (code === "NOT_FOUND") {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { status, message } = parseUpstreamError(error);
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  })
  .as("global");
