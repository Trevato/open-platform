import { describe, expect, test } from "bun:test";
import { Elysia, t } from "elysia";
import { errorPlugin } from "../routes/error.js";
import { reposPlugin } from "../routes/repos.js";
import { orgsPlugin } from "../routes/orgs.js";
import { branchesPlugin } from "../routes/branches.js";
import { filesPlugin } from "../routes/files.js";
import { prsPlugin } from "../routes/prs.js";
import { issuesPlugin } from "../routes/issues.js";

// ── Test apps ───────────────────────────────────────────────────────────
// Route plugins depend on ForgejoClient (no database). ForgejoClient calls
// will fail without a running Forgejo instance — we're testing framework
// behavior (validation, auth, error handling) not service logic.

// App WITHOUT errorPlugin — Elysia's native validation returns 422
const validationApp = new Elysia().group("/api/v1", (app) =>
  app
    .use(reposPlugin)
    .use(orgsPlugin)
    .use(branchesPlugin)
    .use(filesPlugin)
    .use(prsPlugin)
    .use(issuesPlugin),
);

// App WITH errorPlugin — tests auth + error response format
const app = new Elysia()
  .use(errorPlugin)
  .group("/api/v1", (app) =>
    app
      .use(reposPlugin)
      .use(orgsPlugin)
      .use(branchesPlugin)
      .use(filesPlugin)
      .use(prsPlugin)
      .use(issuesPlugin),
  );

/** Build a request with auth and JSON content-type */
function req(method: string, path: string, body?: unknown): Request {
  const opts: RequestInit = {
    method,
    headers: {
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
    },
  };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  return new Request(`http://localhost${path}`, opts);
}

// ── Schema validation ───────────────────────────────────────────────────
// Elysia validates body schemas at the parse step (before onBeforeHandle).
// Without errorPlugin intercepting, invalid bodies return 422 natively.
// This proves the TypeBox schemas are correctly defined on each route.

describe("schema validation", () => {
  test("POST /orgs with empty body -> 422", async () => {
    const res = await validationApp.handle(req("POST", "/api/v1/orgs", {}));
    expect(res.status).toBe(422);
  });

  test("POST /orgs with name too short -> 422", async () => {
    const res = await validationApp.handle(
      req("POST", "/api/v1/orgs", { name: "" }),
    );
    expect(res.status).toBe(422);
  });

  test("POST /repos/:org with empty body -> 422", async () => {
    const res = await validationApp.handle(
      req("POST", "/api/v1/repos/system", {}),
    );
    expect(res.status).toBe(422);
  });

  test("POST /repos/:org with wrong type for private -> 422", async () => {
    const res = await validationApp.handle(
      req("POST", "/api/v1/repos/system", {
        name: "test",
        private: "yes",
      }),
    );
    expect(res.status).toBe(422);
  });

  test("POST /branches/:org/:repo with empty body -> 422", async () => {
    const res = await validationApp.handle(
      req("POST", "/api/v1/branches/system/template", {}),
    );
    expect(res.status).toBe(422);
  });

  test("POST /prs/:org/:repo with empty body -> 422", async () => {
    const res = await validationApp.handle(
      req("POST", "/api/v1/prs/system/template", {}),
    );
    expect(res.status).toBe(422);
  });

  test("POST /prs/:org/:repo missing required head -> 422", async () => {
    const res = await validationApp.handle(
      req("POST", "/api/v1/prs/system/template", { title: "My PR" }),
    );
    expect(res.status).toBe(422);
  });

  test("POST /issues/:org/:repo with empty body -> 422", async () => {
    const res = await validationApp.handle(
      req("POST", "/api/v1/issues/system/template", {}),
    );
    expect(res.status).toBe(422);
  });

  test("POST /issues/:org/:repo with wrong type for labels -> 422", async () => {
    const res = await validationApp.handle(
      req("POST", "/api/v1/issues/system/template", {
        title: "Bug",
        labels: ["not-a-number"],
      }),
    );
    expect(res.status).toBe(422);
  });

  test("POST /issues/:org/:repo/labels with empty body -> 422", async () => {
    const res = await validationApp.handle(
      req("POST", "/api/v1/issues/system/template/labels", {}),
    );
    expect(res.status).toBe(422);
  });

  test("POST /issues/:org/:repo/milestones with empty body -> 422", async () => {
    const res = await validationApp.handle(
      req("POST", "/api/v1/issues/system/template/milestones", {}),
    );
    expect(res.status).toBe(422);
  });

  test("PUT /files/:org/:repo/* with empty body -> 422", async () => {
    const res = await validationApp.handle(
      req("PUT", "/api/v1/files/system/template/README.md", {}),
    );
    expect(res.status).toBe(422);
  });

  test("PUT /files/:org/:repo/* missing required message -> 422", async () => {
    const res = await validationApp.handle(
      req("PUT", "/api/v1/files/system/template/README.md", {
        content: "hello",
      }),
    );
    expect(res.status).toBe(422);
  });

  test("POST /repos/:org/:repo/generate with empty body -> 422", async () => {
    const res = await validationApp.handle(
      req("POST", "/api/v1/repos/system/template/generate", {}),
    );
    expect(res.status).toBe(422);
  });

  test("POST /prs/:org/:repo/:number/comments with empty body -> 422", async () => {
    const res = await validationApp.handle(
      req("POST", "/api/v1/prs/system/template/1/comments", {}),
    );
    expect(res.status).toBe(422);
  });

  test("POST /issues/:org/:repo/:number/comments with empty body -> 422", async () => {
    const res = await validationApp.handle(
      req("POST", "/api/v1/issues/system/template/1/comments", {}),
    );
    expect(res.status).toBe(422);
  });

  test("POST /orgs without Content-Type -> 422", async () => {
    const res = await validationApp.handle(
      new Request("http://localhost/api/v1/orgs", {
        method: "POST",
        headers: { Authorization: "Bearer test-token" },
      }),
    );
    expect(res.status).toBe(422);
  });
});

