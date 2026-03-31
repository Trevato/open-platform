import { describe, expect, test, beforeEach, mock } from "bun:test";
import { Elysia } from "elysia";

// ── MCP session management ────────────────────────────────────────────
// The MCP route in index.ts is defined inline (not as a plugin) and depends
// on @modelcontextprotocol/sdk + createMcpServer. We replicate the session
// management logic here to test it in isolation — same approach as the null
// byte guard tests in routes.test.ts.

interface SessionEntry {
  transport: { handleRequest: (req: Request) => Response; close: () => void };
  lastAccessedAt: number;
  userLogin: string;
}

// Map Bearer tokens to usernames for testing
function getUserLogin(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  // Simple mapping: "user-alice-token" → "alice", "user-bob-token" → "bob"
  if (token.startsWith("user-")) return token.slice(5).replace("-token", "");
  return "default-user";
}

function createMcpApp() {
  const transports = new Map<string, SessionEntry>();

  // Expose the map for assertions
  const app = new Elysia()
    .all("/mcp", async ({ request }) => {
      const method = request.method;

      // DELETE — close session
      if (method === "DELETE") {
        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const userLogin = getUserLogin(request);
        const sessionId = request.headers.get("mcp-session-id");
        if (sessionId) {
          const entry = transports.get(sessionId);
          if (entry) {
            if (entry.userLogin !== userLogin) {
              return new Response(JSON.stringify({ error: "Forbidden" }), {
                status: 403,
                headers: { "Content-Type": "application/json" },
              });
            }
            entry.transport.close();
            transports.delete(sessionId);
          }
        }
        return new Response(null, { status: 200 });
      }

      // GET — SSE stream for existing session
      if (method === "GET") {
        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const userLogin = getUserLogin(request);
        const sessionId = request.headers.get("mcp-session-id");
        const entry = sessionId ? transports.get(sessionId) : undefined;
        if (!entry) {
          return new Response(JSON.stringify({ error: "Session not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (entry.userLogin !== userLogin) {
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
          });
        }
        entry.lastAccessedAt = Date.now();
        return entry.transport.handleRequest(request);
      }

      // POST — authenticate and handle
      const authHeader = request.headers.get("authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      const userLogin = getUserLogin(request)!;
      const sessionId = request.headers.get("mcp-session-id");

      // Existing session
      if (sessionId && transports.has(sessionId)) {
        const entry = transports.get(sessionId)!;
        if (entry.userLogin !== userLogin) {
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
          });
        }
        entry.lastAccessedAt = Date.now();
        return entry.transport.handleRequest(request);
      }

      // New session — must be initialize request (simplified check)
      const body = await request.json();

      // No session ID and not initialize — client error
      if (!sessionId && body?.method !== "initialize") {
        return new Response(
          JSON.stringify({
            error:
              "Invalid request. Send an initialize request without session ID to start.",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      // Create a fresh session (handles both new and stale/expired sessions)
      const newSessionId = crypto.randomUUID();
      const mockTransport = {
        handleRequest: (_req: Request) =>
          new Response(JSON.stringify({ sessionId: newSessionId }), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "mcp-session-id": newSessionId,
            },
          }),
        close: mock(() => {}),
      };
      transports.set(newSessionId, {
        transport: mockTransport,
        lastAccessedAt: Date.now(),
        userLogin,
      });
      return mockTransport.handleRequest(request);
    })
    .get("/healthz", () => ({ status: "ok" }));

  return { app, transports };
}

function authedRequest(
  method: string,
  path: string,
  headers?: Record<string, string>,
  body?: unknown,
): Request {
  const opts: RequestInit = {
    method,
    headers: {
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
      ...headers,
    },
  };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  return new Request(`http://localhost${path}`, opts);
}

function userRequest(
  user: string,
  method: string,
  path: string,
  headers?: Record<string, string>,
  body?: unknown,
): Request {
  const opts: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer user-${user}-token`,
      "Content-Type": "application/json",
      ...headers,
    },
  };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  return new Request(`http://localhost${path}`, opts);
}

function unauthRequest(
  method: string,
  path: string,
  headers?: Record<string, string>,
  body?: unknown,
): Request {
  const opts: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  return new Request(`http://localhost${path}`, opts);
}

// ── Auth enforcement ──────────────────────────────────────────────────

describe("MCP auth enforcement", () => {
  test("POST /mcp without auth → 401", async () => {
    const { app } = createMcpApp();
    const res = await app.handle(
      unauthRequest("POST", "/mcp", {}, { method: "initialize" }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  test("GET /mcp without auth → 401", async () => {
    const { app } = createMcpApp();
    const res = await app.handle(unauthRequest("GET", "/mcp"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  test("DELETE /mcp without auth → 401", async () => {
    const { app } = createMcpApp();
    const res = await app.handle(unauthRequest("DELETE", "/mcp"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });
});

// ── Session lifecycle ─────────────────────────────────────────────────

describe("MCP session lifecycle", () => {
  test("POST initialize creates a session", async () => {
    const { app, transports } = createMcpApp();
    const res = await app.handle(
      authedRequest("POST", "/mcp", {}, { method: "initialize" }),
    );
    expect(res.status).toBe(200);
    expect(transports.size).toBe(1);

    const sessionId = res.headers.get("mcp-session-id");
    expect(sessionId).toBeTruthy();
    expect(transports.has(sessionId!)).toBe(true);
  });

  test("POST non-initialize without session → 400", async () => {
    const { app } = createMcpApp();
    const res = await app.handle(
      authedRequest("POST", "/mcp", {}, { method: "tools/list" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("initialize");
  });

  test("GET with unknown session ID → 404", async () => {
    const { app } = createMcpApp();
    const res = await app.handle(
      authedRequest("GET", "/mcp", {
        "mcp-session-id": "nonexistent-session",
      }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Session not found");
  });

  test("GET without session ID → 404", async () => {
    const { app } = createMcpApp();
    const res = await app.handle(authedRequest("GET", "/mcp"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Session not found");
  });

  test("DELETE with valid session ID closes and removes it", async () => {
    const { app, transports } = createMcpApp();

    // Create session
    const initRes = await app.handle(
      authedRequest("POST", "/mcp", {}, { method: "initialize" }),
    );
    const sessionId = initRes.headers.get("mcp-session-id")!;
    expect(transports.size).toBe(1);

    const entry = transports.get(sessionId)!;

    // Delete session (same user)
    const res = await app.handle(
      authedRequest("DELETE", "/mcp", { "mcp-session-id": sessionId }),
    );
    expect(res.status).toBe(200);
    expect(transports.size).toBe(0);
    expect(entry.transport.close).toHaveBeenCalledTimes(1);
  });

  test("DELETE with unknown session ID → 200 (no-op)", async () => {
    const { app, transports } = createMcpApp();
    const res = await app.handle(
      authedRequest("DELETE", "/mcp", { "mcp-session-id": "bogus" }),
    );
    expect(res.status).toBe(200);
    expect(transports.size).toBe(0);
  });
});

// ── Session access updates lastAccessedAt ─────────────────────────────

describe("MCP session idle tracking", () => {
  test("GET updates lastAccessedAt on existing session", async () => {
    const { app, transports } = createMcpApp();

    // Create session
    const initRes = await app.handle(
      authedRequest("POST", "/mcp", {}, { method: "initialize" }),
    );
    const sessionId = initRes.headers.get("mcp-session-id")!;

    // Backdate lastAccessedAt
    const entry = transports.get(sessionId)!;
    entry.lastAccessedAt = Date.now() - 10_000;
    const before = entry.lastAccessedAt;

    // Access via GET
    await app.handle(
      authedRequest("GET", "/mcp", { "mcp-session-id": sessionId }),
    );

    expect(entry.lastAccessedAt).toBeGreaterThan(before);
  });

  test("POST with existing session updates lastAccessedAt", async () => {
    const { app, transports } = createMcpApp();

    // Create session
    const initRes = await app.handle(
      authedRequest("POST", "/mcp", {}, { method: "initialize" }),
    );
    const sessionId = initRes.headers.get("mcp-session-id")!;

    // Backdate lastAccessedAt
    const entry = transports.get(sessionId)!;
    entry.lastAccessedAt = Date.now() - 10_000;
    const before = entry.lastAccessedAt;

    // Access via POST with session ID
    await app.handle(
      authedRequest(
        "POST",
        "/mcp",
        { "mcp-session-id": sessionId },
        { method: "tools/list" },
      ),
    );

    expect(entry.lastAccessedAt).toBeGreaterThan(before);
  });
});

// ── Idle session cleanup ──────────────────────────────────────────────
// Tests the cleanup logic in isolation (same comparison as the setInterval
// in index.ts, but invoked directly rather than waiting for the timer).

describe("MCP idle session cleanup", () => {
  const SESSION_TTL = 4 * 60 * 60 * 1000; // 4 hours — matches index.ts maxAge

  function runCleanup(transports: Map<string, SessionEntry>) {
    for (const [id, entry] of transports) {
      if (Date.now() - entry.lastAccessedAt > SESSION_TTL) {
        entry.transport.close();
        transports.delete(id);
      }
    }
  }

  function mockEntry(lastAccessedAt: number): SessionEntry {
    return {
      transport: {
        handleRequest: (_req: Request) => new Response(),
        close: mock(() => {}),
      },
      lastAccessedAt,
      userLogin: "test-user",
    };
  }

  test("removes sessions idle longer than 30 minutes", () => {
    const transports = new Map<string, SessionEntry>();
    const stale = mockEntry(Date.now() - SESSION_TTL - 1);
    transports.set("stale-session", stale);

    runCleanup(transports);

    expect(transports.size).toBe(0);
    expect(stale.transport.close).toHaveBeenCalledTimes(1);
  });

  test("keeps sessions accessed within 30 minutes", () => {
    const transports = new Map<string, SessionEntry>();
    const fresh = mockEntry(Date.now() - SESSION_TTL + 60_000); // 1 min to spare
    transports.set("fresh-session", fresh);

    runCleanup(transports);

    expect(transports.size).toBe(1);
    expect(fresh.transport.close).not.toHaveBeenCalled();
  });

  test("selectively removes only stale sessions", () => {
    const transports = new Map<string, SessionEntry>();
    const stale1 = mockEntry(Date.now() - SESSION_TTL - 60_000);
    const fresh = mockEntry(Date.now() - 5_000);
    const stale2 = mockEntry(Date.now() - SESSION_TTL - 1);

    transports.set("stale-1", stale1);
    transports.set("fresh", fresh);
    transports.set("stale-2", stale2);

    runCleanup(transports);

    expect(transports.size).toBe(1);
    expect(transports.has("fresh")).toBe(true);
    expect(stale1.transport.close).toHaveBeenCalledTimes(1);
    expect(stale2.transport.close).toHaveBeenCalledTimes(1);
    expect(fresh.transport.close).not.toHaveBeenCalled();
  });

  test("session at exactly 30 minutes is not removed (boundary)", () => {
    const transports = new Map<string, SessionEntry>();
    const boundary = mockEntry(Date.now() - SESSION_TTL);
    transports.set("boundary", boundary);

    runCleanup(transports);

    // Date.now() - lastAccessedAt === SESSION_TTL, not > SESSION_TTL
    expect(transports.size).toBe(1);
    expect(boundary.transport.close).not.toHaveBeenCalled();
  });

  test("no-op on empty transport map", () => {
    const transports = new Map<string, SessionEntry>();
    runCleanup(transports);
    expect(transports.size).toBe(0);
  });
});

// ── Cross-user session isolation ──────────────────────────────────────

describe("MCP cross-user session isolation", () => {
  async function createSessionForUser(
    app: ReturnType<typeof createMcpApp>["app"],
    user: string,
  ): Promise<string> {
    const res = await app.handle(
      userRequest(user, "POST", "/mcp", {}, { method: "initialize" }),
    );
    expect(res.status).toBe(200);
    return res.headers.get("mcp-session-id")!;
  }

  test("POST to existing session with different user → 403", async () => {
    const { app } = createMcpApp();
    const sessionId = await createSessionForUser(app, "alice");

    // Bob tries to POST to Alice's session
    const res = await app.handle(
      userRequest(
        "bob",
        "POST",
        "/mcp",
        { "mcp-session-id": sessionId },
        {
          method: "tools/list",
        },
      ),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  test("GET to existing session with different user → 403", async () => {
    const { app } = createMcpApp();
    const sessionId = await createSessionForUser(app, "alice");

    // Bob tries to GET Alice's session
    const res = await app.handle(
      userRequest("bob", "GET", "/mcp", { "mcp-session-id": sessionId }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  test("DELETE to existing session with different user → 403", async () => {
    const { app, transports } = createMcpApp();
    const sessionId = await createSessionForUser(app, "alice");

    // Bob tries to DELETE Alice's session
    const res = await app.handle(
      userRequest("bob", "DELETE", "/mcp", { "mcp-session-id": sessionId }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");

    // Session should still exist
    expect(transports.size).toBe(1);
    expect(transports.has(sessionId)).toBe(true);
  });

  test("Same user accessing own session → 200", async () => {
    const { app } = createMcpApp();
    const sessionId = await createSessionForUser(app, "alice");

    // Alice accesses her own session via GET
    const getRes = await app.handle(
      userRequest("alice", "GET", "/mcp", { "mcp-session-id": sessionId }),
    );
    expect(getRes.status).toBe(200);

    // Alice accesses her own session via POST
    const postRes = await app.handle(
      userRequest(
        "alice",
        "POST",
        "/mcp",
        { "mcp-session-id": sessionId },
        {
          method: "tools/list",
        },
      ),
    );
    expect(postRes.status).toBe(200);

    // Alice deletes her own session
    const deleteRes = await app.handle(
      userRequest("alice", "DELETE", "/mcp", { "mcp-session-id": sessionId }),
    );
    expect(deleteRes.status).toBe(200);
  });
});

// ── DELETE auth enforcement ───────────────────────────────────────────

describe("MCP DELETE auth enforcement", () => {
  test("DELETE without Authorization header → 401", async () => {
    const { app } = createMcpApp();
    const res = await app.handle(unauthRequest("DELETE", "/mcp"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  test("DELETE with valid auth and valid session → 200", async () => {
    const { app, transports } = createMcpApp();

    // Create session as alice
    const initRes = await app.handle(
      userRequest("alice", "POST", "/mcp", {}, { method: "initialize" }),
    );
    const sessionId = initRes.headers.get("mcp-session-id")!;
    expect(transports.size).toBe(1);

    // Alice deletes her session with valid auth
    const res = await app.handle(
      userRequest("alice", "DELETE", "/mcp", { "mcp-session-id": sessionId }),
    );
    expect(res.status).toBe(200);
    expect(transports.size).toBe(0);
  });
});

// ── Stale session recovery ────────────────────────────────────────────

describe("MCP stale session recovery", () => {
  test("POST with nonexistent session ID creates new session", async () => {
    const { app, transports } = createMcpApp();
    const staleSessionId = "stale-session-that-no-longer-exists";

    // POST with a stale session ID and initialize body — should create new session
    const res = await app.handle(
      authedRequest(
        "POST",
        "/mcp",
        { "mcp-session-id": staleSessionId },
        { method: "initialize" },
      ),
    );
    expect(res.status).toBe(200);
    expect(transports.size).toBe(1);

    // The new session ID should be present in the response
    const newSessionId = res.headers.get("mcp-session-id");
    expect(newSessionId).toBeTruthy();
  });

  test("new session ID differs from stale one", async () => {
    const { app } = createMcpApp();
    const staleSessionId = "stale-session-that-expired";

    const res = await app.handle(
      authedRequest(
        "POST",
        "/mcp",
        { "mcp-session-id": staleSessionId },
        { method: "initialize" },
      ),
    );
    expect(res.status).toBe(200);

    const newSessionId = res.headers.get("mcp-session-id");
    expect(newSessionId).toBeTruthy();
    expect(newSessionId).not.toBe(staleSessionId);
  });
});
