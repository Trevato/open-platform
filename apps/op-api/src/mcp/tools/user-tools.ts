import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthenticatedUser } from "../../auth.js";

const text = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

export function registerUserTools(
  server: McpServer,
  user: AuthenticatedUser,
) {
  server.tool(
    "whoami",
    "Get current authenticated user info",
    {},
    async () => {
      return text({
        login: user.login,
        email: user.email,
        fullName: user.fullName,
        isAdmin: user.isAdmin,
      });
    },
  );
}
