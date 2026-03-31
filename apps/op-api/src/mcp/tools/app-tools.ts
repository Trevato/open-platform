import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as k8sService from "../../services/k8s.js";

const text = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

export function registerAppTools(server: McpServer) {
  server.tool("list_apps", "List all deployed applications", {}, async () => {
    return text(await k8sService.getApps());
  });

  server.tool(
    "get_app_status",
    "Get application deployment status",
    {
      org: z.string().describe("Organization name"),
      repo: z.string().describe("Repository / app name"),
    },
    async ({ org, repo }) => {
      const app = await k8sService.getAppStatus(org, repo);
      return text(app || { error: "App not found" });
    },
  );

  server.tool(
    "get_platform_status",
    "Get platform health and all service statuses",
    {},
    async () => {
      const [services, apps] = await Promise.all([
        k8sService.getServiceStatuses(),
        k8sService.getApps(),
      ]);
      return text({
        healthy: services.every((s) => s.ready),
        services,
        apps,
      });
    },
  );

  server.tool(
    "get_preview_status",
    "Get the deployment status of a PR preview environment. Returns URL, readiness, and replica info.",
    {
      org: z.string().describe("Organization name"),
      repo: z.string().describe("Repository / app name"),
      pr: z.number().describe("Pull request number"),
    },
    async ({ org, repo, pr }) => {
      const preview = await k8sService.getPreviewStatus(org, repo, pr);
      return text(preview || { error: "Preview not found" });
    },
  );

  server.tool(
    "list_previews",
    "List all active preview environments for a repository",
    {
      org: z.string().describe("Organization name"),
      repo: z.string().describe("Repository / app name"),
    },
    async ({ org, repo }) => {
      return text(await k8sService.listPreviews(org, repo));
    },
  );
}
