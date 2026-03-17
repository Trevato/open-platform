import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AuthenticatedUser } from "../../auth.js";
import * as instanceService from "../../services/instance.js";
import {
  getInstanceServiceStatuses,
  getInstanceApps,
} from "../../services/k8s.js";

const text = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

function sanitize({
  admin_password,
  kubeconfig,
  cluster_ip,
  ...safe
}: Record<string, unknown>) {
  return safe;
}

export function registerInstanceTools(
  server: McpServer,
  user: AuthenticatedUser,
) {
  server.tool(
    "list_instances",
    "List instances",
    {
      all: z
        .boolean()
        .optional()
        .describe("If true, list all instances (admin only)"),
    },
    async ({ all }) => {
      const result = await instanceService.listInstances(user, all || false);
      return text(
        result.map((i) => sanitize(i as unknown as Record<string, unknown>)),
      );
    },
  );

  server.tool(
    "create_instance",
    "Create a new instance",
    {
      slug: z
        .string()
        .describe("URL-safe name (3-32 chars, lowercase, start with letter)"),
      display_name: z.string().describe("Human-readable name (2-64 chars)"),
      admin_email: z.string().email().describe("Admin email"),
      tier: z
        .enum(["free", "pro", "team"])
        .optional()
        .describe("Resource tier (default: free)"),
    },
    async (args) => {
      const result = await instanceService.createInstance(user, args);
      return text(result);
    },
  );

  server.tool(
    "get_instance",
    "Get instance details",
    {
      slug: z.string().describe("Instance slug"),
    },
    async ({ slug }) => {
      const result = await instanceService.getInstanceAccess(slug, user);
      if (!result) return text({ error: "Not found" });
      const events = await instanceService.getEvents(slug, user);
      return text({
        instance: sanitize(
          result.instance as unknown as Record<string, unknown>,
        ),
        events,
      });
    },
  );

  server.tool(
    "delete_instance",
    "Delete (terminate) an instance",
    {
      slug: z.string().describe("Instance slug"),
    },
    async ({ slug }) => {
      const result = await instanceService.deleteInstance(slug, user);
      return text(result);
    },
  );

  server.tool(
    "get_instance_credentials",
    "Get instance admin credentials",
    {
      slug: z.string().describe("Instance slug"),
    },
    async ({ slug }) => {
      const result = await instanceService.getCredentials(slug, user);
      return text(result);
    },
  );

  server.tool(
    "reset_instance_credentials",
    "Reset instance admin password",
    {
      slug: z.string().describe("Instance slug"),
    },
    async ({ slug }) => {
      const result = await instanceService.resetCredentials(slug, user);
      return text(result);
    },
  );

  server.tool(
    "get_instance_kubeconfig",
    "Get instance kubeconfig",
    {
      slug: z.string().describe("Instance slug"),
    },
    async ({ slug }) => {
      const result = await instanceService.getKubeconfig(slug, user);
      return text(result);
    },
  );

  server.tool(
    "list_instance_services",
    "List services in an instance",
    {
      slug: z.string().describe("Instance slug"),
    },
    async ({ slug }) => {
      const access = await instanceService.getInstanceAccess(slug, user);
      if (!access) return text({ error: "Not found" });
      if (access.instance.status !== "ready") return text({ services: [] });
      const services = await getInstanceServiceStatuses(slug);
      return text({ services });
    },
  );

  server.tool(
    "list_instance_apps",
    "List deployed apps in an instance",
    {
      slug: z.string().describe("Instance slug"),
    },
    async ({ slug }) => {
      const access = await instanceService.getInstanceAccess(slug, user);
      if (!access) return text({ error: "Not found" });
      if (access.instance.status !== "ready") return text({ apps: [] });
      const apps = await getInstanceApps(slug);
      return text({ apps });
    },
  );
}
