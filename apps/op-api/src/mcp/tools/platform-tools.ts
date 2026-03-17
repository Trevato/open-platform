import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { randomBytes } from "crypto";
import type { ForgejoClient } from "../../services/forgejo.js";
import type { AuthenticatedUser } from "../../auth.js";
import { isSystemOrgMember } from "../../auth.js";
import * as k8sService from "../../services/k8s.js";

const FORGEJO_URL =
  process.env.FORGEJO_INTERNAL_URL || process.env.FORGEJO_URL || "";

const text = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

async function checkAdmin(user: AuthenticatedUser): Promise<boolean> {
  return user.isAdmin || (await isSystemOrgMember(user.token, user.login));
}

export function registerPlatformTools(
  server: McpServer,
  forgejo: ForgejoClient,
  user: AuthenticatedUser,
) {
  server.tool(
    "list_platform_services",
    "List platform service statuses (admin only)",
    {},
    async () => {
      if (!(await checkAdmin(user))) {
        return text({ error: "Admin access required" });
      }
      const services = await k8sService.getServiceStatuses();
      return text({ services });
    },
  );

  server.tool(
    "list_platform_users",
    "List all Forgejo users (admin only). Paginated: use page/limit to navigate.",
    {
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Page number (default: 1)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Results per page, max 50 (default: 50)"),
    },
    async ({ page, limit }) => {
      if (!(await checkAdmin(user))) {
        return text({ error: "Admin access required" });
      }
      const p = page ?? 1;
      const l = limit ?? 50;
      const resp = await fetch(
        `${FORGEJO_URL}/api/v1/admin/users?page=${p}&limit=${l}`,
        {
          headers: {
            Authorization: `token ${user.token}`,
            Accept: "application/json",
          },
        },
      );
      if (!resp.ok) {
        const body = await resp.text();
        return text({ error: `Forgejo API ${resp.status}: ${body}` });
      }
      return text(await resp.json());
    },
  );

  server.tool(
    "create_platform_user",
    "Create a new Forgejo user (admin only)",
    {
      username: z.string().describe("Username for the new user"),
      email: z.string().email().describe("Email address"),
    },
    async ({ username, email }) => {
      if (!(await checkAdmin(user))) {
        return text({ error: "Admin access required" });
      }
      const initialPassword = randomBytes(16).toString("hex");
      const resp = await fetch(`${FORGEJO_URL}/api/v1/admin/users`, {
        method: "POST",
        headers: {
          Authorization: `token ${user.token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          username,
          email,
          password: initialPassword,
          must_change_password: true,
        }),
      });
      if (!resp.ok) {
        const body = await resp.text();
        return text({ error: `Forgejo API ${resp.status}: ${body}` });
      }
      const created = await resp.json();
      return text({
        created: true,
        user: { id: created.id, login: created.login, email: created.email },
        initialPassword,
      });
    },
  );

  server.tool(
    "list_platform_apps",
    "List all deployed applications",
    {},
    async () => {
      return text(await k8sService.getApps());
    },
  );

  server.tool(
    "create_platform_app",
    "Create a new app from the system template (admin only)",
    {
      org: z.string().describe("Target organization"),
      name: z
        .string()
        .regex(/^[a-z][a-z0-9-]{1,30}[a-z0-9]$/)
        .describe("App name (lowercase, hyphens)"),
      description: z.string().optional().describe("App description"),
    },
    async ({ org, name, description }) => {
      if (!(await checkAdmin(user))) {
        return text({ error: "Admin access required" });
      }
      const repo = await forgejo.generateFromTemplate("system", "template", {
        owner: org,
        name,
        description,
      });
      return text({
        created: true,
        fullName: repo.full_name,
        url: repo.html_url,
      });
    },
  );
}
