import { randomUUID, randomBytes, createHash, timingSafeEqual } from "crypto";
import { logger } from "../logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OAuthClient {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
}

export interface PendingAuth {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  originalState: string;
  forgejoState: string;
  forgejoCodeVerifier: string;
  createdAt: number;
}

export interface IssuedCode {
  forgejoAccessToken: string;
  forgejoRefreshToken: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

const clients = new Map<string, OAuthClient>();
const authStates = new Map<string, PendingAuth>();
const authCodes = new Map<string, IssuedCode>();

const AUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const AUTH_CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Evict expired entries every 5 minutes
setInterval(
  () => {
    const now = Date.now();
    let statesEvicted = 0;
    let codesEvicted = 0;

    for (const [key, pending] of authStates) {
      if (now - pending.createdAt > AUTH_STATE_TTL_MS) {
        authStates.delete(key);
        statesEvicted++;
      }
    }

    for (const [key, issued] of authCodes) {
      if (now - issued.createdAt > AUTH_CODE_TTL_MS) {
        authCodes.delete(key);
        codesEvicted++;
      }
    }

    if (statesEvicted || codesEvicted) {
      logger.debug(
        { statesEvicted, codesEvicted },
        "oauth provider: TTL cleanup",
      );
    }
  },
  5 * 60 * 1000,
).unref();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LOOPBACK_RE = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/.*)?$/;

function callbackUrl(): string {
  const prefix = process.env.SERVICE_PREFIX || "";
  const domain = process.env.PLATFORM_DOMAIN || "";
  return `https://${prefix}api.${domain}/oauth/callback`;
}

