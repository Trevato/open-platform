import { Command } from "commander";
import { createInterface } from "node:readline";
import { saveConfig, getConfigPath } from "../config.js";

export const loginCommand = new Command("login")
  .description("Authenticate with an Open Platform instance")
  .argument("<url>", "Platform API URL (e.g. https://api.open-platform.sh)")
  .option("-t, --token <token>", "Forgejo personal access token (skip prompt)")
  .option("-k, --insecure", "Skip TLS certificate verification")
  .action(async (url: string, opts: { token?: string; insecure?: boolean }) => {
    const normalized = url.replace(/\/+$/, "");
    const insecure = opts.insecure ?? false;

    const token = opts.token || (await promptToken());
    if (!token) {
      process.stderr.write("No token provided.\n");
      process.exit(1);
    }

    // Validate the token against the API
    try {
      const fetchOpts: RequestInit & Record<string, unknown> = {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      };

      if (insecure) {
        fetchOpts.tls = { rejectUnauthorized: false };
      }

      const res = await fetch(`${normalized}/api/v1/users/me`, fetchOpts);

      if (!res.ok) {
        process.stderr.write(
          "Authentication failed. Check your token and URL.\n",
        );
        process.exit(1);
      }

      const user = (await res.json()) as { login: string };
      saveConfig({ url: normalized, token, insecure });

      process.stdout.write(`Logged in as ${user.login}\n`);
      process.stdout.write(`Config saved to ${getConfigPath()}\n`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      process.stderr.write(`Connection failed: ${message}\n`);
      process.exit(1);
    }
  });

function promptToken(): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stderr,
    });
    rl.question("Forgejo personal access token: ", (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}
