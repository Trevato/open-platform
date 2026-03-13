import { Command } from "commander";
import { requireConfig } from "../config.js";
import { OpClient } from "../client.js";
import { formatTable, statusDot, handleError, parseOrgRepo, timeAgo } from "../format.js";

// ── Issues ──────────────────────────────────────────────────────────

const issueList = new Command("list")
  .description("List issues")
  .argument("<org/repo>", "Repository (e.g. system/social)")
  .option("--state <state>", "Filter by state (open, closed, all)", "open")
  .option("--labels <labels>", "Comma-separated label names")
  .option("--milestone <name>", "Milestone name")
  .option("--assignee <user>", "Assignee username")
  .action(async (ref: string, opts) => {
    try {
      const { org, repo } = parseOrgRepo(ref);
      const client = new OpClient(requireConfig());
      const issues = await client.listIssues(org, repo, {
        state: opts.state,
        labels: opts.labels,
        milestone: opts.milestone,
        assignee: opts.assignee,
      });

      if (issues.length === 0) {
        process.stdout.write(`No ${opts.state} issues.\n`);
        return;
      }

      const rows = issues.map((i) => [
        statusDot(i.state === "open" ? "running" : "stopped"),
        `#${i.number}`,
        i.title,
        i.labels.map((l) => l.name).join(", ") || "-",
        i.assignees.map((a) => a.login).join(", ") || "-",
        timeAgo(i.updated_at),
      ]);
      process.stdout.write(formatTable(["", "#", "TITLE", "LABELS", "ASSIGNEES", "UPDATED"], rows));
    } catch (err) {
      handleError(err);
    }
  });

const issueCreate = new Command("create")
  .description("Create an issue")
  .argument("<org/repo>", "Repository (e.g. system/social)")
  .requiredOption("--title <title>", "Issue title")
  .option("--body <body>", "Issue body (markdown)", "")
  .option("--labels <ids>", "Comma-separated label IDs")
  .option("--milestone <id>", "Milestone ID")
  .option("--assignees <users>", "Comma-separated usernames")
  .action(async (ref: string, opts) => {
    try {
      const { org, repo } = parseOrgRepo(ref);
      const client = new OpClient(requireConfig());
      const issue = await client.createIssue(org, repo, {
        title: opts.title,
        body: opts.body,
        labels: opts.labels ? opts.labels.split(",").map(Number) : undefined,
        milestone: opts.milestone ? parseInt(opts.milestone, 10) : undefined,
        assignees: opts.assignees ? opts.assignees.split(",") : undefined,
      });
      process.stdout.write(`Created issue #${issue.number}: ${issue.title}\n`);
      process.stdout.write(`${issue.html_url}\n`);
    } catch (err) {
      handleError(err);
    }
  });

const issueUpdate = new Command("update")
  .description("Update an issue")
  .argument("<org/repo>", "Repository (e.g. system/social)")
  .argument("<number>", "Issue number")
  .option("--title <title>", "New title")
  .option("--body <body>", "New body")
  .option("--state <state>", "New state (open, closed)")
  .option("--labels <ids>", "Replace labels (comma-separated IDs)")
  .option("--milestone <id>", "New milestone ID")
  .option("--assignees <users>", "Replace assignees (comma-separated)")
  .action(async (ref: string, number: string, opts) => {
    try {
      const { org, repo } = parseOrgRepo(ref);
      const client = new OpClient(requireConfig());
      const update: Record<string, unknown> = {};
      if (opts.title) update.title = opts.title;
      if (opts.body) update.body = opts.body;
      if (opts.state) update.state = opts.state;
      if (opts.labels) update.labels = opts.labels.split(",").map(Number);
      if (opts.milestone) update.milestone = parseInt(opts.milestone, 10);
      if (opts.assignees) update.assignees = opts.assignees.split(",");
      const issue = await client.updateIssue(org, repo, parseInt(number, 10), update);
      process.stdout.write(`Updated issue #${issue.number}: ${issue.title} [${issue.state}]\n`);
    } catch (err) {
      handleError(err);
    }
  });

