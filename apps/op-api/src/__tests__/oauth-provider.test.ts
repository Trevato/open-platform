import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { createHash } from "crypto";
import {
  registerClient,
  startAuthorize,
  handleCallback,
  exchangeCode,
  refreshToken,
  getClient,
} from "../auth/oauth-provider.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generatePkce() {
  const verifier = "test-verifier-" + Math.random().toString(36).slice(2);
  const challenge = createHash("sha256")
    .update(verifier)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return { verifier, challenge };
}

/** Register a client + start authorize, return the forgejoState for callback tests. */
async function createValidAuthState(pkceChallenge: string) {
  const client = registerClient({
    redirect_uris: ["http://localhost:9999/callback"],
  });

  const { forgejoAuthorizeUrl } = startAuthorize({
    client_id: client.client_id,
    redirect_uri: "http://localhost:9999/callback",
    state: "original-state",
    code_challenge: pkceChallenge,
    code_challenge_method: "S256",
  });

  const url = new URL(forgejoAuthorizeUrl);
  const forgejoState = url.searchParams.get("state")!;

  return { client, forgejoState };
}

function mockFetch(
  status: number,
  body: Record<string, unknown>,
): typeof global.fetch {
  const fn = async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  return fn as unknown as typeof global.fetch;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const originalFetch = global.fetch;

beforeAll(() => {
  process.env.FORGEJO_URL = "http://forgejo.test";
  process.env.FORGEJO_INTERNAL_URL = "http://forgejo-internal.test";
  process.env.MCP_OAUTH_CLIENT_ID = "test-forgejo-client-id";
  process.env.MCP_OAUTH_CLIENT_SECRET = "test-forgejo-client-secret";
  process.env.PLATFORM_DOMAIN = "test.example.com";
  process.env.SERVICE_PREFIX = "";
});

afterEach(() => {
  global.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// Client Registration
// ---------------------------------------------------------------------------

describe("registerClient", () => {
  test("valid localhost redirect_uri returns client with UUID and defaults", () => {
    const client = registerClient({
      redirect_uris: ["http://localhost:3000/callback"],
    });

    expect(client.client_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(client.client_name).toBe("MCP Client");
    expect(client.redirect_uris).toEqual(["http://localhost:3000/callback"]);
    expect(client.grant_types).toEqual(["authorization_code", "refresh_token"]);
    expect(client.response_types).toEqual(["code"]);
    expect(client.token_endpoint_auth_method).toBe("none");
  });

  test("valid 127.0.0.1 redirect_uri succeeds", () => {
    const client = registerClient({
      redirect_uris: ["http://127.0.0.1:8080/callback"],
    });

    expect(client.client_id).toBeTruthy();
    expect(client.redirect_uris).toEqual(["http://127.0.0.1:8080/callback"]);
  });

  test("rejects empty redirect_uris array", () => {
    expect(() => registerClient({ redirect_uris: [] })).toThrow(
      "redirect_uris is required",
    );
  });

  test("rejects non-loopback URI", () => {
    expect(() =>
      registerClient({ redirect_uris: ["https://evil.com/cb"] }),
    ).toThrow("only http://127.0.0.1");
  });

  test("rejects mixed valid and invalid URIs", () => {
    expect(() =>
      registerClient({
        redirect_uris: [
          "http://localhost:3000/callback",
          "https://evil.com/cb",
        ],
      }),
    ).toThrow("only http://127.0.0.1");
  });

  test("registered client retrievable via getClient", () => {
    const client = registerClient({
      redirect_uris: ["http://localhost:4000/cb"],
      client_name: "Test App",
    });

    const found = getClient(client.client_id);
    expect(found).toBeDefined();
    expect(found!.client_id).toBe(client.client_id);
    expect(found!.client_name).toBe("Test App");
  });
});

// ---------------------------------------------------------------------------
// startAuthorize
// ---------------------------------------------------------------------------

describe("startAuthorize", () => {
  test("valid params returns Forgejo authorize URL with correct query params", () => {
    const client = registerClient({
      redirect_uris: ["http://localhost:5000/cb"],
    });

    const { forgejoAuthorizeUrl } = startAuthorize({
      client_id: client.client_id,
      redirect_uri: "http://localhost:5000/cb",
      state: "my-state",
      code_challenge: "challenge123",
      code_challenge_method: "S256",
    });

    const url = new URL(forgejoAuthorizeUrl);
    expect(url.origin).toBe("http://forgejo.test");
    expect(url.pathname).toBe("/login/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("test-forgejo-client-id");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://api.test.example.com/oauth/callback",
    );
    expect(url.searchParams.get("state")).toBeTruthy();
  });

  test("unknown client_id throws", () => {
    expect(() =>
      startAuthorize({
        client_id: "nonexistent-id",
        redirect_uri: "http://localhost:5000/cb",
        state: "s",
        code_challenge: "c",
        code_challenge_method: "S256",
      }),
    ).toThrow("Unknown client_id");
  });

  test("unregistered redirect_uri throws", () => {
    const client = registerClient({
      redirect_uris: ["http://localhost:5001/cb"],
    });

    expect(() =>
      startAuthorize({
        client_id: client.client_id,
        redirect_uri: "http://localhost:9999/other",
        state: "s",
        code_challenge: "c",
        code_challenge_method: "S256",
      }),
    ).toThrow("redirect_uri");
  });

  test("missing MCP_OAUTH_CLIENT_ID throws", () => {
    const saved = process.env.MCP_OAUTH_CLIENT_ID;
    process.env.MCP_OAUTH_CLIENT_ID = "";

    const client = registerClient({
      redirect_uris: ["http://localhost:5002/cb"],
    });

    try {
      expect(() =>
        startAuthorize({
          client_id: client.client_id,
          redirect_uri: "http://localhost:5002/cb",
          state: "s",
          code_challenge: "c",
          code_challenge_method: "S256",
        }),
      ).toThrow("MCP OAuth not configured");
    } finally {
      process.env.MCP_OAUTH_CLIENT_ID = saved;
    }
  });

  test("state is stored and usable by handleCallback", async () => {
    const { verifier, challenge } = generatePkce();
    const { forgejoState } = await createValidAuthState(challenge);

    global.fetch = mockFetch(200, {
      access_token: "forgejo-at",
      refresh_token: "forgejo-rt",
      token_type: "bearer",
      expires_in: 3600,
    });

    // If the state was not stored, this would throw
    const result = await handleCallback("forgejo-code", forgejoState);
    expect(result.redirectUrl).toContain("code=");
  });

  test("whitespace in client_id is trimmed", () => {
    const client = registerClient({
      redirect_uris: ["http://localhost:5003/cb"],
    });

    const { forgejoAuthorizeUrl } = startAuthorize({
      client_id: ` ${client.client_id} `,
      redirect_uri: "http://localhost:5003/cb",
      state: "s",
      code_challenge: "c",
      code_challenge_method: "S256",
    });

    expect(forgejoAuthorizeUrl).toContain("/login/oauth/authorize");
  });
});

// ---------------------------------------------------------------------------
// handleCallback
// ---------------------------------------------------------------------------

describe("handleCallback", () => {
  test("valid state + Forgejo success returns redirect with code and state", async () => {
    const { verifier, challenge } = generatePkce();
    const { forgejoState } = await createValidAuthState(challenge);

    global.fetch = mockFetch(200, {
      access_token: "fg-access-token",
      refresh_token: "fg-refresh-token",
      token_type: "bearer",
      expires_in: 3600,
    });

    const { redirectUrl } = await handleCallback("fg-code-1", forgejoState);
    const url = new URL(redirectUrl);
    expect(url.searchParams.get("code")).toBeTruthy();
    expect(url.searchParams.get("state")).toBe("original-state");
    expect(url.hostname).toBe("localhost");
  });

  test("unknown state throws", async () => {
    await expect(
      handleCallback("some-code", "nonexistent-state"),
    ).rejects.toThrow("Unknown or expired authorization state");
  });

  test("expired state throws", async () => {
    const { challenge } = generatePkce();
    const client = registerClient({
      redirect_uris: ["http://localhost:6000/cb"],
    });

    const { forgejoAuthorizeUrl } = startAuthorize({
      client_id: client.client_id,
      redirect_uri: "http://localhost:6000/cb",
      state: "orig",
      code_challenge: challenge,
      code_challenge_method: "S256",
    });

    const url = new URL(forgejoAuthorizeUrl);
    const forgejoState = url.searchParams.get("state")!;

    // Backdate the state by accessing the internal map via a round-trip:
    // We cannot access the Map directly, but we can rely on the TTL check.
    // Monkey-patch Date.now to simulate expiry during handleCallback.
    const realNow = Date.now;
    Date.now = () => realNow() + 11 * 60 * 1000; // 11 minutes in the future

    global.fetch = mockFetch(200, {
      access_token: "at",
      refresh_token: "rt",
      token_type: "bearer",
      expires_in: 3600,
    });

    try {
      await expect(
        handleCallback("fg-code-expired", forgejoState),
      ).rejects.toThrow("Authorization state expired");
    } finally {
      Date.now = realNow;
    }
  });

  test("state is consumed after first use", async () => {
    const { verifier, challenge } = generatePkce();
    const { forgejoState } = await createValidAuthState(challenge);

    global.fetch = mockFetch(200, {
      access_token: "at-once",
      refresh_token: "rt-once",
      token_type: "bearer",
      expires_in: 3600,
    });

    await handleCallback("fg-code-once", forgejoState);

    await expect(
      handleCallback("fg-code-once-2", forgejoState),
    ).rejects.toThrow("Unknown or expired authorization state");
  });

  test("Forgejo non-200 response throws", async () => {
    const { challenge } = generatePkce();
    const { forgejoState } = await createValidAuthState(challenge);

    global.fetch = (async () =>
      new Response("Bad Request", {
        status: 400,
      })) as unknown as typeof global.fetch;

    await expect(handleCallback("fg-code-bad", forgejoState)).rejects.toThrow(
      "Forgejo token exchange failed",
    );
  });

  test("Forgejo 200 without access_token throws", async () => {
    const { challenge } = generatePkce();
    const { forgejoState } = await createValidAuthState(challenge);

    global.fetch = mockFetch(200, { token_type: "bearer" });

    await expect(handleCallback("fg-code-noat", forgejoState)).rejects.toThrow(
      "Forgejo did not return an access_token",
    );
  });
});

// ---------------------------------------------------------------------------
// exchangeCode
// ---------------------------------------------------------------------------

describe("exchangeCode", () => {
  /** Helper: run the full flow up to code issuance, return the local code + context. */
  async function issueCode(pkce: { verifier: string; challenge: string }) {
    const client = registerClient({
      redirect_uris: ["http://localhost:7000/cb"],
    });

    const { forgejoAuthorizeUrl } = startAuthorize({
      client_id: client.client_id,
      redirect_uri: "http://localhost:7000/cb",
      state: "exchange-state",
      code_challenge: pkce.challenge,
      code_challenge_method: "S256",
    });

    const forgejoState = new URL(forgejoAuthorizeUrl).searchParams.get(
      "state",
    )!;

    global.fetch = mockFetch(200, {
      access_token: "fg-at-exchange",
      refresh_token: "fg-rt-exchange",
      token_type: "bearer",
      expires_in: 3600,
    });

    const { redirectUrl } = await handleCallback("fg-code-ex", forgejoState);
    const localCode = new URL(redirectUrl).searchParams.get("code")!;

    return { client, localCode };
  }

  test("valid code + correct PKCE verifier returns tokens", async () => {
    const pkce = generatePkce();
    const { client, localCode } = await issueCode(pkce);

    const tokens = await exchangeCode({
      code: localCode,
      code_verifier: pkce.verifier,
      redirect_uri: "http://localhost:7000/cb",
      client_id: client.client_id,
    });

    expect(tokens.access_token).toBe("fg-at-exchange");
    expect(tokens.refresh_token).toBe("fg-rt-exchange");
    expect(tokens.token_type).toBe("bearer");
    expect(tokens.expires_in).toBe(3600);
  });

  test("unknown code throws", async () => {
    await expect(
      exchangeCode({
        code: "nonexistent-code",
        code_verifier: "v",
        redirect_uri: "http://localhost:7000/cb",
        client_id: "cid",
      }),
    ).rejects.toThrow("Unknown or expired authorization code");
  });

  test("expired code throws", async () => {
    const pkce = generatePkce();
    const { client, localCode } = await issueCode(pkce);

    const realNow = Date.now;
    Date.now = () => realNow() + 6 * 60 * 1000; // 6 minutes — beyond 5 min TTL

    try {
      await expect(
        exchangeCode({
          code: localCode,
          code_verifier: pkce.verifier,
          redirect_uri: "http://localhost:7000/cb",
          client_id: client.client_id,
        }),
      ).rejects.toThrow("Authorization code expired");
    } finally {
      Date.now = realNow;
    }
  });

  test("code is single-use", async () => {
    const pkce = generatePkce();
    const { client, localCode } = await issueCode(pkce);

    await exchangeCode({
      code: localCode,
      code_verifier: pkce.verifier,
      redirect_uri: "http://localhost:7000/cb",
      client_id: client.client_id,
    });

    await expect(
      exchangeCode({
        code: localCode,
        code_verifier: pkce.verifier,
        redirect_uri: "http://localhost:7000/cb",
        client_id: client.client_id,
      }),
    ).rejects.toThrow("Unknown or expired authorization code");
  });

  test("wrong client_id throws", async () => {
    const pkce = generatePkce();
    const { localCode } = await issueCode(pkce);

    await expect(
      exchangeCode({
        code: localCode,
        code_verifier: pkce.verifier,
        redirect_uri: "http://localhost:7000/cb",
        client_id: "wrong-client-id",
      }),
    ).rejects.toThrow("client_id mismatch");
  });

  test("wrong redirect_uri throws", async () => {
    const pkce = generatePkce();
    const { client, localCode } = await issueCode(pkce);

    await expect(
      exchangeCode({
        code: localCode,
        code_verifier: pkce.verifier,
        redirect_uri: "http://localhost:9999/wrong",
        client_id: client.client_id,
      }),
    ).rejects.toThrow("redirect_uri mismatch");
  });

  test("wrong PKCE verifier throws", async () => {
    const pkce = generatePkce();
    const { client, localCode } = await issueCode(pkce);

    await expect(
      exchangeCode({
        code: localCode,
        code_verifier: "completely-wrong-verifier",
        redirect_uri: "http://localhost:7000/cb",
        client_id: client.client_id,
      }),
    ).rejects.toThrow("PKCE verification failed");
  });
});

// ---------------------------------------------------------------------------
// refreshToken
// ---------------------------------------------------------------------------

describe("refreshToken", () => {
  test("Forgejo success returns new tokens", async () => {
    global.fetch = mockFetch(200, {
      access_token: "new-at",
      token_type: "bearer",
      refresh_token: "new-rt",
      expires_in: 7200,
    });

    const tokens = await refreshToken("old-refresh-token");
    expect(tokens.access_token).toBe("new-at");
    expect(tokens.token_type).toBe("bearer");
    expect(tokens.refresh_token).toBe("new-rt");
    expect(tokens.expires_in).toBe(7200);
  });

  test("Forgejo non-200 throws", async () => {
    global.fetch = (async () =>
      new Response("Unauthorized", {
        status: 401,
      })) as unknown as typeof global.fetch;

    await expect(refreshToken("bad-token")).rejects.toThrow(
      "Forgejo token refresh failed",
    );
  });

  test("Forgejo 200 without access_token throws", async () => {
    global.fetch = mockFetch(200, { token_type: "bearer" });

    await expect(refreshToken("missing-at-token")).rejects.toThrow(
      "Forgejo did not return an access_token",
    );
  });
});
