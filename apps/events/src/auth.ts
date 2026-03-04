import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import pool from "@/lib/db";

const forgejoUrl = process.env.AUTH_FORGEJO_URL || "https://forgejo.product-garden.com";
const forgejoInternalUrl = process.env.AUTH_FORGEJO_INTERNAL_URL || forgejoUrl;

export const auth = betterAuth({
  database: pool,
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: process.env.BETTER_AUTH_TRUSTED_ORIGINS
    ? process.env.BETTER_AUTH_TRUSTED_ORIGINS.split(",")
    : [],
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
