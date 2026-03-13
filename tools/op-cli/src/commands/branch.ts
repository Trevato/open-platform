import { Command } from "commander";
import { requireConfig } from "../config.js";
import { OpClient } from "../client.js";
import { formatTable, handleError, parseOrgRepo } from "../format.js";

const branchList = new Command("list")
  .description("List branches")
  .argument("<org/repo>", "Repository (e.g. system/social)")
  .action(async (ref: string) => {
    try {
      const { org, repo } = parseOrgRepo(ref);
      const client = new OpClient(requireConfig());
      const branches = await client.listBranches(org, repo);

      if (branches.length === 0) {
        process.stdout.write("No branches.\n");
        return;
      }

      const rows = branches.map((b) => [
        b.name,
        b.commit.id.slice(0, 8),
        b.commit.message.split("\n")[0].slice(0, 60),
        b.protected ? "protected" : "",
      ]);
      process.stdout.write(formatTable(["NAME", "COMMIT", "MESSAGE", ""], rows));
    } catch (err) {
      handleError(err);
    }
  });

const branchCreate = new Command("create")
  .description("Create a branch")
  .argument("<org/repo>", "Repository (e.g. system/social)")
  .requiredOption("--name <name>", "New branch name")
  .option("--from <branch>", "Base branch", "main")
  .action(async (ref: string, opts) => {
    try {
      const { org, repo } = parseOrgRepo(ref);
      const client = new OpClient(requireConfig());
      const branch = await client.createBranch(org, repo, opts.name, opts.from);
      process.stdout.write(`Created branch "${branch.name}" from ${opts.from}\n`);
    } catch (err) {
      handleError(err);
    }
  });

const branchDelete = new Command("delete")
  .description("Delete a branch")
  .argument("<org/repo>", "Repository (e.g. system/social)")
  .argument("<name>", "Branch name")
  .action(async (ref: string, name: string) => {
    try {
      const { org, repo } = parseOrgRepo(ref);
      const client = new OpClient(requireConfig());
      await client.deleteBranch(org, repo, name);
      process.stdout.write(`Deleted branch "${name}"\n`);
    } catch (err) {
      handleError(err);
    }
  });

export const branchCommand = new Command("branch")
  .description("Manage branches")
  .addCommand(branchList)
  .addCommand(branchCreate)
  .addCommand(branchDelete);
