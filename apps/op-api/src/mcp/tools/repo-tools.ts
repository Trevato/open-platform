import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ForgejoClient } from "../../services/forgejo.js";

const text = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

export function registerRepoTools(
  server: McpServer,
  forgejo: ForgejoClient,
) {
  server.tool(
    "list_repos",
    "List repositories in an organization",
    { org: z.string().describe("Organization name") },
    async ({ org }) => {
      const repos = await forgejo.listRepos(org);
      return text(
        repos.map((r) => ({
          name: r.name,
          fullName: r.full_name,
          description: r.description,
          url: r.html_url,
          template: r.template,
        })),
      );
    },
  );

  server.tool(
    "get_repo",
    "Get repository details",
    {
      org: z.string().describe("Organization or owner name"),
      repo: z.string().describe("Repository name"),
    },
    async ({ org, repo }) => {
      return text(await forgejo.getRepo(org, repo));
    },
  );

  server.tool(
    "create_repo_from_template",
    "Create a new app from the system template",
    {
      org: z.string().describe("Target organization"),
      name: z
        .string()
        .regex(/^[a-z][a-z0-9-]{1,30}[a-z0-9]$/)
        .describe("New repo name (lowercase, hyphens)"),
      description: z.string().optional().describe("Repo description"),
    },
    async ({ org, name, description }) => {
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
