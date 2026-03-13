import { Command } from "commander";
import { requireConfig } from "../config.js";
import { OpClient } from "../client.js";
import { formatTable, statusDot, handleError, parseOrgRepo, timeAgo } from "../format.js";

const prList = new Command("list")
  .description("List pull requests")
  .argument("<org/repo>", "Repository (e.g. system/social)")
  .option("--state <state>", "Filter by state (open, closed, all)", "open")
  .action(async (ref: string, opts) => {
    try {
      const { org, repo } = parseOrgRepo(ref);
      const client = new OpClient(requireConfig());
      const prs = await client.listPRs(org, repo, opts.state);

      if (prs.length === 0) {
        process.stdout.write(`No ${opts.state} pull requests.\n`);
        return;
      }

      const rows = prs.map((pr) => [
        statusDot(pr.state === "open" ? "running" : "stopped"),
        `#${pr.number}`,
        pr.title,
        pr.user.login,
        `${pr.head.ref} -> ${pr.base.ref}`,
        timeAgo(pr.updated_at),
      ]);
      process.stdout.write(formatTable(["", "#", "TITLE", "AUTHOR", "BRANCHES", "UPDATED"], rows));
    } catch (err) {
      handleError(err);
    }
  });

const prCreate = new Command("create")
  .description("Create a pull request")
  .argument("<org/repo>", "Repository (e.g. system/social)")
  .requiredOption("--title <title>", "PR title")
  .requiredOption("--head <branch>", "Source branch")
  .option("--base <branch>", "Target branch", "main")
  .option("--body <body>", "PR description", "")
  .action(async (ref: string, opts) => {
    try {
      const { org, repo } = parseOrgRepo(ref);
      const client = new OpClient(requireConfig());
      const pr = await client.createPR(org, repo, {
        title: opts.title,
        head: opts.head,
        base: opts.base,
        body: opts.body,
      });
      process.stdout.write(`Created PR #${pr.number}: ${pr.title}\n`);
      process.stdout.write(`${pr.html_url}\n`);
    } catch (err) {
      handleError(err);
    }
  });

const prMerge = new Command("merge")
  .description("Merge a pull request")
  .argument("<org/repo>", "Repository (e.g. system/social)")
  .argument("<number>", "PR number")
  .option("--method <method>", "Merge method (merge, rebase, squash)", "merge")
  .action(async (ref: string, number: string, opts) => {
    try {
      const { org, repo } = parseOrgRepo(ref);
      const client = new OpClient(requireConfig());
      await client.mergePR(org, repo, parseInt(number, 10), opts.method);
      process.stdout.write(`Merged PR #${number}\n`);
    } catch (err) {
      handleError(err);
    }
  });

const prApprove = new Command("approve")
  .description("Approve a pull request")
  .argument("<org/repo>", "Repository (e.g. system/social)")
  .argument("<number>", "PR number")
  .option("--body <body>", "Review comment", "")
  .action(async (ref: string, number: string, opts) => {
    try {
      const { org, repo } = parseOrgRepo(ref);
      const client = new OpClient(requireConfig());
      await client.approvePR(org, repo, parseInt(number, 10), opts.body);
      process.stdout.write(`Approved PR #${number}\n`);
    } catch (err) {
      handleError(err);
    }
  });

export const prCommand = new Command("pr")
  .description("Manage pull requests")
  .addCommand(prList)
  .addCommand(prCreate)
  .addCommand(prMerge)
  .addCommand(prApprove);
