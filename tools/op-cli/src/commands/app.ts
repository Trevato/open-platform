import { Command } from "commander";
import { requireConfig } from "../config.js";
import { OpClient } from "../client.js";
import { formatTable, statusDot, handleError, parseOrgRepo } from "../format.js";

const appList = new Command("list")
  .description("List deployed apps")
  .action(async () => {
    try {
      const client = new OpClient(requireConfig());
      const apps = await client.listApps();

      if (apps.length === 0) {
        process.stdout.write("No apps found.\n");
        return;
      }

      const rows = apps.map((a) => [
        statusDot(a.status),
        `${a.org}/${a.repo}`,
        `${a.replicas.ready}/${a.replicas.desired}`,
        a.namespace,
        a.url || "-",
      ]);
      process.stdout.write(formatTable(["", "APP", "READY", "NAMESPACE", "URL"], rows));
    } catch (err) {
      handleError(err);
    }
  });

const appCreate = new Command("create")
  .description("Create a new app from template")
  .requiredOption("--org <org>", "Organization")
  .requiredOption("--name <name>", "App name")
  .option("--template <repo>", "Template repo name", "template")
  .option("--description <desc>", "App description")
  .action(async (opts) => {
    try {
      const client = new OpClient(requireConfig());
      const repo = await client.generateFromTemplate(
        opts.org,
        opts.template,
        opts.name,
        opts.description,
      );
      process.stdout.write(`Created ${repo.full_name}\n`);
      process.stdout.write(`${repo.html_url}\n`);
    } catch (err) {
      handleError(err);
    }
  });

const appStatus = new Command("status")
  .description("Show app deployment status")
  .argument("<org/repo>", "App identifier (e.g. system/social)")
  .action(async (ref: string) => {
    try {
      const { org, repo } = parseOrgRepo(ref);
      const client = new OpClient(requireConfig());
      const app = await client.getAppStatus(org, repo);

      process.stdout.write(`${statusDot(app.status)} ${app.org}/${app.repo}\n`);
      process.stdout.write(`Namespace: ${app.namespace}\n`);
      process.stdout.write(`Replicas:  ${app.replicas.ready}/${app.replicas.desired}\n`);
      if (app.url) {
        process.stdout.write(`URL:       ${app.url}\n`);
      }
    } catch (err) {
      handleError(err);
    }
  });

const appDeploy = new Command("deploy")
  .description("Trigger a deploy pipeline for an app")
  .argument("<org/repo>", "App identifier (e.g. system/social)")
  .option("--branch <branch>", "Branch to deploy", "main")
  .action(async (ref: string, opts) => {
    try {
      const { org, repo } = parseOrgRepo(ref);
      const client = new OpClient(requireConfig());
      const pipeline = await client.deployApp(org, repo, opts.branch);
      process.stdout.write(`Pipeline #${pipeline.number} triggered (${pipeline.status})\n`);
    } catch (err) {
      handleError(err);
    }
  });

export const appCommand = new Command("app")
  .description("Manage apps")
  .addCommand(appList)
  .addCommand(appCreate)
  .addCommand(appStatus)
  .addCommand(appDeploy);
