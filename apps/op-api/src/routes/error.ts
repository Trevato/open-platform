import { Elysia } from "elysia";

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
  const status = match ? parseInt(match[1]) : 500;

  // Try to extract meaningful details from JSON error body
  const jsonMatch = raw.match(/\{[\s\S]*\}\s*$/);
  if (jsonMatch) {
    try {
      const body = JSON.parse(jsonMatch[0]);
      const errors = body.errors;
      if (Array.isArray(errors) && errors.length > 0) {
        return { status, message: errors.join("; ") };
      }
      if (body.message) {
        return { status, message: body.message };
      }
    } catch {
      // Not valid JSON, fall through
    }
  }

  const prefix = raw.replace(/\s*\{[\s\S]*\}\s*$/, "").trim();
  return { status, message: prefix || raw || "Internal server error" };
}

export const errorPlugin = new Elysia({ name: "error-handler" })
  .onError(({ error, code }) => {
    // Let Elysia's built-in validation errors pass through with native 422 format
    if (code === "VALIDATION") return;

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
