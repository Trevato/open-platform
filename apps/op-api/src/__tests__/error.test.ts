import { describe, expect, test } from "bun:test";
import { Elysia, t } from "elysia";
import { errorPlugin } from "../routes/error.js";

// Duplicate parseUpstreamError + sanitization logic for unit testing (not exported from error.ts)
const FORGEJO_MESSAGE_PATTERNS: Array<
  [RegExp, string | ((m: RegExpMatchArray) => string)]
> = [
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
  [
    /user redirect does not exist \[name: (.+?)\]/,
    (m) => `Organization or user not found: ${m[1]}`,
  ],
  [/user does not exist \[.*?name: (.+?)\]/, (m) => `User not found: ${m[1]}`],
  [/user already exists/, "User already exists"],
  [/\[Do\]: (.{1,30})/, (m) => `Invalid merge method: ${m[1]}`],
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

const STATUS_OVERRIDES: Array<[RegExp, number]> = [
  [/^User already exists$/i, 409],
];

function applyStatusOverride(status: number, message: string): number {
  for (const [pattern, override] of STATUS_OVERRIDES) {
    if (pattern.test(message)) return override;
  }
  return status;
}

function parseUpstreamError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : "Unknown error";

  const match = raw.match(/(?:Forgejo|Woodpecker)\s+\S+(?:\s+\S+)*?\s+(\d{3})/);
  let status = match ? parseInt(match[1]) : 500;

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
      // Not valid JSON
    }
  }

  const prefix = raw.replace(/\s*\{[\s\S]*\}\s*$/, "").trim();

  const colonSuffix = prefix.match(/^(.+?)\s+(\d{3}):?\s*$/);
  if (colonSuffix) {
    const source = colonSuffix[1];
    const code = parseInt(colonSuffix[2]);
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

  test("handles empty JSON body with fallback message", () => {
    const result = parseUpstreamError(new Error("Forgejo API 400: {}"));
    expect(result.status).toBe(400);
    // Falls through to colonSuffix handler
    expect(result.message).toBe("Forgejo API: request failed (400)");
  });

  test("handles empty errors array with fallback message", () => {
    const result = parseUpstreamError(
      new Error('Forgejo API 400: {"errors":[]}'),
    );
    expect(result.status).toBe(400);
    // Empty array falls through to colonSuffix handler
    expect(result.message).toBe("Forgejo API: request failed (400)");
  });

  // ── Empty body fallback messages ────────────────────────────────────────

  test("Woodpecker 404 with empty body -> fallback message", () => {
    const result = parseUpstreamError(new Error("Woodpecker API 404:"));
    expect(result.status).toBe(404);
    expect(result.message).toBe("Woodpecker API: resource not found");
  });

  test("Forgejo merge PR 405 with empty body -> fallback message", () => {
    const result = parseUpstreamError(new Error("Forgejo merge PR 405:"));
    expect(result.status).toBe(405);
    expect(result.message).toBe("Forgejo merge PR: operation not allowed");
  });

  test("Woodpecker API 400 with empty body -> fallback message", () => {
    const result = parseUpstreamError(new Error("Woodpecker API 400:"));
    expect(result.status).toBe(400);
    expect(result.message).toBe("Woodpecker API: request failed (400)");
  });

  // ── Forgejo message sanitization ───────────────────────────────────────

  test("sanitizes 'object does not exist' with rel_path", () => {
    const result = parseUpstreamError(
      new Error(
        'Forgejo API 404: {"message":"object does not exist [id: , rel_path: README.md]"}',
      ),
    );
    expect(result.status).toBe(404);
    expect(result.message).toBe("File not found: README.md");
  });

  test("sanitizes 'object does not exist' with bad ref", () => {
    const result = parseUpstreamError(
      new Error(
        'Forgejo API 404: {"message":"object does not exist [id: nonexistentbranch99, rel_path: ]"}',
      ),
    );
    expect(result.status).toBe(404);
    expect(result.message).toBe("Reference not found: nonexistentbranch99");
  });

  test("sanitizes 'repository file already exists'", () => {
    const result = parseUpstreamError(
      new Error(
        'Forgejo API 422: {"message":"repository file already exists [path: src/index.ts]"}',
      ),
    );
    expect(result.status).toBe(422);
    expect(result.message).toBe("File already exists: src/index.ts");
  });

  test("sanitizes 'branch does not exist'", () => {
    const result = parseUpstreamError(
      new Error(
        'Forgejo API 404: {"message":"branch does not exist [name: feat/missing]"}',
      ),
    );
    expect(result.status).toBe(404);
    expect(result.message).toBe("Branch not found: feat/missing");
  });

  test("sanitizes 'user redirect does not exist'", () => {
    const result = parseUpstreamError(
      new Error(
        'Forgejo API 404: {"message":"user redirect does not exist [name: fakeorg]"}',
      ),
    );
    expect(result.status).toBe(404);
    expect(result.message).toBe("Organization or user not found: fakeorg");
  });

  test("sanitizes '[Do]: Invalid' merge method error", () => {
    const result = parseUpstreamError(
      new Error(
        'Forgejo merge PR 422: {"message":"[Do]: Invalid merge method"}',
      ),
    );
    expect(result.status).toBe(422);
    expect(result.message).toBe("Invalid merge method: Invalid merge method");
  });

  test("sanitizes date parsing error", () => {
    const result = parseUpstreamError(
      new Error(
        'Forgejo API 422: {"message":"parsing time \\"not-a-dateT00:00:00Z\\" as \\"2006-01-02T15:04:05Z07:00\\""}',
      ),
    );
    expect(result.status).toBe(422);
    expect(result.message).toBe("Invalid date format: not-a-dateT00:00:00Z");
  });

  test("sanitizes 'user already exists' and overrides status to 409", () => {
    const result = parseUpstreamError(
      new Error(
        'Forgejo API 422: {"message":"user already exists [name: testuser]"}',
      ),
    );
    expect(result.status).toBe(409);
    expect(result.message).toBe("User already exists");
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
    })
    .get("/throw-empty-woodpecker-404", () => {
      throw new Error("Woodpecker API 404:");
    })
    .get("/throw-forgejo-merge-405", () => {
      throw new Error("Forgejo merge PR 405:");
    })
    .get("/throw-forgejo-file-not-found", () => {
      throw new Error(
        'Forgejo API 404: {"message":"object does not exist [id: , rel_path: config.yaml]"}',
      );
    })
    .get("/throw-forgejo-user-redirect", () => {
      throw new Error(
        'Forgejo API 404: {"message":"user redirect does not exist [name: ghostorg]"}',
      );
    })
    .get("/throw-forgejo-user-exists", () => {
      throw new Error(
        'Forgejo API 422: {"message":"user already exists [name: testuser]"}',
      );
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

  test("Woodpecker empty 404 gets fallback message", async () => {
    const res = await app.handle(
      new Request("http://localhost/throw-empty-woodpecker-404"),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Woodpecker API: resource not found");
  });

  test("Forgejo merge 405 gets fallback message", async () => {
    const res = await app.handle(
      new Request("http://localhost/throw-forgejo-merge-405"),
    );
    expect(res.status).toBe(405);
    const body = await res.json();
    expect(body.error).toBe("Forgejo merge PR: operation not allowed");
  });

  test("Forgejo file not found is sanitized", async () => {
    const res = await app.handle(
      new Request("http://localhost/throw-forgejo-file-not-found"),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("File not found: config.yaml");
    expect(body.error).not.toContain("object does not exist");
  });

  test("Forgejo user redirect error is sanitized", async () => {
    const res = await app.handle(
      new Request("http://localhost/throw-forgejo-user-redirect"),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Organization or user not found: ghostorg");
    expect(body.error).not.toContain("redirect");
  });

  test("Forgejo 422 'user already exists' mapped to 409", async () => {
    const res = await app.handle(
      new Request("http://localhost/throw-forgejo-user-exists"),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("User already exists");
  });
});
