import { describe, it, expect, beforeEach, mock, spyOn } from "bun:test";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockSession = {
  user: { id: "user-1", name: "test", email: "test@test.com" },
  session: { id: "sess-1", expiresAt: new Date(Date.now() + 86400000) },
};

let sessionReturn: typeof mockSession | null = mockSession;

mock.module("@/auth", () => ({
  auth: {
    api: {
      getSession: () => Promise.resolve(sessionReturn),
    },
  },
}));

mock.module("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
}));

// Track pool.query calls for assertions
const queryResults: Record<string, { rows: Record<string, unknown>[] }> = {};

mock.module("@/lib/db", () => {
  const mockPool = {
    query: (sql: string, _params?: unknown[]) => {
      // Route by SQL content
      if (sql.includes('"accessToken"') && sql.includes("SELECT")) {
        return Promise.resolve(
          queryResults["accessToken"] || {
            rows: [{ accessToken: "forgejo-token-abc" }],
          },
        );
      }
      if (sql.includes('"refreshToken"') && sql.includes("SELECT")) {
        return Promise.resolve(
          queryResults["refreshToken"] || {
            rows: [{ refreshToken: "refresh-token-xyz" }],
          },
        );
      }
      if (sql.includes("UPDATE account")) {
        return Promise.resolve({ rowCount: 1 });
      }
      return Promise.resolve({ rows: [] });
    },
  };
  return { default: mockPool };
});

// Set env vars before import
process.env.OP_API_URL = "http://op-api.test";
process.env.AUTH_FORGEJO_INTERNAL_URL = "https://forgejo.test";
process.env.AUTH_FORGEJO_ID = "test-client-id";
process.env.AUTH_FORGEJO_SECRET = "test-client-secret";

// Import after mocks
const {
  opApiFetch,
  opApiGet,
  opApiPost,
  opApiPatch,
  opApiDelete,
  getForgejoToken,
} = await import("@/lib/op-api");

// ── Helpers ────────────────────────────────────────────────────────────────

/** Build a minimal Response */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function textResponse(body: string, status: number): Response {
  return new Response(body, { status });
}

// ── Fetch interceptor ──────────────────────────────────────────────────────

// The globalThis.fetch wrapper below normalizes input to a string before
// calling fetchImpl, so url is always string at runtime despite the wider type.
let fetchImpl: (url: string, init?: RequestInit) => Promise<Response>;

const originalFetch = globalThis.fetch;

// Replace global fetch with a router
globalThis.fetch = (async (
  input: string | URL | Request,
  init?: RequestInit,
) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  return fetchImpl(url, init);
}) as typeof fetch;

// ── Tests ──────────────────────────────────────────────────────────────────