// ── Validation with error plugin ──────────────────────────────────────
// Verify that the errorPlugin passes through validation errors (doesn't eat them)

describe("schema validation with error plugin", () => {
  test("POST /orgs with empty body -> 422 (not 500)", async () => {
    const res = await app.handle(req("POST", "/api/v1/orgs", {}));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.type).toBe("validation");
  });

  test("POST /repos/:org with empty body -> 422 (not 500)", async () => {
    const res = await app.handle(req("POST", "/api/v1/repos/system", {}));
    expect(res.status).toBe(422);
  });

  test("POST /prs/:org/:repo with empty body -> 422 (not 500)", async () => {
    const res = await app.handle(
      req("POST", "/api/v1/prs/system/template", {}),
    );
    expect(res.status).toBe(422);
  });
});

// ── Validation response structure ───────────────────────────────────────

describe("validation error structure", () => {
  test("422 response is JSON with validation details", async () => {
    const res = await validationApp.handle(req("POST", "/api/v1/orgs", {}));
    expect(res.status).toBe(422);
    const ct = res.headers.get("content-type");
    expect(ct).toContain("application/json");
    const body = await res.json();
    expect(body.type).toBe("validation");
    expect(body.on).toBe("body");
  });

  test("422 response includes property path", async () => {
    const res = await validationApp.handle(req("POST", "/api/v1/orgs", {}));
    const body = await res.json();
    expect(body.property).toBe("/name");
  });

  test("422 response includes human-readable summary", async () => {
    const res = await validationApp.handle(req("POST", "/api/v1/orgs", {}));
    const body = await res.json();
    expect(typeof body.summary).toBe("string");
    expect(body.summary.length).toBeGreaterThan(0);
  });
});

// ── Null byte rejection ─────────────────────────────────────────────────
// The null byte guard is defined in index.ts as onBeforeHandle. We recreate
// it here to test in isolation without starting the full server.
//
// Note: %00 in a path segment may cause Elysia's router to not match,
// so we test via query strings and path parameters where the route matches
// before onBeforeHandle runs.

