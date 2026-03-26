import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";

// --- Mocks ---

const mockQuery = mock(() => Promise.resolve({ rows: [], rowCount: 0 }));

mock.module("@/lib/db", () => ({
  default: { query: mockQuery },
}));

// Set required env vars before importing
process.env.AUTH_FORGEJO_URL = "https://forgejo.test";
process.env.AUTH_FORGEJO_ID = "test-client-id";
process.env.AUTH_FORGEJO_SECRET = "test-client-secret";

const { forgejoFetch } = await import("@/lib/forgejo");

// --- Helpers ---

const originalFetch = globalThis.fetch;

function mockFetch(impl: typeof globalThis.fetch) {
  globalThis.fetch = mock(impl);
}

beforeEach(() => {
  mockQuery.mockReset();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// --- Tests ---

describe("forgejoFetch", () => {
  it("passes token as Authorization header on success", async () => {
    mockQuery.mockImplementation(() =>
      Promise.resolve({
        rows: [{ accessToken: "valid-token" }],
        rowCount: 1,
      }),
    );
    mockFetch(async (url, init) => {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const res = await forgejoFetch("user-1", "/user");
    expect(res.status).toBe(200);

    const calls = (globalThis.fetch as ReturnType<typeof mock>).mock.calls;
    expect(calls).toHaveLength(1);
    const [url, opts] = calls[0];
    expect(url).toBe("https://forgejo.test/api/v1/user");
    expect(opts.headers.Authorization).toBe("token valid-token");
  });

  it("refreshes token on 401 and retries with new token", async () => {
    // First query: get access token
    // Second query: get refresh token
    // Third query: update tokens
    let queryCallCount = 0;
    mockQuery.mockImplementation(() => {
      queryCallCount++;
      if (queryCallCount === 1) {
        return Promise.resolve({
          rows: [{ accessToken: "expired-token" }],
          rowCount: 1,
        });
      }
      if (queryCallCount === 2) {
        return Promise.resolve({
          rows: [{ refreshToken: "refresh-token-1" }],
          rowCount: 1,
        });
      }
      // update query
      return Promise.resolve({ rows: [], rowCount: 1 });
    });

    let fetchCallCount = 0;
    mockFetch(async (url, init) => {
      fetchCallCount++;
      const urlStr = typeof url === "string" ? url : url.toString();
      // Token refresh endpoint
      if (urlStr.includes("/login/oauth/access_token")) {
        return new Response(
          JSON.stringify({
            access_token: "new-token",
            refresh_token: "new-refresh",
            expires_in: 3600,
          }),
          { status: 200 },
        );
      }
      // First API call returns 401, second succeeds
      if (fetchCallCount === 1) {
        return new Response("Unauthorized", { status: 401 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const res = await forgejoFetch("user-1", "/user");
    expect(res.status).toBe(200);

    // Should have called fetch 3 times: initial 401, token refresh, retry
    const fetchCalls = (globalThis.fetch as ReturnType<typeof mock>).mock.calls;
    expect(fetchCalls).toHaveLength(3);

    // Retry should use new token
    const [, retryOpts] = fetchCalls[2];
    expect(retryOpts.headers.Authorization).toBe("token new-token");
  });

  it("throws when no token exists in database", async () => {
    mockQuery.mockImplementation(() =>
      Promise.resolve({ rows: [], rowCount: 0 }),
    );

    await expect(forgejoFetch("user-1", "/user")).rejects.toThrow(
      "No Forgejo access token",
    );
  });

  it("deduplicates concurrent refresh requests for same user", async () => {
    // Both calls get expired token
    let queryCallCount = 0;
    mockQuery.mockImplementation(() => {
      queryCallCount++;
      // Access token queries (calls 1 and 2 — one per forgejoFetch)
      if (queryCallCount <= 2) {
        return Promise.resolve({
          rows: [{ accessToken: "expired-token" }],
          rowCount: 1,
        });
      }
      // Refresh token query
      if (queryCallCount === 3) {
        return Promise.resolve({
          rows: [{ refreshToken: "refresh-1" }],
          rowCount: 1,
        });
      }
      // Update and subsequent queries
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    let refreshCallCount = 0;
    mockFetch(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/login/oauth/access_token")) {
        refreshCallCount++;
        return new Response(
          JSON.stringify({
            access_token: "new-token",
            refresh_token: "new-refresh",
            expires_in: 3600,
          }),
          { status: 200 },
        );
      }
      // All API calls return 401 on first try to trigger refresh
      return new Response("Unauthorized", { status: 401 });
    });

    // Fire two concurrent requests for the same user
    const [res1, res2] = await Promise.all([
      forgejoFetch("user-1", "/user").catch((e: Error) => e),
      forgejoFetch("user-1", "/repos").catch((e: Error) => e),
    ]);

    // Only ONE refresh request should have been made
    expect(refreshCallCount).toBe(1);
  });

  it("throws on refresh network error (does not hang)", async () => {
    mockQuery.mockImplementation((_sql: string) => {
      const sql = _sql as string;
      if (sql.includes("accessToken")) {
        return Promise.resolve({
          rows: [{ accessToken: "expired" }],
          rowCount: 1,
        });
      }
      if (sql.includes("refreshToken")) {
        return Promise.resolve({
          rows: [{ refreshToken: "refresh-1" }],
          rowCount: 1,
        });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    mockFetch(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/login/oauth/access_token")) {
        throw new Error("Network error");
      }
      return new Response("Unauthorized", { status: 401 });
    });

    // The refresh failure returns null, which triggers "token expired" error
    await expect(forgejoFetch("user-1", "/user")).rejects.toThrow(
      "token expired",
    );
  });
});
