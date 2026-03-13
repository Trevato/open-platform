import { Command } from "commander";
import { requireConfig } from "../config.js";
import { OpClient } from "../client.js";
import { formatTable, statusDot, handleError, parseOrgRepo, formatDuration } from "../format.js";

const pipelineList = new Command("list")
  .description("List pipelines")
  .argument("<org/repo>", "Repository (e.g. system/social)")
  .action(async (ref: string) => {
    try {
      const { org, repo } = parseOrgRepo(ref);
      const client = new OpClient(requireConfig());
      const pipelines = await client.listPipelines(org, repo);

      if (pipelines.length === 0) {
        process.stdout.write("No pipelines found.\n");
        return;
      }

      const rows = pipelines.map((p) => {
        const duration = p.started && p.finished
          ? formatDuration(p.finished - p.started)
          : "-";
        return [
          pipelineStatusDot(p.status),
          `#${p.number}`,
          p.status,
          p.branch,
          truncate(p.message, 50),
          p.author,
          duration,
        ];
      });
      process.stdout.write(formatTable(["", "#", "STATUS", "BRANCH", "MESSAGE", "AUTHOR", "DURATION"], rows));
    } catch (err) {
      handleError(err);
    }
  });

const pipelineLogs = new Command("logs")
  .description("Show pipeline step logs")
  .argument("<org/repo>", "Repository (e.g. system/social)")
  .argument("<id>", "Pipeline number")
  .option("--step <n>", "Step number (PIDs start at 2)", "2")
  .action(async (ref: string, id: string, opts) => {
    try {
      const { org, repo } = parseOrgRepo(ref);
      const client = new OpClient(requireConfig());
      const result = await client.getPipelineLogs(
        org,
        repo,
        parseInt(id, 10),
        parseInt(opts.step, 10),
      );
      process.stdout.write(result.logs || "No log output.\n");
    } catch (err) {
      handleError(err);
    }
  });

export const pipelineCommand = new Command("pipeline")
  .description("Manage CI pipelines")
  .addCommand(pipelineList)
  .addCommand(pipelineLogs);

function pipelineStatusDot(status: string): string {
  switch (status) {
    case "success":
      return statusDot("running");
    case "failure":
    case "error":
    case "killed":
      return statusDot("stopped");
    case "running":
    case "pending":
      return statusDot("degraded");
    default:
      return statusDot("stopped");
  }
}

function truncate(s: string, max: number): string {
  const line = s.split("\n")[0] || s;
  if (line.length <= max) return line;
  return line.slice(0, max - 3) + "...";
}
