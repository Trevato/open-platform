import { Elysia } from "elysia";
import { authPlugin } from "../auth.js";

export const usersPlugin = new Elysia({ prefix: "/users" })
  .use(authPlugin)
  .get(
    "/me",
    ({ user }) => ({
      id: user.id,
      login: user.login,
      email: user.email,
      fullName: user.fullName,
      isAdmin: user.isAdmin,
      avatarUrl: user.avatarUrl,
    }),
    {
      detail: { tags: ["Users"], summary: "Current user profile" },
    },
  )
  .get(
    "/me/connection",
    ({ user }) => {
      const prefix = process.env.SERVICE_PREFIX || "";
      const domain = process.env.PLATFORM_DOMAIN || "open-platform.sh";
      return {
        mcp_url: `https://${prefix}api.${domain}/mcp`,
        token: user.token,
        username: user.login,
      };
    },
    {
      detail: {
        tags: ["Users"],
        summary: "Get MCP connection info for current user",
      },
    },
  );
