import { Command } from "commander";
import { requireConfig } from "../config.js";
import { OpClient } from "../client.js";
import { handleError, parseOrgRepo } from "../format.js";

const fileGet = new Command("get")
  .description("Read a file from a repository")
  .argument("<org/repo>", "Repository (e.g. system/social)")
  .argument("<path>", "File path (e.g. src/index.ts)")
  .option("--ref <ref>", "Branch, tag, or commit SHA")
  .action(async (ref: string, path: string, opts) => {
    try {
      const { org, repo } = parseOrgRepo(ref);
      const client = new OpClient(requireConfig());
      const file = await client.getFileContent(org, repo, path, opts.ref);
      process.stdout.write(file.content);
    } catch (err) {
      handleError(err);
    }
  });

const filePut = new Command("put")
  .description("Create or update a file (direct commit)")
  .argument("<org/repo>", "Repository (e.g. system/social)")
  .argument("<path>", "File path (e.g. src/index.ts)")
  .requiredOption("--message <msg>", "Commit message")
  .option("--branch <branch>", "Target branch")
  .option("--sha <sha>", "Current file SHA (for updates)")
  .option("--stdin", "Read content from stdin")
  .action(async (ref: string, path: string, opts) => {
    try {
      const { org, repo } = parseOrgRepo(ref);
      const client = new OpClient(requireConfig());

      let content: string;
      if (opts.stdin) {
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) {
          chunks.push(chunk);
        }
        content = Buffer.concat(chunks).toString("utf-8");
      } else {
        process.stderr.write("Error: provide --stdin to pipe content\n");
        process.exit(1);
      }

      const result = await client.createOrUpdateFile(org, repo, path, {
        content,
        message: opts.message,
        branch: opts.branch,
        sha: opts.sha,
      });
      process.stdout.write(
        `Committed ${result.content.path} (${result.commit.sha.slice(0, 8)})\n`,
      );
    } catch (err) {
      handleError(err);
    }
  });

export const fileCommand = new Command("file")
  .description("Read and write files via API")
  .addCommand(fileGet)
  .addCommand(filePut);