const issueComment = new Command("comment")
  .description("Comment on an issue")
  .argument("<org/repo>", "Repository (e.g. system/social)")
  .argument("<number>", "Issue number")
  .requiredOption("--body <body>", "Comment text")
  .action(async (ref: string, number: string, opts) => {
    try {
      const { org, repo } = parseOrgRepo(ref);
      const client = new OpClient(requireConfig());
      await client.commentOnIssue(org, repo, parseInt(number, 10), opts.body);
      process.stdout.write(`Commented on issue #${number}\n`);
    } catch (err) {
      handleError(err);
    }
  });

// ── Labels ──────────────────────────────────────────────────────────

const labelList = new Command("list")
  .description("List labels")
  .argument("<org/repo>", "Repository (e.g. system/social)")
  .action(async (ref: string) => {
    try {
      const { org, repo } = parseOrgRepo(ref);
      const client = new OpClient(requireConfig());
      const labels = await client.listLabels(org, repo);

      if (labels.length === 0) {
        process.stdout.write("No labels.\n");
        return;
      }

      const rows = labels.map((l) => [
        String(l.id),
        l.name,
        l.color,
        l.description || "-",
      ]);
      process.stdout.write(formatTable(["ID", "NAME", "COLOR", "DESCRIPTION"], rows));
    } catch (err) {
      handleError(err);
    }
  });

const labelCreate = new Command("create")
  .description("Create a label")
  .argument("<org/repo>", "Repository (e.g. system/social)")
  .requiredOption("--name <name>", "Label name")
  .requiredOption("--color <hex>", "Hex color (e.g. e11d48)")
  .option("--description <desc>", "Label description", "")
  .action(async (ref: string, opts) => {
    try {
      const { org, repo } = parseOrgRepo(ref);
      const client = new OpClient(requireConfig());
      const color = opts.color.startsWith("#") ? opts.color : `#${opts.color}`;
      const label = await client.createLabel(org, repo, {
        name: opts.name,
        color,
        description: opts.description,
      });
      process.stdout.write(`Created label "${label.name}" (${label.id})\n`);
    } catch (err) {
      handleError(err);
    }
  });

const labelCommand = new Command("label")
  .description("Manage labels")
  .addCommand(labelList)
  .addCommand(labelCreate);

// ── Milestones ──────────────────────────────────────────────────────

const milestoneList = new Command("list")
  .description("List milestones")
  .argument("<org/repo>", "Repository (e.g. system/social)")
  .option("--state <state>", "Filter by state (open, closed, all)")
  .action(async (ref: string, opts) => {
    try {
      const { org, repo } = parseOrgRepo(ref);
      const client = new OpClient(requireConfig());
      const milestones = await client.listMilestones(org, repo, opts.state);

      if (milestones.length === 0) {
        process.stdout.write("No milestones.\n");
        return;
      }

      const rows = milestones.map((m) => [
        String(m.id),
        m.title,
        m.state,
        `${m.open_issues} open / ${m.closed_issues} closed`,
        m.due_on ? new Date(m.due_on).toLocaleDateString() : "-",
      ]);
      process.stdout.write(formatTable(["ID", "TITLE", "STATE", "ISSUES", "DUE"], rows));
    } catch (err) {
      handleError(err);
    }
  });

const milestoneCreate = new Command("create")
  .description("Create a milestone")
  .argument("<org/repo>", "Repository (e.g. system/social)")
  .requiredOption("--title <title>", "Milestone title")
  .option("--description <desc>", "Milestone description", "")
  .option("--due <date>", "Due date (ISO 8601)")
  .action(async (ref: string, opts) => {
    try {
      const { org, repo } = parseOrgRepo(ref);
      const client = new OpClient(requireConfig());
      const ms = await client.createMilestone(org, repo, {
        title: opts.title,
        description: opts.description,
        due_on: opts.due,
      });
      process.stdout.write(`Created milestone "${ms.title}" (${ms.id})\n`);
    } catch (err) {
      handleError(err);
    }
  });

const milestoneCommand = new Command("milestone")
  .description("Manage milestones")
  .addCommand(milestoneList)
  .addCommand(milestoneCreate);

// ── Export ───────────────────────────────────────────────────────────

export const issueCommand = new Command("issue")
  .description("Manage issues")
  .addCommand(issueList)
  .addCommand(issueCreate)
  .addCommand(issueUpdate)
  .addCommand(issueComment);

export { labelCommand, milestoneCommand };