describe("null byte rejection", () => {
  const guardedApp = new Elysia()
    .onBeforeHandle(({ request, set }) => {
      if (request.url.includes("%00") || request.url.includes("\0")) {
        set.status = 400;
        return { error: "Invalid characters in request" };
      }
    })
    .get("/test", () => "ok")
    .get("/test/:id", ({ params }) => ({ id: params.id }));

  test("rejects %00 in query string", async () => {
    const res = await guardedApp.handle(
      new Request("http://localhost/test?q=%00"),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid characters");
  });

  test("rejects %00 in path parameter", async () => {
    const res = await guardedApp.handle(
      new Request("http://localhost/test/abc%00def"),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid characters");
  });

  test("allows normal URLs", async () => {
    const res = await guardedApp.handle(new Request("http://localhost/test"));
    expect(res.status).toBe(200);
  });

  test("allows URLs with encoded characters that are not null", async () => {
    const res = await guardedApp.handle(
      new Request("http://localhost/test?q=%20hello"),
    );
    expect(res.status).toBe(200);
  });

  test("allows path parameters without null bytes", async () => {
    const res = await guardedApp.handle(
      new Request("http://localhost/test/valid-id"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("valid-id");
  });
});

// ── Error response format ───────────────────────────────────────────────
// Upstream errors (thrown by handlers) are caught by errorPlugin and
// normalized to { error: string } with correct HTTP status codes.

describe("error response format", () => {
  const errorApp = new Elysia()
    .use(errorPlugin)
    .get("/throw-forgejo-404", () => {
      throw new Error('Forgejo API 404: {"message":"Resource not found"}');
    })
    .get("/throw-generic", () => {
      throw new Error("Connection refused");
    })
    .get("/throw-forgejo-422", () => {
      throw new Error(
        'Forgejo API 422: {"errors":["name too long","slug invalid"]}',
      );
    });

  test("Forgejo 404 -> { error: string } shape", async () => {
    const res = await errorApp.handle(
      new Request("http://localhost/throw-forgejo-404"),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(typeof body.error).toBe("string");
    expect(body.error).toBeTruthy();
    // Should not leak internal Forgejo URLs
    expect(body.error).not.toContain("forgejo.");
  });

  test("generic error -> { error: string } shape", async () => {
    const res = await errorApp.handle(
      new Request("http://localhost/throw-generic"),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(typeof body.error).toBe("string");
    expect(body.error).toBeTruthy();
  });

  test("error response is always JSON", async () => {
    const res = await errorApp.handle(
      new Request("http://localhost/throw-generic"),
    );
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  test("Forgejo 422 with errors array -> joined string", async () => {
    const res = await errorApp.handle(
      new Request("http://localhost/throw-forgejo-422"),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("name too long; slug invalid");
  });

  test("error response has no extra keys beyond error", async () => {
    const res = await errorApp.handle(
      new Request("http://localhost/throw-forgejo-404"),
    );
    const body = await res.json();
    const keys = Object.keys(body);
    expect(keys).toEqual(["error"]);
  });
});

// ── Auth enforcement edge cases ─────────────────────────────────────────
// The authPlugin extracts Bearer token via @elysiajs/bearer and validates
// against Forgejo. Without a running Forgejo, all tokens are invalid -> 401.
// Auth returns early via onBeforeHandle, so it runs before errorPlugin.

describe("auth enforcement", () => {
  test("no Authorization header -> 401", async () => {
    const res = await app.handle(new Request("http://localhost/api/v1/orgs"));
    expect(res.status).toBe(401);
  });

  test("empty Bearer token -> 401", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/v1/orgs", {
        headers: { Authorization: "Bearer " },
      }),
    );
    expect(res.status).toBe(401);
  });

  test("non-Bearer scheme -> 401", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/v1/orgs", {
        headers: { Authorization: "token abc123" },
      }),
    );
    expect(res.status).toBe(401);
  });

  test("Basic auth scheme -> 401", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/v1/orgs", {
        headers: { Authorization: "Basic dXNlcjpwYXNz" },
      }),
    );
    expect(res.status).toBe(401);
  });

  test("401 response has { error: string } shape", async () => {
    const res = await app.handle(new Request("http://localhost/api/v1/orgs"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(typeof body.error).toBe("string");
    expect(body.error).toBeTruthy();
  });

  test("401 response is JSON", async () => {
    const res = await app.handle(new Request("http://localhost/api/v1/orgs"));
    expect(res.status).toBe(401);
    const ct = res.headers.get("content-type");
    expect(ct).toContain("application/json");
  });

  test("auth checked on all GET routes", async () => {
    const getRoutes = [
      "/api/v1/repos/system",
      "/api/v1/branches/system/template",
      "/api/v1/prs/system/template",
      "/api/v1/issues/system/template",
      "/api/v1/files/system/template/README.md",
    ];
    for (const path of getRoutes) {
      const res = await app.handle(new Request(`http://localhost${path}`));
      expect(res.status).toBe(401);
    }
  });

  test("auth checked on DELETE routes", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/v1/repos/system/template", {
        method: "DELETE",
      }),
    );
    expect(res.status).toBe(401);
  });

  test("auth checked on POST routes (valid body)", async () => {
    // Send a valid body to ensure we get past schema validation to auth
    const res = await app.handle(
      new Request("http://localhost/api/v1/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "test-org" }),
      }),
    );
    // Should be 401 (no auth), not 422 (validation) or 500
    expect(res.status).toBe(401);
  });
});