function base64url(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function verifyPkce(verifier: string | undefined, challenge: string): boolean {
  if (!verifier) return false;
  const computed = base64url(createHash("sha256").update(verifier).digest());
  if (computed.length !== challenge.length) return false;
  return timingSafeEqual(Buffer.from(computed), Buffer.from(challenge));
}

// ---------------------------------------------------------------------------
// Client Registration (RFC 7591)
// ---------------------------------------------------------------------------

export function registerClient(info: {
  redirect_uris: string[];
  client_name?: string;
  grant_types?: string[];
  response_types?: string[];
  token_endpoint_auth_method?: string;
}): OAuthClient {
  if (!info.redirect_uris?.length) {
    throw new Error("redirect_uris is required and must not be empty");
  }

  for (const uri of info.redirect_uris) {
    if (!LOOPBACK_RE.test(uri)) {
      throw new Error(
        `Invalid redirect_uri: ${uri} — only http://127.0.0.1 and http://localhost are allowed`,
      );
    }
  }

  const client: OAuthClient = {
    client_id: randomUUID(),
    client_name: info.client_name || "MCP Client",
    redirect_uris: info.redirect_uris,
    grant_types: info.grant_types || ["authorization_code", "refresh_token"],
    response_types: info.response_types || ["code"],
    token_endpoint_auth_method: info.token_endpoint_auth_method || "none",
  };

  clients.set(client.client_id, client);
  logger.debug(
    { clientId: client.client_id, name: client.client_name },
    "oauth provider: client registered",
  );

  return client;
}

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

export function startAuthorize(params: {
  client_id: string;
  redirect_uri: string;
  state: string;
  code_challenge: string;
  code_challenge_method: string;
  scope?: string;
}): { forgejoAuthorizeUrl: string } {
  const clientId = params.client_id.trim();
  const client = clients.get(clientId);
  if (!client) {
    throw new Error(`Unknown client_id: ${clientId}`);
  }

  const redirectUri = params.redirect_uri.trim();
  if (!client.redirect_uris.includes(redirectUri)) {
    throw new Error(
      `redirect_uri ${redirectUri} not registered for client ${clientId}`,
    );
  }

  const forgejoState = randomUUID();

  // Generate PKCE pair for the op-api → Forgejo leg
  const forgejoCodeVerifier = base64url(randomBytes(32));
  const forgejoCodeChallenge = base64url(
    createHash("sha256").update(forgejoCodeVerifier).digest(),
  );

  authStates.set(forgejoState, {
    clientId,
    redirectUri,
    codeChallenge: params.code_challenge,
    codeChallengeMethod: params.code_challenge_method,
    originalState: params.state,
    forgejoState,
    forgejoCodeVerifier,
    createdAt: Date.now(),
  });

  const forgejoUrl = process.env.FORGEJO_URL || "";
  const mcpClientId = process.env.MCP_OAUTH_CLIENT_ID || "";
  if (!mcpClientId) {
    throw new Error(
      "MCP OAuth not configured — MCP_OAUTH_CLIENT_ID is missing",
    );
  }
  const cb = callbackUrl();

  const authorizeUrl =
    `${forgejoUrl}/login/oauth/authorize` +
    `?client_id=${encodeURIComponent(mcpClientId)}` +
    `&redirect_uri=${encodeURIComponent(cb)}` +
    `&response_type=code` +
    `&state=${encodeURIComponent(forgejoState)}` +
    `&code_challenge=${encodeURIComponent(forgejoCodeChallenge)}` +
    `&code_challenge_method=S256`;

  logger.debug(
    { clientId: params.client_id, forgejoState },
    "oauth provider: authorization started",
  );

  return { forgejoAuthorizeUrl: authorizeUrl };
}

// ---------------------------------------------------------------------------
// Callback (Forgejo redirects back)
// ---------------------------------------------------------------------------

export async function handleCallback(
  forgejoCode: string,
  state: string,
): Promise<{ redirectUrl: string }> {
  const pending = authStates.get(state);
  if (!pending) {
    throw new Error("Unknown or expired authorization state");
  }

  authStates.delete(state);

  if (Date.now() - pending.createdAt > AUTH_STATE_TTL_MS) {
    throw new Error("Authorization state expired");
  }

  const internalUrl =
    process.env.FORGEJO_INTERNAL_URL || process.env.FORGEJO_URL || "";
  const mcpClientId = process.env.MCP_OAUTH_CLIENT_ID || "";
  const mcpClientSecret = process.env.MCP_OAUTH_CLIENT_SECRET || "";
  if (!mcpClientId || !mcpClientSecret) {
    throw new Error(
      "MCP OAuth not configured — MCP_OAUTH_CLIENT_ID or MCP_OAUTH_CLIENT_SECRET is missing",
    );
  }
  const cb = callbackUrl();

  const body = new URLSearchParams({
    client_id: mcpClientId,
    client_secret: mcpClientSecret,
    code: forgejoCode,
    grant_type: "authorization_code",
    redirect_uri: cb,
    code_verifier: pending.forgejoCodeVerifier,
  });

  logger.debug("oauth provider: exchanging code with Forgejo");

  const res = await fetch(`${internalUrl}/login/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    logger.warn(
      { status: res.status, body: text },
      "oauth provider: Forgejo token exchange failed",
    );
    throw new Error(`Forgejo token exchange failed: ${res.status}`);
  }

  const tokens = (await res.json()) as {
    access_token: string;
    token_type: string;
    refresh_token: string;
    expires_in: number;
  };

  if (!tokens.access_token) {
    logger.warn(
      { tokens },
      "oauth provider: Forgejo token response missing access_token",
    );
    throw new Error("Forgejo did not return an access_token");
  }

  const localCode = randomUUID();

  authCodes.set(localCode, {
    forgejoAccessToken: tokens.access_token,
    forgejoRefreshToken: tokens.refresh_token,
    clientId: pending.clientId,
    redirectUri: pending.redirectUri,
    codeChallenge: pending.codeChallenge,
    codeChallengeMethod: pending.codeChallengeMethod,
    createdAt: Date.now(),
  });

  // Append code and state using URL so existing query params are preserved correctly
  const redirectUrlObj = new URL(pending.redirectUri);
  redirectUrlObj.searchParams.set("code", localCode);
  redirectUrlObj.searchParams.set("state", pending.originalState);
  const redirectUrl = redirectUrlObj.toString();

  logger.debug(
    { clientId: pending.clientId },
    "oauth provider: callback complete, issuing local code",
  );

  return { redirectUrl };
}

// ---------------------------------------------------------------------------
// Token Exchange
// ---------------------------------------------------------------------------

export async function exchangeCode(params: {
  code: string;
  code_verifier: string;
  redirect_uri: string;
  client_id: string;
}): Promise<{
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
}> {
  const issued = authCodes.get(params.code);
  if (!issued) {
    throw new Error("Unknown or expired authorization code");
  }

  authCodes.delete(params.code);

  if (Date.now() - issued.createdAt > AUTH_CODE_TTL_MS) {
    throw new Error("Authorization code expired");
  }

  if (issued.clientId !== params.client_id) {
    logger.warn(
      { expected: issued.clientId, received: params.client_id },
      "oauth provider: client_id mismatch on code exchange",
    );
    throw new Error("client_id mismatch");
  }

  if (issued.redirectUri !== params.redirect_uri) {
    logger.warn(
      { expected: issued.redirectUri, received: params.redirect_uri },
      "oauth provider: redirect_uri mismatch on code exchange",
    );
    throw new Error("redirect_uri mismatch");
  }

  if (!verifyPkce(params.code_verifier, issued.codeChallenge)) {
    logger.warn("oauth provider: PKCE verification failed");
    throw new Error("PKCE verification failed");
  }

  logger.debug(
    { clientId: params.client_id },
    "oauth provider: code exchanged for tokens",
  );

  return {
    access_token: issued.forgejoAccessToken,
    token_type: "bearer",
    expires_in: 3600,
    refresh_token: issued.forgejoRefreshToken,
  };
}

// ---------------------------------------------------------------------------
// Token Refresh
// ---------------------------------------------------------------------------

export async function refreshToken(refreshTokenValue: string): Promise<{
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
}> {
  const internalUrl =
    process.env.FORGEJO_INTERNAL_URL || process.env.FORGEJO_URL || "";
  const mcpClientId = process.env.MCP_OAUTH_CLIENT_ID || "";
  const mcpClientSecret = process.env.MCP_OAUTH_CLIENT_SECRET || "";

  const body = new URLSearchParams({
    client_id: mcpClientId,
    client_secret: mcpClientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshTokenValue,
  });

  logger.debug("oauth provider: refreshing token via Forgejo");

  const res = await fetch(`${internalUrl}/login/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    logger.warn(
      { status: res.status, body: text },
      "oauth provider: Forgejo token refresh failed",
    );
    throw new Error(`Forgejo token refresh failed: ${res.status}`);
  }

  const tokens = (await res.json()) as {
    access_token: string;
    token_type: string;
    refresh_token: string;
    expires_in: number;
  };

  if (!tokens.access_token) {
    logger.warn(
      { tokens },
      "oauth provider: Forgejo refresh response missing access_token",
    );
    throw new Error("Forgejo did not return an access_token");
  }

  logger.debug("oauth provider: token refreshed");

  return {
    access_token: tokens.access_token,
    token_type: tokens.token_type || "bearer",
    expires_in: tokens.expires_in || 3600,
    refresh_token: tokens.refresh_token,
  };
}

// ---------------------------------------------------------------------------
// Client Lookup
// ---------------------------------------------------------------------------

export function getClient(clientId: string): OAuthClient | undefined {
  return clients.get(clientId);
}
