import { describe, expect, test } from "bun:test";
import { Elysia, t } from "elysia";
import { errorPlugin } from "../routes/error.js";

// Duplicate parseUpstreamError logic for unit testing (not exported from error.ts)
function parseUpstreamError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : "Unknown error";

  const match = raw.match(/(?:Forgejo|Woodpecker)\s+\S+(?:\s+\S+)*?\s+(\d{3})/);
  const status = match ? parseInt(match[1]) : 500;

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
      // Not valid JSON
    }
  }

  const prefix = raw.replace(/\s*\{[\s\S]*\}\s*$/, "").trim();
  return { status, message: prefix || raw || "Internal server error" };
}

describe("parseUpstreamError", () => {
  test("extracts 404 from Forgejo API error", () => {
    const result = parseUpstreamError(new Error("Forgejo API 404: not found"));
    expect(result.status).toBe(404);
  });

  test("extracts 502 from Woodpecker API error", () => {
    const result = parseUpstreamError(
      new Error("Woodpecker API 502: bad gateway"),
    );
    expect(result.status).toBe(502);
  });

  test("extracts 422 from multi-word prefix", () => {
    const result = parseUpstreamError(
      new Error('Forgejo merge PR 422: {"message":"merge conflict"}'),
    );
    expect(result.status).toBe(422);
    expect(result.message).toBe("merge conflict");
  });

  test("defaults to 500 for unrecognized errors", () => {
    const result = parseUpstreamError(new Error("Something broke"));
    expect(result.status).toBe(500);
    expect(result.message).toBe("Something broke");
  });

  test("extracts message from JSON body", () => {
    const result = parseUpstreamError(
      new Error('Forgejo API 409: {"message":"name already taken"}'),
    );
    expect(result.status).toBe(409);
    expect(result.message).toBe("name already taken");
  });

  test("extracts errors array from JSON body", () => {
    const result = parseUpstreamError(
      new Error(
        'Forgejo API 422: {"errors":["field1 required","field2 invalid"]}',
      ),
    );
    expect(result.status).toBe(422);
    expect(result.message).toBe("field1 required; field2 invalid");
  });

  test("handles non-Error string", () => {
    const result = parseUpstreamError("string error");
    expect(result.status).toBe(500);
    expect(result.message).toBe("Unknown error");
  });

  test("handles undefined", () => {
    const result = parseUpstreamError(undefined);
    expect(result.status).toBe(500);
    expect(result.message).toBe("Unknown error");
  });

  test("handles null", () => {
    const result = parseUpstreamError(null);
    expect(result.status).toBe(500);
    expect(result.message).toBe("Unknown error");
  });

  test("strips Forgejo URL prefix from message", () => {
    const result = parseUpstreamError(
      new Error(
        'Forgejo API 404: {"message":"repo not found","url":"https://forgejo.example.com/api/v1/repos/system/foo"}',
      ),
    );
    expect(result.status).toBe(404);
    expect(result.message).toBe("repo not found");
    expect(result.message).not.toContain("forgejo");
  });

  test("handles nested JSON errors", () => {
    const result = parseUpstreamError(
      new Error(
        'Forgejo API 422: {"message":"validation failed","errors":["name too long","slug invalid"]}',
      ),
    );
    expect(result.status).toBe(422);
    // errors array takes precedence over message
    expect(result.message).toBe("name too long; slug invalid");
  });

  test("handles empty JSON body", () => {
    const result = parseUpstreamError(new Error("Forgejo API 400: {}"));
    expect(result.status).toBe(400);
    // Falls through to prefix extraction
    expect(result.message).toBe("Forgejo API 400:");
  });

  test("handles empty errors array", () => {
    const result = parseUpstreamError(
      new Error('Forgejo API 400: {"errors":[]}'),
    );
    expect(result.status).toBe(400);
    // Empty array is not length > 0, falls through to prefix
    expect(result.message).toBe("Forgejo API 400:");
  });
});

describe("error handler integration", () => {
  const app = new Elysia()
    .use(errorPlugin)
    .get("/throw-404", () => {
      throw new Error('Forgejo API 404: {"message":"not found"}');
    })
    .get("/throw-409", () => {
      throw new Error('Forgejo API 409: {"message":"conflict"}');
    })
    .get("/throw-422", () => {
      throw new Error('Forgejo API 422: {"message":"validation"}');
    })
    .get("/throw-unknown", () => {
      throw new Error("Something broke");
    });

  test("propagates 404 from Forgejo error", async () => {
    const res = await app.handle(new Request("http://localhost/throw-404"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not found");
  });

  test("propagates 409 from Forgejo error", async () => {
    const res = await app.handle(new Request("http://localhost/throw-409"));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("conflict");
  });

  test("propagates 422 from Forgejo error", async () => {
    const res = await app.handle(new Request("http://localhost/throw-422"));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("validation");
  });

  test("defaults to 500 for unknown errors", async () => {
    const res = await app.handle(new Request("http://localhost/throw-unknown"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Something broke");
  });

  test("returns 404 JSON for unknown routes", async () => {
    const res = await app.handle(new Request("http://localhost/nonexistent"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Not found");
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  test("returns 400 JSON for malformed JSON body", async () => {
    const parseApp = new Elysia()
      .use(errorPlugin)
      .post("/submit", ({ body }) => body, {
        body: t.Object({ name: t.String() }),
      });

    const res = await parseApp.handle(
      new Request("http://localhost/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not valid json{{{",
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid JSON");
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});
