import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import pool from "@/lib/db";

const issuer = process.env.AUTH_FORGEJO_ISSUER || "https://forgejo.dev.test";

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
          authorizationUrl: `${issuer}/login/oauth/authorize`,
          tokenUrl: `${issuer}/login/oauth/access_token`,
          userInfoUrl: `${issuer}/api/v1/user`,
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
