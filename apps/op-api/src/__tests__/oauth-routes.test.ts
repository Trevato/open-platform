import { describe, test, expect, beforeAll, afterEach } from "bun:test";

// ── Env vars (must be set before importing oauth-routes) ────────────────
// The issuer constant in oauth-routes.ts is evaluated at module load time,
// so env vars must exist before the import.

process.env.PLATFORM_DOMAIN = "test.example.com";
process.env.SERVICE_PREFIX = "";
process.env.FORGEJO_URL = "http://forgejo.test";
process.env.FORGEJO_INTERNAL_URL = "http://forgejo-internal.test";
process.env.MCP_OAUTH_CLIENT_ID = "test-forgejo-client-id";
process.env.MCP_OAUTH_CLIENT_SECRET = "test-forgejo-client-secret";

import { Elysia } from "elysia";
import { oauthRoutes } from "../auth/oauth-routes.js";

// ── App under test ──────────────────────────────────────────────────────

const app = new Elysia().use(oauthRoutes);
const BASE = "http://localhost";

// ── Fetch mock management ───────────────────────────────────────────────

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ── Helpers ─────────────────────────────────────────────────────────────

async function registerTestClient(
  redirectUri = "http://localhost:3000/callback",
) {
  const res = await app.handle(
    new Request(`${BASE}/oauth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redirect_uris: [redirectUri] }),
    }),
  );
  return (await res.json()) as {
    client_id: string;
    redirect_uris: string[];
    [key: string]: unknown;
  };
}

function authorizeUrl(params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  return `${BASE}/oauth/authorize?${qs}`;
}

// ── Discovery ───────────────────────────────────────────────────────────

describe("GET /.well-known/oauth-authorization-server", () => {
  test("returns 200 with correct metadata shape", async () => {
    const res = await app.handle(
      new Request(`${BASE}/.well-known/oauth-authorization-server`),
    );
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("issuer");
    expect(body).toHaveProperty("authorization_endpoint");
    expect(body).toHaveProperty("token_endpoint");
    expect(body).toHaveProperty("registration_endpoint");
    expect(body).toHaveProperty("response_types_supported");
    expect(body).toHaveProperty("grant_types_supported");
    expect(body).toHaveProperty("code_challenge_methods_supported");
  });

  test("endpoints derive from issuer consistently", async () => {
    const res = await app.handle(
      new Request(`${BASE}/.well-known/oauth-authorization-server`),
    );
    const body = (await res.json()) as Record<string, unknown>;
    // The issuer is computed at module load time from SERVICE_PREFIX and
    // PLATFORM_DOMAIN. Verify structural consistency: all endpoints must
    // be rooted at the same issuer.
    expect(body.issuer).toMatch(/^https:\/\//);
    expect(body.authorization_endpoint).toBe(`${body.issuer}/oauth/authorize`);
    expect(body.token_endpoint).toBe(`${body.issuer}/oauth/token`);
    expect(body.registration_endpoint).toBe(`${body.issuer}/oauth/register`);
  });
});

// ── Client Registration ─────────────────────────────────────────────────

describe("POST /oauth/register", () => {
  test("valid loopback redirect_uri returns 201 with client_id", async () => {
    const res = await app.handle(
      new Request(`${BASE}/oauth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          redirect_uris: ["http://localhost:3000/callback"],
        }),
      }),
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { client_id: string };
    expect(body.client_id).toBeDefined();
    expect(typeof body.client_id).toBe("string");
  });

  test("non-loopback redirect_uri returns 400", async () => {
    const res = await app.handle(
      new Request(`${BASE}/oauth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          redirect_uris: ["https://evil.example.com/callback"],
        }),
      }),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_redirect_uri");
  });

  test("missing redirect_uris field returns 422", async () => {
    const res = await app.handle(
      new Request(`${BASE}/oauth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_name: "No URIs" }),
      }),
    );

    expect(res.status).toBe(422);
  });

  test("empty redirect_uris array returns 400", async () => {
    const res = await app.handle(
      new Request(`${BASE}/oauth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ redirect_uris: [] }),
      }),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_redirect_uri");
  });
});

// ── Authorization ───────────────────────────────────────────────────────

describe("GET /oauth/authorize", () => {
  let clientId: string;
  const redirectUri = "http://localhost:3000/callback";

  beforeAll(async () => {
    const client = await registerTestClient(redirectUri);
    clientId = client.client_id;
  });

  test("valid params redirect to Forgejo authorize URL", async () => {
    const res = await app.handle(
      new Request(
        authorizeUrl({
          client_id: clientId,
          redirect_uri: redirectUri,
          state: "test-state",
          code_challenge: "abc123",
          code_challenge_method: "S256",
          response_type: "code",
        }),
        { redirect: "manual" },
      ),
    );

    expect(res.status).toBe(302);
    const location = res.headers.get("location") || "";
    expect(location).toContain("forgejo.test/login/oauth/authorize");
    expect(location).toContain("client_id=test-forgejo-client-id");
  });

  test("response_type=token returns error redirect", async () => {
    const res = await app.handle(
      new Request(
        authorizeUrl({
          client_id: clientId,
          redirect_uri: redirectUri,
          state: "test-state",
          code_challenge: "abc123",
          code_challenge_method: "S256",
          response_type: "token",
        }),
        { redirect: "manual" },
      ),
    );

    expect(res.status).toBe(302);
    const location = res.headers.get("location") || "";
    expect(location).toContain("error=invalid_request");
    expect(location).toContain(encodeURIComponent("response_type must be"));
  });

  test("code_challenge_method=plain returns error redirect", async () => {
    const res = await app.handle(
      new Request(
        authorizeUrl({
          client_id: clientId,
          redirect_uri: redirectUri,
          state: "test-state",
          code_challenge: "abc123",
          code_challenge_method: "plain",
          response_type: "code",
        }),
        { redirect: "manual" },
      ),
    );

    expect(res.status).toBe(302);
    const location = res.headers.get("location") || "";
    expect(location).toContain("error=invalid_request");
    expect(location).toContain(
      encodeURIComponent("code_challenge_method must be"),
    );
  });

  test("unknown client_id returns 400", async () => {
    const res = await app.handle(
      new Request(
        authorizeUrl({
          client_id: "nonexistent-client-id",
          redirect_uri: redirectUri,
          state: "test-state",
          code_challenge: "abc123",
          code_challenge_method: "S256",
          response_type: "code",
        }),
      ),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_request");
  });

  test("missing required params returns 422", async () => {
    const res = await app.handle(
      new Request(`${BASE}/oauth/authorize?client_id=${clientId}`),
    );

    expect(res.status).toBe(422);
  });
});

// ── Callback ────────────────────────────────────────────────────────────

describe("GET /oauth/callback", () => {
  test("error from Forgejo returns 400 with access_denied", async () => {
    const res = await app.handle(
      new Request(
        `${BASE}/oauth/callback?error=access_denied&error_description=User+denied`,
      ),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      error: string;
      error_description: string;
    };
    expect(body.error).toBe("access_denied");
    expect(body.error_description).toBe("User denied");
  });

  test("missing code and state returns 400", async () => {
    const res = await app.handle(new Request(`${BASE}/oauth/callback`));

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_request");
  });

  test("unknown state returns 400 with callback_failed", async () => {
    const res = await app.handle(
      new Request(
        `${BASE}/oauth/callback?code=some-code&state=unknown-state-value`,
      ),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("callback_failed");
  });
});

// ── Token Exchange ──────────────────────────────────────────────────────

describe("POST /oauth/token", () => {
  test("refresh_token grant without refresh_token returns 400", async () => {
    const res = await app.handle(
      new Request(`${BASE}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
        }).toString(),
      }),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_request");
  });

  test("unsupported grant_type returns 400", async () => {
    const res = await app.handle(
      new Request(`${BASE}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
        }).toString(),
      }),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("unsupported_grant_type");
  });

  test("unparseable body returns 400", async () => {
    const res = await app.handle(
      new Request(`${BASE}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "this is not valid json{{{",
      }),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_request");
  });

  test("full authorization_code flow exchanges tokens", async () => {
    // 1. Register a client
    const client = await registerTestClient("http://localhost:9999/cb");

    // 2. Start authorize — capture state from Forgejo redirect URL
    const authRes = await app.handle(
      new Request(
        authorizeUrl({
          client_id: client.client_id,
          redirect_uri: "http://localhost:9999/cb",
          state: "original-client-state",
          code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
          code_challenge_method: "S256",
          response_type: "code",
        }),
        { redirect: "manual" },
      ),
    );
    expect(authRes.status).toBe(302);

    const location = authRes.headers.get("location") || "";
    const forgejoState = new URL(location).searchParams.get("state")!;

    // 3. Mock Forgejo token exchange
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/login/oauth/access_token")) {
        return new Response(
          JSON.stringify({
            access_token: "forgejo-access-token-123",
            token_type: "bearer",
            refresh_token: "forgejo-refresh-token-456",
            expires_in: 7200,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      return originalFetch(input);
    }) as typeof fetch;

    // 4. Simulate Forgejo callback with the state
    const callbackRes = await app.handle(
      new Request(
        `${BASE}/oauth/callback?code=forgejo-auth-code&state=${forgejoState}`,
        { redirect: "manual" },
      ),
    );
    expect(callbackRes.status).toBe(302);

    const callbackLocation = callbackRes.headers.get("location") || "";
    const callbackUrl = new URL(callbackLocation);
    const localCode = callbackUrl.searchParams.get("code")!;
    const returnedState = callbackUrl.searchParams.get("state");

    expect(localCode).toBeDefined();
    expect(returnedState).toBe("original-client-state");

    // 5. Exchange local code for tokens (PKCE verifier matches challenge)
    // SHA256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk") base64url = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    const tokenRes = await app.handle(
      new Request(`${BASE}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: localCode,
          code_verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
          redirect_uri: "http://localhost:9999/cb",
          client_id: client.client_id,
        }).toString(),
      }),
    );

    expect(tokenRes.status).toBe(200);
    const tokens = (await tokenRes.json()) as {
      access_token: string;
      token_type: string;
      refresh_token: string;
      expires_in: number;
    };
    expect(tokens.access_token).toBe("forgejo-access-token-123");
    expect(tokens.token_type).toBe("bearer");
    expect(tokens.refresh_token).toBe("forgejo-refresh-token-456");
    expect(typeof tokens.expires_in).toBe("number");
  });
});
