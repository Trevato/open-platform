import { Command } from "commander";
import { requireConfig } from "../config.js";
import { OpClient } from "../client.js";
import { formatTable, handleError } from "../format.js";

const GREEN = "\x1b[32m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

const userList = new Command("list")
  .description("List platform users")
  .action(async () => {
    try {
      const client = new OpClient(requireConfig());
      const { users } = await client.listUsers();

      if (users.length === 0) {
        process.stdout.write("No users found.\n");
        return;
      }

      const rows = users.map((u) => [
        u.login,
        u.email || "-",
        u.full_name || "-",
        u.is_admin ? `${GREEN}admin${RESET}` : `${DIM}user${RESET}`,
      ]);
      process.stdout.write(
        formatTable(["LOGIN", "EMAIL", "NAME", "ROLE"], rows),
      );
    } catch (err) {
      handleError(err);
    }
  });

const userCreate = new Command("create")
  .description("Create a new platform user")
  .argument("<username>", "Username for the new user")
  .argument("<email>", "Email address for the new user")
  .action(async (username: string, email: string) => {
    try {
      const client = new OpClient(requireConfig());
      const result = await client.createUser(username, email);

      process.stdout.write(`Created user: ${result.user.login}\n`);
      process.stdout.write(`Email:    ${result.user.email}\n`);
      process.stdout.write(`Password: ${result.initialPassword}\n`);
    } catch (err) {
      handleError(err);
    }
  });

const userWhoami = new Command("whoami")
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

export const userCommand = new Command("user")
  .description("Platform user management")
  .addCommand(userList)
  .addCommand(userCreate)
  .addCommand(userWhoami);
