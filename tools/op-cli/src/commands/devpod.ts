import { Command } from "commander";
import { requireConfig } from "../config.js";
import { OpClient } from "../client.js";
import type { DevPod } from "../client.js";
import { formatTable, statusDot, timeAgo, handleError } from "../format.js";

const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

function podStatusDot(status: string): string {
  switch (status) {
    case "running":
      return `${GREEN}*${RESET}`;
    case "starting":
    case "stopping":
    case "creating":
      return `${YELLOW}*${RESET}`;
    case "stopped":
      return `${DIM}*${RESET}`;
    case "error":
    case "failed":
      return `${RED}*${RESET}`;
    default:
      return `${DIM}*${RESET}`;
  }
}

function podStatusLabel(status: string): string {
  switch (status) {
    case "running":
      return `${GREEN}${status}${RESET}`;
    case "starting":
    case "stopping":
    case "creating":
      return `${YELLOW}${status}${RESET}`;
    case "stopped":
      return `${DIM}${status}${RESET}`;
    case "error":
    case "failed":
      return `${RED}${status}${RESET}`;
    default:
      return `${DIM}${status}${RESET}`;
  }
}

function formatPodTable(pods: DevPod[]): string {
  const rows = pods.map((p) => [
    podStatusDot(p.live_status || p.status),
    p.forgejo_username,
    p.live_status || p.status,
    p.cpu_limit,
    p.memory_limit,
    p.storage_size,
    timeAgo(p.created_at),
  ]);
  return formatTable(
    ["", "USERNAME", "STATUS", "CPU", "MEMORY", "STORAGE", "CREATED"],
    rows,
  );
}

function printPodDetail(pod: DevPod): void {
  const status = pod.live_status || pod.status;
  process.stdout.write(
    `${podStatusDot(status)} ${BOLD}${pod.forgejo_username}${RESET}\n`,
  );
  process.stdout.write(`Status:   ${podStatusLabel(status)}\n`);
  process.stdout.write(`Pod:      ${pod.pod_name}\n`);
  process.stdout.write(`PVC:      ${pod.pvc_name}\n`);
  process.stdout.write(`CPU:      ${pod.cpu_limit}\n`);
  process.stdout.write(`Memory:   ${pod.memory_limit}\n`);
  process.stdout.write(`Storage:  ${pod.storage_size}\n`);
  if (pod.instance_slug) {
    process.stdout.write(`Instance: ${pod.instance_slug}\n`);
  }
  if (pod.error_message) {
    process.stdout.write(`Error:    ${RED}${pod.error_message}${RESET}\n`);
  }
  process.stdout.write(`Created:  ${timeAgo(pod.created_at)}\n`);
}

// ─── Subcommands ───

const devpodList = new Command("list")
  .description("List dev pods")
  .option("--instance <slug>", "Scope to an instance")
  .action(async (opts) => {
    try {
      const client = new OpClient(requireConfig());
      const { pods } = opts.instance
        ? await client.listInstanceDevPods(opts.instance)
        : await client.listDevPods();

      if (pods.length === 0) {
        process.stdout.write("No dev pods found.\n");
        return;
      }

      process.stdout.write(formatPodTable(pods));
    } catch (err) {
      handleError(err);
    }
  });

const devpodCreate = new Command("create")
  .description("Create a dev pod for the current user")
  .option("--instance <slug>", "Create in an instance")
  .option("--cpu <limit>", "CPU limit (e.g. 2000m)")
  .option("--memory <limit>", "Memory limit (e.g. 4Gi)")
  .option("--storage <size>", "Storage size (e.g. 20Gi)")
  .action(async (opts) => {
    try {
      const client = new OpClient(requireConfig());
      const resources: {
        cpu_limit?: string;
        memory_limit?: string;
        storage_size?: string;
      } = {};
      if (opts.cpu) resources.cpu_limit = opts.cpu;
      if (opts.memory) resources.memory_limit = opts.memory;
      if (opts.storage) resources.storage_size = opts.storage;

      const { pod } = opts.instance
        ? await client.createInstanceDevPod(opts.instance, resources)
        : await client.createDevPod(resources);

      process.stdout.write(
        `${GREEN}Created dev pod for ${pod.forgejo_username}${RESET}\n`,
      );
      printPodDetail(pod);
    } catch (err) {
      handleError(err);
    }
  });

const devpodStatus = new Command("status")
  .description("Show dev pod details")
  .argument("<username>", "Forgejo username")
  .option("--instance <slug>", "Scope to an instance")
  .action(async (username: string, opts) => {
    try {
      const client = new OpClient(requireConfig());
      const { pod } = opts.instance
        ? await client.getInstanceDevPod(opts.instance, username)
        : await client.getDevPod(username);

      printPodDetail(pod);
    } catch (err) {
      handleError(err);
    }
  });

const devpodStart = new Command("start")
  .description("Start a dev pod")
  .argument("<username>", "Forgejo username")
  .option("--instance <slug>", "Scope to an instance")
  .action(async (username: string, opts) => {
    try {
      const client = new OpClient(requireConfig());
      const { pod } = opts.instance
        ? await client.controlInstanceDevPod(opts.instance, username, "start")
        : await client.controlDevPod(username, "start");

      process.stdout.write(
        `${GREEN}Starting dev pod for ${pod.forgejo_username}${RESET}\n`,
      );
      process.stdout.write(
        `Status: ${podStatusLabel(pod.live_status || pod.status)}\n`,
      );
    } catch (err) {
      handleError(err);
    }
  });

const devpodStop = new Command("stop")
  .description("Stop a dev pod")
  .argument("<username>", "Forgejo username")
  .option("--instance <slug>", "Scope to an instance")
  .action(async (username: string, opts) => {
    try {
      const client = new OpClient(requireConfig());
      const { pod } = opts.instance
        ? await client.controlInstanceDevPod(opts.instance, username, "stop")
        : await client.controlDevPod(username, "stop");

      process.stdout.write(
        `${YELLOW}Stopping dev pod for ${pod.forgejo_username}${RESET}\n`,
      );
      process.stdout.write(
        `Status: ${podStatusLabel(pod.live_status || pod.status)}\n`,
      );
    } catch (err) {
      handleError(err);
    }
  });

const devpodDelete = new Command("delete")
  .description("Delete a dev pod")
  .argument("<username>", "Forgejo username")
  .option("--instance <slug>", "Scope to an instance")
  .option("--yes", "Skip confirmation")
  .action(async (username: string, opts) => {
    try {
      if (!opts.yes) {
        process.stdout.write(
          `${YELLOW}This will delete the dev pod for "${username}" and all stored data.${RESET}\n`,
        );
        process.stdout.write("Use --yes to confirm.\n");
        return;
      }

      const client = new OpClient(requireConfig());
      if (opts.instance) {
        await client.deleteInstanceDevPod(opts.instance, username);
      } else {
        await client.deleteDevPod(username);
      }

      process.stdout.write(
        `${RED}Deleted dev pod for ${username}${RESET}\n`,
      );
    } catch (err) {
      handleError(err);
    }
  });

export const devpodCommand = new Command("devpod")
  .description("Manage dev pods")
  .addCommand(devpodList)
  .addCommand(devpodCreate)
  .addCommand(devpodStatus)
  .addCommand(devpodStart)
  .addCommand(devpodStop)
  .addCommand(devpodDelete);
