import { Command } from "commander";
import { requireConfig } from "../config.js";
import { OpClient } from "../client.js";
import { formatTable, statusDot, timeAgo, handleError } from "../format.js";

const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

function instanceStatusDot(status: string): string {
  switch (status) {
    case "ready":
      return `${GREEN}*${RESET}`;
    case "provisioning":
      return `${YELLOW}*${RESET}`;
    case "pending":
      return `${YELLOW}*${RESET}`;
    case "terminating":
      return `${RED}*${RESET}`;
    case "error":
      return `${RED}*${RESET}`;
    default:
      return `${DIM}*${RESET}`;
  }
}

function instanceStatusLabel(status: string): string {
  switch (status) {
    case "ready":
      return `${GREEN}${status}${RESET}`;
    case "provisioning":
    case "pending":
      return `${YELLOW}${status}${RESET}`;
    case "terminating":
    case "error":
      return `${RED}${status}${RESET}`;
    default:
      return `${DIM}${status}${RESET}`;
  }
}

const instanceList = new Command("list")
  .description("List instances")
  .option("--all", "List all instances (admin only)")
  .action(async (opts) => {
    try {
      const client = new OpClient(requireConfig());
      const { instances } = await client.listInstances(opts.all || false);

      if (instances.length === 0) {
        process.stdout.write("No instances found.\n");
        return;
      }

      const rows = instances.map((i) => [
        instanceStatusDot(i.status),
        i.slug,
        i.display_name,
        i.tier,
        i.status,
        timeAgo(i.created_at),
      ]);
      process.stdout.write(
        formatTable(["", "SLUG", "NAME", "TIER", "STATUS", "CREATED"], rows),
      );
    } catch (err) {
      handleError(err);
    }
  });

const instanceCreate = new Command("create")
  .description("Create a new instance")
  .argument(
    "<slug>",
    "URL-safe name (3-32 chars, lowercase, start with letter)",
  )
  .requiredOption("--name <display_name>", "Human-readable name")
  .requiredOption("--email <admin_email>", "Admin email")
  .option("--tier <tier>", "Resource tier (free, pro, team)", "free")
  .action(async (slug: string, opts) => {
    try {
      const client = new OpClient(requireConfig());
      const { instance } = await client.createInstance({
        slug,
        display_name: opts.name,
        admin_email: opts.email,
        tier: opts.tier,
      });

      process.stdout.write(
        `${GREEN}Created instance: ${instance.slug}${RESET}\n`,
      );
      process.stdout.write(`Name:   ${instance.display_name}\n`);
      process.stdout.write(`Tier:   ${instance.tier}\n`);
      process.stdout.write(`Status: ${instanceStatusLabel(instance.status)}\n`);
      process.stdout.write(`Email:  ${instance.admin_email}\n`);
    } catch (err) {
      handleError(err);
    }
  });

const instanceStatus = new Command("status")
  .description("Show instance details, events, and service URLs")
  .argument("<slug>", "Instance slug")
  .action(async (slug: string) => {
    try {
      const client = new OpClient(requireConfig());
      const { instance, events, services } = await client.getInstance(slug);

      process.stdout.write(
        `${instanceStatusDot(instance.status)} ${BOLD}${instance.display_name}${RESET} ${DIM}(${instance.slug})${RESET}\n`,
      );
      process.stdout.write(`Status: ${instanceStatusLabel(instance.status)}\n`);
      process.stdout.write(`Tier:   ${instance.tier}\n`);
      process.stdout.write(`Email:  ${instance.admin_email}\n`);
      process.stdout.write(`Admin:  ${instance.admin_username}\n`);
      if (instance.provisioned_at) {
        process.stdout.write(`Since:  ${timeAgo(instance.provisioned_at)}\n`);
      }
      process.stdout.write(`Created: ${timeAgo(instance.created_at)}\n`);

      if (services && Object.keys(services).length > 0) {
        process.stdout.write(`\n${BOLD}Service URLs${RESET}\n`);
        for (const [name, url] of Object.entries(services)) {
          process.stdout.write(`  ${CYAN}${name}${RESET}: ${url}\n`);
        }
      }

      if (events && events.length > 0) {
        process.stdout.write(`\n${BOLD}Recent Events${RESET}\n`);
        const eventRows = events
          .slice(0, 10)
          .map((e) => [timeAgo(e.created_at), e.phase, e.message]);
        process.stdout.write(
          formatTable(["WHEN", "TYPE", "MESSAGE"], eventRows),
        );
      }
    } catch (err) {
      handleError(err);
    }
  });

