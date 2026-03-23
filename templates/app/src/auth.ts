import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import pool from "@/lib/db";

const forgejoUrl = process.env.AUTH_FORGEJO_URL!;
const forgejoInternalUrl = process.env.AUTH_FORGEJO_INTERNAL_URL || forgejoUrl;

const cookiePrefix = process.env.BETTER_AUTH_URL
  ? new URL(process.env.BETTER_AUTH_URL).hostname.split(".")[0]
  : "app";

export const auth = betterAuth({
  database: pool,
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: process.env.BETTER_AUTH_TRUSTED_ORIGINS
    ? process.env.BETTER_AUTH_TRUSTED_ORIGINS.split(",")
    : [],
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh daily (sliding window)
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5-min cache reduces DB hits
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["forgejo"],
    },
  },
  advanced: {
    cookiePrefix,
    defaultCookieAttributes: {
      sameSite: "lax" as const,
      secure: true,
    },
  },
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
