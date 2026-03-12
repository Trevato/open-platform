import { OpClientError } from "./client.js";

// ANSI colors
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

export function statusDot(status: string): string {
  switch (status) {
    case "running":
      return `${GREEN}*${RESET}`;
    case "degraded":
      return `${YELLOW}*${RESET}`;
    case "stopped":
      return `${RED}*${RESET}`;
    default:
      return `${DIM}*${RESET}`;
  }
}

export function formatTable(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return "";

  const widths = headers.map((h, i) => {
    const max = Math.max(h.length, ...rows.map((r) => stripAnsi(r[i] || "").length));
    return max;
  });

  const lines: string[] = [];

  // Header
  const header = headers
    .map((h, i) => h.padEnd(widths[i]))
    .join("  ");
  lines.push(`${DIM}${header}${RESET}`);

  // Rows
  for (const row of rows) {
    const line = row
      .map((cell, i) => {
        const visible = stripAnsi(cell);
        const padding = widths[i] - visible.length;
        return cell + " ".repeat(Math.max(0, padding));
      })
      .join("  ");
    lines.push(line);
  }

  return lines.join("\n") + "\n";
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export function parseOrgRepo(ref: string): { org: string; repo: string } {
  const parts = ref.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    process.stderr.write(`Invalid reference "${ref}". Use org/repo format.\n`);
    process.exit(1);
  }
  return { org: parts[0], repo: parts[1] };
}

export function handleError(err: unknown): never {
  if (err instanceof OpClientError) {
    process.stderr.write(`Error (${err.status}): ${err.message}\n`);
  } else if (err instanceof Error) {
    process.stderr.write(`Error: ${err.message}\n`);
  } else {
    process.stderr.write("An unknown error occurred.\n");
  }
  process.exit(1);
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}
