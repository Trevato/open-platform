import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AuthenticatedUser } from "../../auth.js";

const PORT = parseInt(process.env.PORT || "3000", 10);

const text = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

async function api(
  user: AuthenticatedUser,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${user.token}`,
    Accept: "application/json",
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`http://localhost:${PORT}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return { ok: true };

  const data = await res.json();
  if (!res.ok) {
    return { error: data.error || res.statusText, status: res.status };
  }
  return data;
}

export function registerDevPodTools(
  server: McpServer,
  user: AuthenticatedUser,
) {
  // ─── Host-level dev pod tools ───

  server.tool(
    "list_dev_pods",
    "List dev pods on the host platform",
    {},
    async () => {
      const result = await api(user, "GET", "/api/v1/dev-pods");
      return text(result);
    },
  );

  server.tool(
    "create_dev_pod",
    "Create a dev pod for the current user",
    {
      cpu_limit: z.string().optional().describe("CPU limit (default: 2000m)"),
      memory_limit: z
        .string()
        .optional()
        .describe("Memory limit (default: 4Gi)"),
      storage_size: z
        .string()
        .optional()
        .describe("Storage size (default: 20Gi)"),
    },
    async (args) => {
      const body: Record<string, string> = {};
      if (args.cpu_limit) body.cpuLimit = args.cpu_limit;
      if (args.memory_limit) body.memoryLimit = args.memory_limit;
      if (args.storage_size) body.storageSize = args.storage_size;
      const result = await api(user, "POST", "/api/v1/dev-pods", body);
      return text(result);
    },
  );

  server.tool(
    "get_dev_pod",
    "Get dev pod status by username",
    {
      username: z.string().describe("Forgejo username"),
    },
    async ({ username }) => {
      const result = await api(
        user,
        "GET",
        `/api/v1/dev-pods/${encodeURIComponent(username)}`,
      );
      return text(result);
    },
  );

  server.tool(
    "control_dev_pod",
    "Start or stop a dev pod",
    {
      username: z.string().describe("Forgejo username"),
      action: z.enum(["start", "stop"]).describe("Action to perform"),
    },
    async ({ username, action }) => {
      const result = await api(
        user,
        "PATCH",
        `/api/v1/dev-pods/${encodeURIComponent(username)}`,
        { action },
      );
      return text(result);
    },
  );

  server.tool(
    "delete_dev_pod",
    "Delete a dev pod",
    {
      username: z.string().describe("Forgejo username"),
    },
    async ({ username }) => {
      const result = await api(
        user,
        "DELETE",
        `/api/v1/dev-pods/${encodeURIComponent(username)}`,
      );
      return text(result);
    },
  );

  // ─── Instance-scoped dev pod tools ───

  server.tool(
    "list_instance_dev_pods",
    "List dev pods in an instance",
    {
      slug: z.string().describe("Instance slug"),
    },
    async ({ slug }) => {
      const result = await api(
        user,
        "GET",
        `/api/v1/instances/${encodeURIComponent(slug)}/dev-pods`,
      );
      return text(result);
    },
  );

  server.tool(
    "create_instance_dev_pod",
    "Create a dev pod in an instance",
    {
      slug: z.string().describe("Instance slug"),
      cpu_limit: z.string().optional().describe("CPU limit (default: 2000m)"),
      memory_limit: z
        .string()
        .optional()
        .describe("Memory limit (default: 4Gi)"),
      storage_size: z
        .string()
        .optional()
        .describe("Storage size (default: 20Gi)"),
    },
    async (args) => {
      const body: Record<string, string> = {};
      if (args.cpu_limit) body.cpuLimit = args.cpu_limit;
      if (args.memory_limit) body.memoryLimit = args.memory_limit;
      if (args.storage_size) body.storageSize = args.storage_size;
      const result = await api(
        user,
        "POST",
        `/api/v1/instances/${encodeURIComponent(args.slug)}/dev-pods`,
        body,
      );
      return text(result);
    },
  );

  server.tool(
    "get_instance_dev_pod",
    "Get dev pod status in an instance",
    {
      slug: z.string().describe("Instance slug"),
      username: z.string().describe("Forgejo username"),
    },
    async ({ slug, username }) => {
      const result = await api(
        user,
        "GET",
        `/api/v1/instances/${encodeURIComponent(slug)}/dev-pods/${encodeURIComponent(username)}`,
      );
      return text(result);
    },
  );

  server.tool(
    "control_instance_dev_pod",
    "Start or stop a dev pod in an instance",
    {
      slug: z.string().describe("Instance slug"),
      username: z.string().describe("Forgejo username"),
      action: z.enum(["start", "stop"]).describe("Action to perform"),
    },
    async ({ slug, username, action }) => {
      const result = await api(
        user,
        "PATCH",
        `/api/v1/instances/${encodeURIComponent(slug)}/dev-pods/${encodeURIComponent(username)}`,
        { action },
      );
      return text(result);
    },
  );

  server.tool(
    "delete_instance_dev_pod",
    "Delete a dev pod in an instance",
    {
      slug: z.string().describe("Instance slug"),
      username: z.string().describe("Forgejo username"),
    },
    async ({ slug, username }) => {
      const result = await api(
        user,
        "DELETE",
        `/api/v1/instances/${encodeURIComponent(slug)}/dev-pods/${encodeURIComponent(username)}`,
      );
      return text(result);
    },
  );
}
