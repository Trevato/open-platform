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
  if (!existsSync(CONFIG_PATH)) return null;

  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const parsed = yaml.load(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed.url !== "string" || typeof parsed.token !== "string") {
      return null;
    }
    return { url: parsed.url, token: parsed.token };
  } catch {
    return null;
  }
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
