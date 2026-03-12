import { Command } from "commander";
import { requireConfig } from "../config.js";
import { OpClient } from "../client.js";
import { formatTable, statusDot, handleError } from "../format.js";

export const statusCommand = new Command("status")
  .description("Show platform health and service status")
  .action(async () => {
    try {
      const client = new OpClient(requireConfig());
      const status = await client.getStatus();

      const health = status.healthy ? `${statusDot("running")} healthy` : `${statusDot("stopped")} unhealthy`;
      process.stdout.write(`Platform: ${health}\n\n`);

      if (status.services.length > 0) {
        process.stdout.write("Services:\n");
        const rows = status.services.map((s) => [
          statusDot(s.ready ? "running" : "stopped"),
          s.name,
          `${s.replicas.ready}/${s.replicas.total}`,
          s.url || "-",
        ]);
        process.stdout.write(formatTable(["", "NAME", "READY", "URL"], rows));
      }

      if (status.apps.length > 0) {
        process.stdout.write("\nApps:\n");
        const rows = status.apps.map((a) => [
          statusDot(a.status),
          `${a.org}/${a.repo}`,
          `${a.replicas.ready}/${a.replicas.desired}`,
          a.url || "-",
        ]);
        process.stdout.write(formatTable(["", "APP", "READY", "URL"], rows));
      }
    } catch (err) {
      handleError(err);
    }
  });
