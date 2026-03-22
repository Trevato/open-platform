import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthenticatedUser } from "../../auth.js";
import { z } from "zod";

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

export function registerAgentTools(server: McpServer, user: AuthenticatedUser) {
  server.tool(
    "list_agents",
    "List all AI agents (admin only)",
    {
      all: z
        .boolean()
        .optional()
        .describe("If true, list all agents regardless of owner"),
    },
    async ({ all }) => {
      const query = all ? "?all=true" : "";
      const result = await api(user, "GET", `/api/v1/agents${query}`);
      return text(result);
    },
  );

  server.tool(
    "get_agent",
    "Get an AI agent by slug",
    {
      slug: z.string().describe("Agent slug"),
    },
    async ({ slug }) => {
      const result = await api(
        user,
        "GET",
        `/api/v1/agents/${encodeURIComponent(slug)}`,
      );
      return text(result);
    },
  );

  server.tool(
    "create_agent",
    "Create a new AI agent with a Forgejo identity (admin only)",
    {
      name: z.string().describe("Agent display name"),
      orgs: z
        .array(z.string())
        .optional()
        .describe("Organizations to add the agent to"),
      model: z
        .string()
        .optional()
        .describe("AI model to use (default: claude-sonnet-4-20250514)"),
      instructions: z
        .string()
        .optional()
        .describe("System instructions for the agent"),
      description: z.string().optional().describe("Agent description"),
      allowed_tools: z
        .array(z.string())
        .optional()
        .describe("List of allowed MCP tool names"),
      schedule: z
        .string()
        .optional()
        .describe("Cron schedule for periodic activation"),
      max_steps: z
        .number()
        .optional()
        .describe("Maximum steps per activation (default: 50)"),
    },
    async (args) => {
      const result = await api(user, "POST", "/api/v1/agents", args);
      return text(result);
    },
  );

  server.tool(
    "update_agent",
    "Update an AI agent's configuration",
    {
      slug: z.string().describe("Agent slug"),
      name: z.string().optional().describe("New display name"),
      description: z.string().optional().describe("New description"),
      model: z.string().optional().describe("New model"),
      instructions: z.string().optional().describe("New instructions"),
      allowed_tools: z
        .array(z.string())
        .optional()
        .describe("New allowed tools list"),
      orgs: z
        .array(z.string())
        .optional()
        .describe("New organization memberships"),
      schedule: z.string().optional().describe("New cron schedule"),
      max_steps: z.number().optional().describe("New max steps"),
    },
    async ({ slug, ...updates }) => {
      const result = await api(
        user,
        "PATCH",
        `/api/v1/agents/${encodeURIComponent(slug)}`,
        updates,
      );
      return text(result);
    },
  );

  server.tool(
    "delete_agent",
    "Delete an AI agent and its Forgejo identity",
    {
      slug: z.string().describe("Agent slug"),
    },
    async ({ slug }) => {
      const result = await api(
        user,
        "DELETE",
        `/api/v1/agents/${encodeURIComponent(slug)}`,
      );
      return text(result);
    },
  );

  server.tool(
    "activate_agent",
    "Manually trigger an AI agent with a prompt",
    {
      slug: z.string().describe("Agent slug"),
      prompt: z.string().describe("Prompt to send to the agent"),
    },
    async ({ slug, prompt }) => {
      const result = await api(
        user,
        "POST",
        `/api/v1/agents/${encodeURIComponent(slug)}/activate`,
        { prompt },
      );
      return text(result);
    },
  );
}