describe("op-api token flow", () => {
  beforeEach(() => {
    sessionReturn = mockSession;
    // Reset query result overrides
    Object.keys(queryResults).forEach((k) => delete queryResults[k]);
    // Default fetch: Forgejo validation succeeds, op-api returns JSON
    fetchImpl = async (url: string) => {
      if (url.includes("/api/v1/user")) {
        return jsonResponse({ login: "test" });
      }
      if (url.startsWith("http://op-api.test")) {
        return jsonResponse({ ok: true });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };

    // Clear the module-level caches by fetching with a unique token first
    // We can't directly access the Map, so we rely on fresh tokens per test
  });

  it("throws 'Not authenticated' when no session", async () => {
    sessionReturn = null;
    await expect(opApiFetch("/api/v1/status")).rejects.toThrow(
      "Not authenticated",
    );
  });

  it("throws 'Not authenticated' when no token in DB", async () => {
    queryResults["accessToken"] = { rows: [] };
    await expect(opApiFetch("/api/v1/status")).rejects.toThrow(
      "Not authenticated",
    );
  });

  it("validates token against Forgejo and calls op-api", async () => {
    const calls: string[] = [];
    fetchImpl = async (url: string) => {
      calls.push(url);
      if (url.includes("/api/v1/user")) return jsonResponse({ login: "test" });
      if (url.startsWith("http://op-api.test"))
        return jsonResponse({ status: "ok" });
      throw new Error(`Unexpected fetch: ${url}`);
    };

    const res = await opApiFetch("/api/v1/status");
    expect(res.status).toBe(200);
    expect(calls).toContain("https://forgejo.test/api/v1/user");
    expect(calls).toContain("http://op-api.test/api/v1/status");
  });

  it("caches token validation — second call within 5 min skips Forgejo", async () => {
    // Use a unique token for this test to avoid cache from other tests
    const uniqueToken = `cached-token-${Date.now()}`;
    queryResults["accessToken"] = { rows: [{ accessToken: uniqueToken }] };

    const forgejoValidationCount = { count: 0 };
    fetchImpl = async (url: string) => {
      if (url.includes("/api/v1/user")) {
        forgejoValidationCount.count++;
        return jsonResponse({ login: "test" });
      }
      if (url.startsWith("http://op-api.test"))
        return jsonResponse({ ok: true });
      throw new Error(`Unexpected fetch: ${url}`);
    };

    await opApiFetch("/api/v1/status");
    expect(forgejoValidationCount.count).toBe(1);

    await opApiFetch("/api/v1/status");
    // Second call should NOT hit Forgejo validation
    expect(forgejoValidationCount.count).toBe(1);
  });

  it("re-validates when cache entry expires", async () => {
    const uniqueToken = `expire-token-${Date.now()}`;
    queryResults["accessToken"] = { rows: [{ accessToken: uniqueToken }] };

    let validationCount = 0;
    fetchImpl = async (url: string) => {
      if (url.includes("/api/v1/user")) {
        validationCount++;
        return jsonResponse({ login: "test" });
      }
      if (url.startsWith("http://op-api.test"))
        return jsonResponse({ ok: true });
      throw new Error(`Unexpected: ${url}`);
    };

    // First call — validates
    await opApiFetch("/api/v1/test");
    expect(validationCount).toBe(1);

    // Monkey-patch Date.now to simulate 6 minutes later
    const realNow = Date.now;
    Date.now = () => realNow() + 6 * 60 * 1000;

    try {
      await opApiFetch("/api/v1/test");
      // Should have re-validated
      expect(validationCount).toBe(2);
    } finally {
      Date.now = realNow;
    }
  });

  it("deduplicates concurrent refresh requests for the same user", async () => {
    // Token that fails validation — triggers refresh path
    const badToken = `bad-token-${Date.now()}`;
    queryResults["accessToken"] = { rows: [{ accessToken: badToken }] };
    queryResults["refreshToken"] = {
      rows: [{ refreshToken: "refresh-xyz" }],
    };

    let refreshCallCount = 0;
    fetchImpl = async (url: string) => {
      if (url.includes("/api/v1/user")) {
        // Token invalid
        return textResponse("Unauthorized", 401);
      }
      if (url.includes("/login/oauth/access_token")) {
        refreshCallCount++;
        // Small delay to ensure concurrency window
        await new Promise((r) => setTimeout(r, 50));
        return jsonResponse({
          access_token: "new-token-123",
          refresh_token: "new-refresh-456",
          expires_in: 3600,
        });
      }
      if (url.startsWith("http://op-api.test"))
        return jsonResponse({ ok: true });
      throw new Error(`Unexpected: ${url}`);
    };

    // Fire two concurrent calls — both will need refresh
    const [res1, res2] = await Promise.all([
      opApiFetch("/api/v1/a"),
      opApiFetch("/api/v1/b"),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    // Only ONE refresh request should have been made
    expect(refreshCallCount).toBe(1);
  });

  it("uses refreshed token for subsequent requests", async () => {
    const staleToken = `stale-${Date.now()}`;
    queryResults["accessToken"] = { rows: [{ accessToken: staleToken }] };
    queryResults["refreshToken"] = {
      rows: [{ refreshToken: "refresh-abc" }],
    };

    const tokensUsed: string[] = [];
    fetchImpl = async (url: string, init?: RequestInit) => {
      if (url.includes("/api/v1/user")) {
        return textResponse("Unauthorized", 401);
      }
      if (url.includes("/login/oauth/access_token")) {
        return jsonResponse({
          access_token: "fresh-token-999",
          refresh_token: "fresh-refresh-999",
          expires_in: 3600,
        });
      }
      if (url.startsWith("http://op-api.test")) {
        const authHeader =
          init?.headers &&
          (init.headers as Record<string, string>)["Authorization"];
        if (authHeader) tokensUsed.push(authHeader);
        return jsonResponse({ ok: true });
      }
      throw new Error(`Unexpected: ${url}`);
    };

    await opApiFetch("/api/v1/test");
    expect(tokensUsed).toContain("Bearer fresh-token-999");
  });

  it("throws when refresh fails", async () => {
    const badToken = `fail-refresh-${Date.now()}`;
    queryResults["accessToken"] = { rows: [{ accessToken: badToken }] };
    queryResults["refreshToken"] = {
      rows: [{ refreshToken: "refresh-dead" }],
    };

    fetchImpl = async (url: string) => {
      if (url.includes("/api/v1/user")) {
        return textResponse("Unauthorized", 401);
      }
      if (url.includes("/login/oauth/access_token")) {
        return textResponse("Bad Request", 400);
      }
      throw new Error(`Unexpected: ${url}`);
    };

    // Refresh returns null → getForgejoToken returns null → "Not authenticated"
    await expect(opApiFetch("/api/v1/test")).rejects.toThrow(
      "Not authenticated",
    );
  });

  it("opApiDelete returns { deleted: true } on 204", async () => {
    // Use a token that's already validated (cached from prior test won't work,
    // so use a fresh one that passes validation)
    const token = `delete-token-${Date.now()}`;
    queryResults["accessToken"] = { rows: [{ accessToken: token }] };

    fetchImpl = async (url: string) => {
      if (url.includes("/api/v1/user")) return jsonResponse({ login: "test" });
      if (url.startsWith("http://op-api.test")) {
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected: ${url}`);
    };

    const result = await opApiDelete("/api/v1/things/123");
    expect(result).toEqual({ deleted: true });
  });

  it("uses cached token when Forgejo validation has network error", async () => {
    // First: validate successfully to populate the cache
    const token = `network-err-${Date.now()}`;
    queryResults["accessToken"] = { rows: [{ accessToken: token }] };

    let callPhase = "validate";
    fetchImpl = async (url: string) => {
      if (url.includes("/api/v1/user")) {
        if (callPhase === "validate") {
          return jsonResponse({ login: "test" });
        }
        // Network error on second validation
        throw new Error("ECONNREFUSED");
      }
      if (url.startsWith("http://op-api.test"))
        return jsonResponse({ ok: true });
      throw new Error(`Unexpected: ${url}`);
    };

    // First call — validates and caches
    await opApiFetch("/api/v1/test");

    // Expire the cache so it re-validates
    const realNow = Date.now;
    Date.now = () => realNow() + 6 * 60 * 1000;
    callPhase = "error";

    try {
      // Should succeed — network error falls back to cached (lastValidated !== undefined)
      const res = await opApiFetch("/api/v1/test");
      expect(res.status).toBe(200);
    } finally {
      Date.now = realNow;
    }
  });
});
