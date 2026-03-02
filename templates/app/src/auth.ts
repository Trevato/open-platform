import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";

const issuer = process.env.AUTH_FORGEJO_ISSUER || "https://forgejo.dev.test";

const config: NextAuthConfig = {
  providers: [
    {
      id: "forgejo",
      name: "Forgejo",
      type: "oauth",
      clientId: process.env.AUTH_FORGEJO_ID,
      clientSecret: process.env.AUTH_FORGEJO_SECRET,
      authorization: {
        url: `${issuer}/login/oauth/authorize`,
        params: { scope: "" },
      },
      token: `${issuer}/login/oauth/access_token`,
      userinfo: `${issuer}/api/v1/user`,
      profile(profile) {
        return {
          id: String(profile.id),
          name: profile.full_name || profile.login,
          email: profile.email,
          image: profile.avatar_url,
          username: profile.login,
        };
      },
    },
  ],
  session: { strategy: "jwt" },
  callbacks: {
    jwt({ token, profile }) {
      if (profile) {
        token.username = (profile as Record<string, unknown>).login;
      }
      return token;
    },
    session({ session, token }) {
      if (token.username) {
        (session.user as Record<string, unknown>).username = token.username;
      }
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);
