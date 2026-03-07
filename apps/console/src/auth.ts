import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import pool from "@/lib/db";

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
          providerId: "github",
          clientId: process.env.AUTH_GITHUB_ID!,
          clientSecret: process.env.AUTH_GITHUB_SECRET!,
          authorizationUrl: "https://github.com/login/oauth/authorize",
          tokenUrl: "https://github.com/login/oauth/access_token",
          userInfoUrl: "https://api.github.com/user",
          pkce: true,
          scopes: ["read:user", "user:email"],
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
