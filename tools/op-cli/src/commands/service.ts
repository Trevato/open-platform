import { Command } from "commander";
import { requireConfig } from "../config.js";
import { OpClient } from "../client.js";
import { formatTable, statusDot, handleError } from "../format.js";

const serviceList = new Command("list")
  .description("List platform services and their status")
  .action(async () => {
    try {
      const client = new OpClient(requireConfig());
      const { services } = await client.listServices();

      if (services.length === 0) {
        process.stdout.write("No services found.\n");
        return;
      }

      const rows = services.map((s) => [
        statusDot(s.ready ? "running" : "stopped"),
        s.name,
        s.namespace,
        `${s.replicas.ready}/${s.replicas.total}`,
        s.url || "-",
      ]);
      process.stdout.write(formatTable(["", "NAME", "NAMESPACE", "REPLICAS", "URL"], rows));
    } catch (err) {
      handleError(err);
    }
  });

export const serviceCommand = new Command("service")
  .description("Platform service management")
  .addCommand(serviceList);
