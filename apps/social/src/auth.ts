import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import pool from "@/lib/db";

// Browser-facing URL (used for OAuth authorize redirect — must be publicly reachable)
const forgejoUrl = process.env.AUTH_FORGEJO_URL || "https://forgejo.product-garden.com";
// Server-side URL (used for token exchange and API calls — resolved via CoreDNS internally)
const forgejoInternalUrl = process.env.AUTH_FORGEJO_INTERNAL_URL || "https://forgejo.dev.test";

export const auth = betterAuth({
  database: pool,
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  plugins: [
    nextCookies(),
    genericOAuth({
      config: [
        {
          providerId: "forgejo",
          clientId: process.env.AUTH_FORGEJO_ID!,
          clientSecret: process.env.AUTH_FORGEJO_SECRET!,
          authorizationUrl: `${forgejoUrl}/login/oauth/authorize`,
          tokenUrl: `${forgejoInternalUrl}/login/oauth/access_token`,
          userInfoUrl: `${forgejoInternalUrl}/api/v1/user`,
          pkce: true,
          scopes: [],
          mapProfileToUser: (profile) => ({
            name: profile.login,
            email: profile.email,
            image: profile.avatar_url,
          }),
        },
      ],
    }),
  ],
});
