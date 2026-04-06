import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WoodpeckerClient } from "../../services/woodpecker.js";
import type { ForgejoClient } from "../../services/forgejo.js";
import type { WoodpeckerPipeline } from "../../services/types.js";

const text = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

export function registerPipelineTools(
  server: McpServer,
  woodpecker: WoodpeckerClient,
  forgejo: ForgejoClient,
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
      await forgejo.getRepo(org, repo); // verify access
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
      await forgejo.getRepo(org, repo); // verify access
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
      pipeline_number: z
        .number()
        .describe("Sequential pipeline number from list"),
      step: z.number().describe("Step number"),
    },
    async ({ org, repo, pipeline_number, step }) => {
      await forgejo.getRepo(org, repo); // verify access
      const wp = await woodpecker.lookupRepo(`${org}/${repo}`);
      if (!wp) return text({ error: "Repo not found" });
      const logs = await woodpecker.getPipelineLogs(
        wp.id,
        pipeline_number,
        step,
      );
      return text({ logs });
    },
  );

  server.tool(
    "wait_for_pipeline",
    "Wait for a pipeline to reach a terminal state (success, failure, error). Polls every 10 seconds with a 5-minute timeout.",
    {
      org: z.string().describe("Organization name"),
      repo: z.string().describe("Repository name"),
      pipeline_number: z
        .number()
        .optional()
        .describe("Pipeline number (latest if omitted)"),
    },
    async ({ org, repo, pipeline_number }) => {
      await forgejo.getRepo(org, repo); // verify access
      const wp = await woodpecker.lookupRepo(`${org}/${repo}`);
      if (!wp) return text({ error: "Repo not found in Woodpecker" });

      const terminal = new Set([
        "success",
        "failure",
        "error",
        "killed",
        "declined",
      ]);
      const maxAttempts = 30; // 30 * 10s = 5 minutes
      let pipeline: WoodpeckerPipeline | undefined;

      for (let i = 0; i < maxAttempts; i++) {
        if (pipeline_number) {
          pipeline = await woodpecker.getPipeline(wp.id, pipeline_number);
        } else {
          const pipelines = await woodpecker.listPipelines(wp.id);
          if (pipelines.length === 0)
            return text({ error: "No pipelines found" });
          pipeline = pipelines[0];
        }

        if (terminal.has(pipeline.status)) {
          const failedSteps = (pipeline.workflows || [])
            .flatMap((wf) => wf.children || [])
            .filter((s) => s.state === "failure" || s.state === "error")
            .map((s) => s.name);

          return text({
            number: pipeline.number,
            status: pipeline.status,
            event: pipeline.event,
            branch: pipeline.branch,
            ...(failedSteps.length > 0 ? { failed_steps: failedSteps } : {}),
          });
        }

        await new Promise((resolve) => setTimeout(resolve, 10_000));
      }

      return text({
        number: pipeline!.number,
        status: pipeline!.status,
        timeout: true,
        message: "Pipeline did not reach terminal state within 5 minutes",
      });
    },
  );
}
