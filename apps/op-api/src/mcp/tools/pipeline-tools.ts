import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WoodpeckerClient } from "../../services/woodpecker.js";

const text = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

export function registerPipelineTools(
  server: McpServer,
  woodpecker: WoodpeckerClient,
) {
  server.tool(
    "trigger_deploy",
    "Trigger a deployment pipeline",
    {
      org: z.string().describe("Organization name"),
      repo: z.string().describe("Repository name"),
      branch: z.string().default("main").describe("Branch to deploy"),
    },
    async ({ org, repo, branch }) => {
      const wp = await woodpecker.lookupRepo(`${org}/${repo}`);
      if (!wp)
        return text({ error: `Repo ${org}/${repo} not found in Woodpecker` });
      const pipeline = await woodpecker.triggerPipeline(wp.id, branch);
      return text({
        triggered: true,
        pipelineId: pipeline.id,
        number: pipeline.number,
        status: pipeline.status,
      });
    },
  );

  server.tool(
    "get_pipeline_status",
    "Get pipeline status (latest if no number specified)",
    {
      org: z.string().describe("Organization name"),
      repo: z.string().describe("Repository name"),
      pipeline_number: z
        .number()
        .optional()
        .describe("Sequential pipeline number from list (latest if omitted)"),
    },
    async ({ org, repo, pipeline_number }) => {
      const wp = await woodpecker.lookupRepo(`${org}/${repo}`);
      if (!wp) return text({ error: "Repo not found" });

      if (pipeline_number) {
        return text(await woodpecker.getPipeline(wp.id, pipeline_number));
      }
      const pipelines = await woodpecker.listPipelines(wp.id);
      return text(pipelines[0] || { status: "none" });
    },
  );

  server.tool(
    "get_pipeline_logs",
    "Get logs for a pipeline step",
    {
      org: z.string().describe("Organization name"),
      repo: z.string().describe("Repository name"),
      pipeline_number: z.number().describe("Sequential pipeline number from list"),
      step: z.number().describe("Step number"),
    },
    async ({ org, repo, pipeline_number, step }) => {
      const wp = await woodpecker.lookupRepo(`${org}/${repo}`);
      if (!wp) return text({ error: "Repo not found" });
      const logs = await woodpecker.getPipelineLogs(wp.id, pipeline_number, step);
      return text({ logs });
    },
  );
}
