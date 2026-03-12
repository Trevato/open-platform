import { Command } from "commander";
import { requireConfig } from "../config.js";
import { OpClient } from "../client.js";
import { handleError } from "../format.js";

export const whoamiCommand = new Command("whoami")
  .description("Show current authenticated user")
  .action(async () => {
    try {
      const client = new OpClient(requireConfig());
      const user = await client.getMe();

      process.stdout.write(`${user.login}\n`);
      if (user.fullName && user.fullName !== user.login) {
        process.stdout.write(`Name:  ${user.fullName}\n`);
      }
      process.stdout.write(`Email: ${user.email}\n`);
      if (user.isAdmin) {
        process.stdout.write(`Role:  admin\n`);
      }
    } catch (err) {
      handleError(err);
    }
  });
