import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ForgejoClient } from "../../services/forgejo.js";
import type { AuthenticatedUser } from "../../auth.js";
import { isSystemOrgMember } from "../../auth.js";

const text = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

async function checkAdmin(user: AuthenticatedUser): Promise<boolean> {
  return user.isAdmin || (await isSystemOrgMember(user.token, user.login));
}

export function registerOrgTools(
  server: McpServer,
  forgejo: ForgejoClient,
  user: AuthenticatedUser,
) {
  server.tool(
    "list_orgs",
    "List organizations accessible to the user",
    {},
    async () => {
      return text(await forgejo.listOrgs());
    },
  );

  server.tool(
    "create_org",
    "Create a new organization (admin only)",
    {
      name: z.string().describe("Organization name"),
      description: z.string().optional().describe("Organization description"),
    },
    async ({ name, description }) => {
      if (!(await checkAdmin(user)))
        return text({ error: "Admin access required" });
      const org = await forgejo.createOrg(name, { description });
      return text({ created: true, name: org.name });
    },
  );
}
