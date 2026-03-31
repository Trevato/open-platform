import { Elysia, t } from "elysia";
import {
  registerClient,
  startAuthorize,
  handleCallback,
  exchangeCode,
  refreshToken,
} from "./oauth-provider.js";
import { logger } from "../logger.js";

// ─── Constants ───

const prefix = process.env.SERVICE_PREFIX || "";
const domain = process.env.PLATFORM_DOMAIN || "";
const issuer = `https://${prefix}api.${domain}`;

// ─── Plugin ───

export const oauthRoutes = new Elysia()
  .get(
    "/.well-known/oauth-authorization-server",
    () => ({
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/oauth/token`,
      registration_endpoint: `${issuer}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: [
        "read:user",
        "write:repository",
        "read:repository",
        "read:organization",
        "write:issue",
        "read:issue",
      ],
    }),
    { detail: { hide: true } },
  )

  .post(
    "/oauth/register",
    async ({ body, set }) => {
      try {
        const client = await registerClient(body);
        set.status = 201;
        return client;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Registration failed";
        logger.warn({ err }, "OAuth client registration failed");
        set.status = 400;
        return {
          error: "invalid_redirect_uri",
          error_description: message,
        };
      }
    },
    {
      body: t.Object({
        redirect_uris: t.Array(t.String()),
        client_name: t.Optional(t.String()),
        grant_types: t.Optional(t.Array(t.String())),
        response_types: t.Optional(t.Array(t.String())),
        token_endpoint_auth_method: t.Optional(t.String()),
      }),
      detail: { hide: true },
    },
  )

  .get(
    "/oauth/authorize",
    async ({ query, set, redirect }) => {
      if (query.response_type !== "code") {
        return redirect(
          `${query.redirect_uri}?error=invalid_request&error_description=${encodeURIComponent("response_type must be 'code'")}&state=${encodeURIComponent(query.state)}`,
        );
      }

      if (query.code_challenge_method !== "S256") {
        return redirect(
          `${query.redirect_uri}?error=invalid_request&error_description=${encodeURIComponent("code_challenge_method must be 'S256'")}&state=${encodeURIComponent(query.state)}`,
        );
      }

      try {
        const { forgejoAuthorizeUrl } = startAuthorize(query);
        return redirect(forgejoAuthorizeUrl);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Authorization failed";
        logger.warn({ err }, "OAuth authorize failed");

        set.status = 400;
        return {
          error: "invalid_request",
          error_description: message,
        };
      }
    },
    {
      query: t.Object({
        client_id: t.String(),
        redirect_uri: t.String(),
        state: t.String(),
        code_challenge: t.String(),
        code_challenge_method: t.String(),
        response_type: t.String(),
        scope: t.Optional(t.String()),
      }),
      detail: { hide: true },
    },
  )

  .get(
    "/oauth/callback",
    async ({ query, set, redirect }) => {
      // Forgejo may redirect here with an error instead of a code (e.g. user
      // denied access). Surface it as a 400 rather than a schema validation
      // error or a crash.
      if (query.error) {
        const msg = query.error_description || query.error;
        logger.warn(
          { error: query.error },
          "OAuth callback: Forgejo returned error",
        );
        set.status = 400;
        return { error: "access_denied", error_description: msg };
      }

      if (!query.code || !query.state) {
        set.status = 400;
        return {
          error: "invalid_request",
          error_description: "Missing code or state parameter",
        };
      }

      try {
        const { redirectUrl } = await handleCallback(query.code, query.state);
        return redirect(redirectUrl);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Callback processing failed";
        logger.error({ err }, "OAuth callback failed");
        set.status = 400;
        return {
          error: "callback_failed",
          error_description: message,
        };
      }
    },
    {
      query: t.Object(
        {
          // Successful Forgejo redirect
          code: t.Optional(t.String()),
          state: t.Optional(t.String()),
          // Error redirect (RFC 6749 §4.1.2.1)
          error: t.Optional(t.String()),
          error_description: t.Optional(t.String()),
        },
        { additionalProperties: true },
      ),
      detail: { hide: true },
    },
  )

  .post(
    "/oauth/token",
    async ({ request, set }) => {
      const contentType = request.headers.get("content-type") || "";
      let params: Record<string, string>;

      try {
        if (contentType.includes("application/x-www-form-urlencoded")) {
          const text = await request.text();
          params = Object.fromEntries(new URLSearchParams(text));
        } else {
          params = await request.json();
        }
      } catch {
        set.status = 400;
        return {
          error: "invalid_request",
          error_description: "Could not parse request body",
        };
      }

      const { grant_type } = params;

      try {
        if (grant_type === "authorization_code") {
          const tokens = await exchangeCode({
            code: params.code,
            code_verifier: params.code_verifier,
            redirect_uri: params.redirect_uri,
            client_id: params.client_id,
          });
          return tokens;
        }

        if (grant_type === "refresh_token") {
          if (!params.refresh_token) {
            set.status = 400;
            return {
              error: "invalid_request",
              error_description: "refresh_token is required",
            };
          }
          const tokens = await refreshToken(params.refresh_token);
          return tokens;
        }

        set.status = 400;
        return {
          error: "unsupported_grant_type",
          error_description: `Unsupported grant_type: ${grant_type || "(missing)"}`,
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Token exchange failed";
        logger.warn({ err, grant_type }, "OAuth token exchange failed");
        set.status = 400;
        return {
          error: "invalid_grant",
          error_description: message,
        };
      }
    },
    { detail: { hide: true } },
  );
