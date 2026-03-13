import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import yaml from "js-yaml";

export interface OpConfig {
  url: string;
  token: string;
}

const CONFIG_DIR = join(homedir(), ".op");
const CONFIG_PATH = join(CONFIG_DIR, "config.yaml");

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export function getConfig(): OpConfig | null {
  if (existsSync(CONFIG_PATH)) {
    try {
      const raw = readFileSync(CONFIG_PATH, "utf-8");
      const parsed = yaml.load(raw) as Record<string, unknown>;
      if (parsed && typeof parsed.url === "string" && typeof parsed.token === "string") {
        return { url: parsed.url, token: parsed.token };
      }
    } catch {
      // fall through to env vars
    }
  }

  const url = process.env.OP_API_URL;
  const token = process.env.FORGEJO_TOKEN;
  if (url && token) {
    return { url, token };
  }

  return null;
}

export function requireConfig(): OpConfig {
  const config = getConfig();
  if (!config) {
    process.stderr.write(
      "Not logged in. Run `op login <url>` first.\n",
    );
    process.exit(1);
  }
  return config;
}

export function saveConfig(config: OpConfig): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
  const content = yaml.dump(config, { lineWidth: -1 });
  writeFileSync(CONFIG_PATH, content, { mode: 0o600 });
}