const instanceDelete = new Command("delete")
  .description("Delete (terminate) an instance")
  .argument("<slug>", "Instance slug")
  .option("--yes", "Skip confirmation")
  .action(async (slug: string, opts) => {
    try {
      if (!opts.yes) {
        process.stdout.write(
          `${YELLOW}This will terminate instance "${slug}" and delete all data.${RESET}\n`,
        );
        process.stdout.write(`Use --yes to confirm.\n`);
        return;
      }

      const client = new OpClient(requireConfig());
      const { instance } = await client.deleteInstance(slug);

      process.stdout.write(
        `${RED}Deleting instance: ${instance.slug}${RESET}\n`,
      );
      process.stdout.write(`Status: ${instanceStatusLabel(instance.status)}\n`);
    } catch (err) {
      handleError(err);
    }
  });

const credentialsShow = new Command("show")
  .description("Show instance admin credentials")
  .argument("<slug>", "Instance slug")
  .action(async (slug: string) => {
    try {
      const client = new OpClient(requireConfig());
      const creds = await client.getInstanceCredentials(slug);

      process.stdout.write(`Username: ${creds.username}\n`);
      process.stdout.write(`Password: ${creds.password}\n`);
    } catch (err) {
      handleError(err);
    }
  });

const credentialsReset = new Command("reset")
  .description("Reset instance admin password")
  .argument("<slug>", "Instance slug")
  .action(async (slug: string) => {
    try {
      const client = new OpClient(requireConfig());
      const creds = await client.resetInstanceCredentials(slug);

      process.stdout.write(`${GREEN}Password reset.${RESET}\n`);
      process.stdout.write(`Username: ${creds.username}\n`);
      process.stdout.write(`Password: ${creds.password}\n`);
    } catch (err) {
      handleError(err);
    }
  });

const instanceCredentials = new Command("credentials")
  .description("Manage instance admin credentials")
  .addCommand(credentialsShow)
  .addCommand(credentialsReset);

const instanceKubeconfig = new Command("kubeconfig")
  .description("Get instance kubeconfig")
  .argument("<slug>", "Instance slug")
  .action(async (slug: string) => {
    try {
      const client = new OpClient(requireConfig());
      const { kubeconfig } = await client.getInstanceKubeconfig(slug);

      process.stdout.write(kubeconfig);
    } catch (err) {
      handleError(err);
    }
  });

const instanceServices = new Command("services")
  .description("List services in an instance")
  .argument("<slug>", "Instance slug")
  .action(async (slug: string) => {
    try {
      const client = new OpClient(requireConfig());
      const { services } = await client.listInstanceServices(slug);

      if (services.length === 0) {
        process.stdout.write(
          "No services found (instance may not be ready).\n",
        );
        return;
      }

      const rows = services.map((s) => [
        statusDot(s.ready ? "running" : "stopped"),
        s.name,
        s.namespace,
        `${s.replicas.ready}/${s.replicas.total}`,
        s.url || "-",
      ]);
      process.stdout.write(
        formatTable(["", "NAME", "NAMESPACE", "REPLICAS", "URL"], rows),
      );
    } catch (err) {
      handleError(err);
    }
  });

const instanceApps = new Command("apps")
  .description("List deployed apps in an instance")
  .argument("<slug>", "Instance slug")
  .action(async (slug: string) => {
    try {
      const client = new OpClient(requireConfig());
      const { apps } = await client.listInstanceApps(slug);

      if (apps.length === 0) {
        process.stdout.write("No apps found (instance may not be ready).\n");
        return;
      }

      const rows = apps.map((a) => [
        statusDot(a.ready ? "running" : "stopped"),
        a.name,
        a.namespace,
        `${a.replicas.ready}/${a.replicas.total}`,
        a.url || "-",
      ]);
      process.stdout.write(
        formatTable(["", "NAME", "NAMESPACE", "REPLICAS", "URL"], rows),
      );
    } catch (err) {
      handleError(err);
    }
  });

export const instanceCommand = new Command("instance")
  .description("Manage instances")
  .addCommand(instanceList)
  .addCommand(instanceCreate)
  .addCommand(instanceStatus)
  .addCommand(instanceDelete)
  .addCommand(instanceCredentials)
  .addCommand(instanceKubeconfig)
  .addCommand(instanceServices)
  .addCommand(instanceApps);
