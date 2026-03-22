import * as k8s from "@kubernetes/client-node";
import pool from "./db.js";
import { logger } from "../logger.js";
import type { AuthenticatedUser } from "../auth.js";
import {
  type DevPodSpec,
  ensureHostInfrastructure,
  createDevPod,
  startDevPod,
  getDevPodStatus,
  getHostClients,
  execInPod,
  NAMESPACE as DEVPOD_NAMESPACE,
  podName as devpodPodName,
} from "./devpod.js";

// ─── Constants ───

const FORGEJO_URL =
  process.env.FORGEJO_INTERNAL_URL || process.env.FORGEJO_URL || "";
const PLATFORM_DOMAIN = process.env.PLATFORM_DOMAIN || "";
const SERVICE_PREFIX = (process.env.SERVICE_PREFIX || "").trim();
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";

// ─── Types ───

export interface Agent {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  description: string | null;
  model: string;
  instructions: string | null;
  allowed_tools: string[];
  forgejo_username: string;
  forgejo_token: string | null;
  orgs: string[];
  schedule: string | null;
  status: string;
  max_steps: number;
  last_activity_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAgentOpts {
  name: string;
  slug: string;
  description?: string;
  model?: string;
  instructions?: string;
  allowed_tools?: string[];
  orgs?: string[];
  schedule?: string;
  max_steps?: number;
}

export interface UpdateAgentOpts {
  name?: string;
  description?: string;
  model?: string;
  instructions?: string;
  allowed_tools?: string[];
  orgs?: string[];
  schedule?: string;
  max_steps?: number;
}

// ─── Forgejo admin auth ───

function adminHeaders(): HeadersInit {
  const user = process.env.FORGEJO_ADMIN_USER || "";
  const pass = process.env.FORGEJO_ADMIN_PASSWORD || "";
  return {
    Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`,
    "Content-Type": "application/json",
  };
}

// ─── Forgejo identity lifecycle ───

async function createForgejoUser(
  username: string,
  email: string,
): Promise<void> {
  const password = crypto
    .getRandomValues(new Uint8Array(24))
    .reduce((s, b) => s + b.toString(16).padStart(2, "0"), "");

  const res = await fetch(`${FORGEJO_URL}/api/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      username,
      email,
      password,
      must_change_password: false,
      login_name: username,
      source_id: 0,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create Forgejo user: ${res.status} ${body}`);
  }
}

async function createForgejoToken(username: string): Promise<string> {
  const tokenName = `agent-pat`;

  // Delete existing token with the same name
  try {
    const listRes = await fetch(
      `${FORGEJO_URL}/api/v1/users/${encodeURIComponent(username)}/tokens`,
      { headers: adminHeaders() },
    );
    if (listRes.ok) {
      const tokens = (await listRes.json()) as { id: number; name: string }[];
      const existing = tokens.find((t) => t.name === tokenName);
      if (existing) {
        await fetch(
          `${FORGEJO_URL}/api/v1/users/${encodeURIComponent(username)}/tokens/${existing.id}`,
          { method: "DELETE", headers: adminHeaders() },
        );
      }
    }
  } catch {
    // Token list failed — continue to create
  }

  const res = await fetch(
    `${FORGEJO_URL}/api/v1/users/${encodeURIComponent(username)}/tokens`,
    {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({
        name: tokenName,
        scopes: [
          "read:user",
          "write:repository",
          "read:repository",
          "read:organization",
          "write:issue",
          "read:issue",
          "read:package",
          "write:package",
        ],
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create Forgejo token: ${res.status} ${body}`);
  }

  const data = (await res.json()) as { sha1: string };
  return data.sha1;
}

async function addUserToOrg(username: string, org: string): Promise<void> {
  // Forgejo requires adding users to a team, not directly to an org.
  // Find the first team (typically "Owners") and add the user there.
  try {
    const teamsRes = await fetch(
      `${FORGEJO_URL}/api/v1/orgs/${encodeURIComponent(org)}/teams`,
      { headers: adminHeaders() },
    );

    if (!teamsRes.ok) {
      logger.warn({ org, status: teamsRes.status }, "Failed to list org teams");
      return;
    }

    const teams = (await teamsRes.json()) as { id: number; name: string }[];
    // Prefer "Owners" team, fall back to first team
    const team = teams.find((t) => t.name === "Owners") || teams[0];
    if (!team) {
      logger.warn({ org }, "No teams found in org");
      return;
    }

    const res = await fetch(
      `${FORGEJO_URL}/api/v1/teams/${team.id}/members/${encodeURIComponent(username)}`,
      { method: "PUT", headers: adminHeaders() },
    );

    if (!res.ok && res.status !== 204) {
      const body = await res.text();
      logger.warn(
        { org, username, teamId: team.id, status: res.status },
        `Failed to add user to team: ${body}`,
      );
    }
  } catch (err) {
    logger.warn({ err, org, username }, "Error adding user to org");
  }
}

async function removeUserFromOrg(username: string, org: string): Promise<void> {
  const res = await fetch(
    `${FORGEJO_URL}/api/v1/orgs/${encodeURIComponent(org)}/members/${encodeURIComponent(username)}`,
    { method: "DELETE", headers: adminHeaders() },
  );

  if (!res.ok && res.status !== 204 && res.status !== 404) {
    const body = await res.text();
    logger.warn(
      { org, username, status: res.status },
      `Failed to remove user from org: ${body}`,
    );
  }
}

async function ensureOrgWebhook(org: string): Promise<void> {
  const webhookUrl = `https://${SERVICE_PREFIX}api.${PLATFORM_DOMAIN}/api/v1/webhooks/forgejo`;

  // Check existing hooks to avoid duplicates
  try {
    const listRes = await fetch(
      `${FORGEJO_URL}/api/v1/orgs/${encodeURIComponent(org)}/hooks`,
      { headers: adminHeaders() },
    );

    if (listRes.ok) {
      const hooks = (await listRes.json()) as { config: { url: string } }[];
      const exists = hooks.some((h) => h.config?.url === webhookUrl);
      if (exists) return;
    }
  } catch {
    // List failed — attempt to create anyway
  }

  const res = await fetch(
    `${FORGEJO_URL}/api/v1/orgs/${encodeURIComponent(org)}/hooks`,
    {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({
        type: "forgejo",
        active: true,
        config: {
          url: webhookUrl,
          content_type: "json",
          secret: WEBHOOK_SECRET,
        },
        events: ["issue_comment", "pull_request", "issues"],
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    logger.warn(
      { org, status: res.status },
      `Failed to create org webhook: ${body}`,
    );
  }
}

async function deleteForgejoUser(username: string): Promise<void> {
  const res = await fetch(
    `${FORGEJO_URL}/api/v1/admin/users/${encodeURIComponent(username)}`,
    { method: "DELETE", headers: adminHeaders() },
  );

  if (!res.ok && res.status !== 404) {
    const body = await res.text();
    logger.warn(
      { username, status: res.status },
      `Failed to delete Forgejo user: ${body}`,
    );
  }
}

// ─── Database operations ───

export async function createAgent(
  user: AuthenticatedUser,
  opts: CreateAgentOpts,
): Promise<Agent> {
  const forgejoUsername = `agent-${opts.slug}`;
  const forgejoEmail = `agent-${opts.slug}@${PLATFORM_DOMAIN}`;
  const orgs = opts.orgs || [];
  const model = opts.model || "claude-sonnet-4-20250514";
  const maxSteps = opts.max_steps ?? 50;

  // 1. Create Forgejo user
  await createForgejoUser(forgejoUsername, forgejoEmail);
  logger.info({ username: forgejoUsername }, "Created Forgejo user for agent");

  // 2. Generate PAT
  let forgejoToken: string;
  try {
    forgejoToken = await createForgejoToken(forgejoUsername);
    logger.info({ username: forgejoUsername }, "Created Forgejo PAT for agent");
  } catch (err) {
    // Cleanup user on token failure
    await deleteForgejoUser(forgejoUsername);
    throw err;
  }

  // 3. Add to orgs
  for (const org of orgs) {
    await addUserToOrg(forgejoUsername, org);
  }

  // 4. Register org webhooks
  for (const org of orgs) {
    await ensureOrgWebhook(org);
  }

  // 5. Insert DB record
  const result = await pool.query(
    `INSERT INTO agents (
      user_id, name, slug, description, model, instructions,
      allowed_tools, forgejo_username, forgejo_token, orgs,
      schedule, status, max_steps
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *`,
    [
      String(user.id),
      opts.name,
      opts.slug,
      opts.description || null,
      model,
      opts.instructions || null,
      opts.allowed_tools || [],
      forgejoUsername,
      forgejoToken,
      orgs,
      opts.schedule || null,
      "idle",
      maxSteps,
    ],
  );

  return result.rows[0] as Agent;
}

export async function listAgents(
  userId: string,
  all: boolean,
): Promise<Agent[]> {
  if (all) {
    const result = await pool.query(
      `SELECT * FROM agents ORDER BY created_at DESC`,
    );
    return result.rows as Agent[];
  }

  const result = await pool.query(
    `SELECT * FROM agents WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return result.rows as Agent[];
}

export async function getAgent(slug: string): Promise<Agent | null> {
  const result = await pool.query(`SELECT * FROM agents WHERE slug = $1`, [
    slug,
  ]);
  return result.rows.length > 0 ? (result.rows[0] as Agent) : null;
}

export async function getAgentWithToken(slug: string): Promise<Agent | null> {
  // Same query — token is always in the row, stripping happens at the route layer
  return getAgent(slug);
}

export async function updateAgent(
  slug: string,
  opts: UpdateAgentOpts,
): Promise<Agent | null> {
  const agent = await getAgent(slug);
  if (!agent) return null;

  // Build dynamic update
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (opts.name !== undefined) {
    fields.push(`name = $${idx++}`);
    values.push(opts.name);
  }
  if (opts.description !== undefined) {
    fields.push(`description = $${idx++}`);
    values.push(opts.description);
  }
  if (opts.model !== undefined) {
    fields.push(`model = $${idx++}`);
    values.push(opts.model);
  }
  if (opts.instructions !== undefined) {
    fields.push(`instructions = $${idx++}`);
    values.push(opts.instructions);
  }
  if (opts.allowed_tools !== undefined) {
    fields.push(`allowed_tools = $${idx++}`);
    values.push(opts.allowed_tools);
  }
  if (opts.schedule !== undefined) {
    fields.push(`schedule = $${idx++}`);
    values.push(opts.schedule);
  }
  if (opts.max_steps !== undefined) {
    fields.push(`max_steps = $${idx++}`);
    values.push(opts.max_steps);
  }

  // Handle org membership changes
  if (opts.orgs !== undefined) {
    fields.push(`orgs = $${idx++}`);
    values.push(opts.orgs);

    const oldOrgs = new Set(agent.orgs || []);
    const newOrgs = new Set(opts.orgs);

    // Remove from orgs no longer listed
    for (const org of oldOrgs) {
      if (!newOrgs.has(org)) {
        await removeUserFromOrg(agent.forgejo_username, org);
      }
    }

    // Add to new orgs
    for (const org of newOrgs) {
      if (!oldOrgs.has(org)) {
        await addUserToOrg(agent.forgejo_username, org);
        await ensureOrgWebhook(org);
      }
    }
  }

  if (fields.length === 0) return agent;

  fields.push(`updated_at = NOW()`);
  values.push(slug);

  const result = await pool.query(
    `UPDATE agents SET ${fields.join(", ")} WHERE slug = $${idx} RETURNING *`,
    values,
  );

  return result.rows.length > 0 ? (result.rows[0] as Agent) : null;
}

export async function deleteAgent(slug: string): Promise<boolean> {
  const agent = await getAgent(slug);
  if (!agent) return false;

  // Delete Forgejo user (cascades tokens, repos, etc.)
  await deleteForgejoUser(agent.forgejo_username);
  logger.info(
    { username: agent.forgejo_username },
    "Deleted Forgejo user for agent",
  );

  // Delete DB record
  await pool.query(`DELETE FROM agents WHERE slug = $1`, [slug]);

  return true;
}

export async function activateAgent(
  slug: string,
  prompt: string,
  context?: Record<string, unknown>,
): Promise<Agent | null> {
  const result = await pool.query(
    `UPDATE agents
     SET status = 'running', last_activity_at = NOW(), error_message = NULL, updated_at = NOW()
     WHERE slug = $1
     RETURNING *`,
    [slug],
  );

  if (result.rows.length === 0) return null;
  const agent = result.rows[0] as Agent;

  logger.info(
    { slug, prompt: prompt.slice(0, 100), context },
    "Agent activated",
  );

  // Fire-and-forget execution — don't block the webhook response
  executeAgent(agent, prompt, context).catch((err) => {
    logger.error({ err, slug }, "Agent execution failed");
    pool
      .query(
        `UPDATE agents SET status = 'error', error_message = $2, updated_at = NOW() WHERE slug = $1`,
        [slug, String(err)],
      )
      .catch(() => {});
  });

  return agent;
}

// ─── Agent execution pipeline ───

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

async function waitForRunningPod(
  coreV1: k8s.CoreV1Api,
  namespace: string,
  labelSelector: string,
  timeoutMs = 120_000,
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const pods = await coreV1.listNamespacedPod({ namespace, labelSelector });
    const running = pods.items.find(
      (p) =>
        p.status?.phase === "Running" &&
        p.status?.containerStatuses?.every((c) => c.ready) &&
        p.metadata?.name,
    );
    if (running?.metadata?.name) return running.metadata.name;
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(
    `Pod with selector ${labelSelector} not ready after ${timeoutMs}ms`,
  );
}

async function ensureAgentDevPod(agent: Agent): Promise<void> {
  const status = await getDevPodStatus(agent.forgejo_username);
  if (status.exists) {
    if (status.replicas === 0) {
      await startDevPod(agent.forgejo_username);
      logger.info(
        { username: agent.forgejo_username },
        "Started existing agent dev pod",
      );
    }
    return;
  }

  // Create new dev pod for the agent
  await ensureHostInfrastructure();

  const spec: DevPodSpec = {
    username: agent.forgejo_username,
    email: `${agent.forgejo_username}@${PLATFORM_DOMAIN}`,
    fullName: agent.name,
    forgejoToken: agent.forgejo_token || "",
    forgejoUrl: `https://${SERVICE_PREFIX}forgejo.${PLATFORM_DOMAIN}`,
    cpuLimit: "2000m",
    memoryLimit: "4Gi",
    storageSize: "20Gi",
  };

  await createDevPod(spec);
  logger.info({ username: agent.forgejo_username }, "Created agent dev pod");
}

function buildPrompt(
  agent: Agent,
  prompt: string,
  context?: Record<string, unknown>,
): string {
  const parts: string[] = [];

  if (agent.instructions) {
    parts.push(`## System Instructions\n${agent.instructions}`);
  }

  if (context) {
    const { event, owner, repo, issue_number, pr_number } = context as Record<
      string,
      unknown
    >;
    parts.push(`## Context`);
    parts.push(`Event: ${event}`);
    parts.push(`Repository: ${owner}/${repo}`);
    if (issue_number) parts.push(`Issue: #${issue_number}`);
    if (pr_number) parts.push(`PR: #${pr_number}`);
  }

  parts.push(`## Task\n${prompt}`);

  if (context) {
    const { repo } = context as Record<string, unknown>;
    parts.push(`## Workflow`);
    parts.push(
      `Work in ~/projects/${repo}. Create a feature branch, make changes, commit, push, and open a PR.`,
    );
    parts.push(`Post a concise summary of what you did.`);
  }

  return parts.join("\n\n");
}

async function executeAgent(
  agent: Agent,
  prompt: string,
  context?: Record<string, unknown>,
): Promise<void> {
  // 1. Ensure dev pod exists and is running
  await ensureAgentDevPod(agent);

  // 2. Wait for pod to be ready (5 min for image pull + init)
  const { coreV1, kc } = getHostClients();
  const selector = `app=${devpodPodName(agent.forgejo_username)}`;
  const runningPod = await waitForRunningPod(
    coreV1,
    DEVPOD_NAMESPACE,
    selector,
    300_000,
  );
  logger.info({ pod: runningPod, slug: agent.slug }, "Agent dev pod ready");

  // Wait for init.sh to complete (check for .devpod-initialized marker)
  const initStart = Date.now();
  while (Date.now() - initStart < 300_000) {
    try {
      const check = await execInPod(kc, DEVPOD_NAMESPACE, runningPod, "dev", [
        "bash",
        "-c",
        "[ -f /home/dev/.devpod-initialized ] && echo ready || echo waiting",
      ]);
      if (check.stdout.trim() === "ready") break;
    } catch {
      // exec may fail if container not fully ready
    }
    logger.debug({ slug: agent.slug }, "Waiting for init.sh to complete...");
    await new Promise((r) => setTimeout(r, 10_000));
  }
  logger.info({ slug: agent.slug }, "Dev pod initialization complete");

  // 3. Build the full prompt
  const fullPrompt = buildPrompt(agent, prompt, context);

  // 4. Execute claude --print in the dev pod (container runs as dev user)
  // Write prompt to a file, run claude, capture output to file — avoids
  // WebSocket stream race conditions and shell escaping edge cases.
  const repoDir = (context as Record<string, unknown>)?.repo || "";
  const promptFile = "/tmp/agent-prompt.txt";
  const outputFile = "/tmp/agent-output.txt";
  const stderrFile = "/tmp/agent-stderr.txt";

  // Pull latest changes so agent picks up CLAUDE.md and .claude/ config
  if (repoDir) {
    await execInPod(kc, DEVPOD_NAMESPACE, runningPod, "dev", [
      "bash",
      "-c",
      `cd ~/projects/${repoDir} && git checkout main 2>/dev/null && git pull --ff-only 2>/dev/null; chmod +x .claude/hooks/*.sh 2>/dev/null; true`,
    ]);
  }

  // Write prompt to file in the pod
  await execInPod(kc, DEVPOD_NAMESPACE, runningPod, "dev", [
    "bash",
    "-c",
    `cat > ${promptFile} << 'AGENT_PROMPT_EOF'\n${fullPrompt}\nAGENT_PROMPT_EOF`,
  ]);

  const systemPromptExtra = [
    "IMPORTANT: Before committing, always run the project's typecheck/lint commands and fix any errors.",
    "Read CLAUDE.md in the repo root before making changes.",
    "Keep changes focused and minimal. Do not modify files unrelated to the task.",
  ].join(" ");

  const shellCmd = [
    `export ANTHROPIC_API_KEY=${shellEscape(ANTHROPIC_API_KEY)}`,
    `cd ~/projects/${repoDir} 2>/dev/null || cd ~`,
    `cat ${promptFile} | claude -p --model ${agent.model} --dangerously-skip-permissions --max-turns ${agent.max_steps} --append-system-prompt ${shellEscape(systemPromptExtra)} > ${outputFile} 2> ${stderrFile}`,
    `echo "AGENT_EXIT_CODE=$?"`,
  ].join(" && ");

  logger.info(
    { slug: agent.slug, pod: runningPod },
    "Executing claude in agent dev pod",
  );

  await execInPod(kc, DEVPOD_NAMESPACE, runningPod, "dev", [
    "bash",
    "-lc",
    shellCmd,
  ]);

  // Read output files back
  const outputResult = await execInPod(
    kc,
    DEVPOD_NAMESPACE,
    runningPod,
    "dev",
    ["cat", outputFile],
  );
  const stderrResult = await execInPod(
    kc,
    DEVPOD_NAMESPACE,
    runningPod,
    "dev",
    ["cat", stderrFile],
  );

  const output = outputResult.stdout.trim();
  const errorOutput = stderrResult.stdout.trim();

  if (errorOutput) {
    logger.warn(
      { slug: agent.slug, stderr: errorOutput.slice(0, 500) },
      "Agent stderr output",
    );
  }

  // 5. Post results back to the issue/PR
  if (context && agent.forgejo_token) {
    const { owner, repo, issue_number, pr_number } = context as Record<
      string,
      unknown
    >;
    const targetNumber = (issue_number || pr_number) as number;
    if (owner && repo && targetNumber) {
      const summary =
        output.length > 60000
          ? output.slice(0, 60000) + "\n\n...(truncated)"
          : output;
      const comment = summary || "(No output from agent)";
      await postAgentComment(
        agent.forgejo_token,
        String(owner),
        String(repo),
        targetNumber,
        comment,
      );
      logger.info(
        { slug: agent.slug, owner, repo, targetNumber },
        "Posted agent results",
      );
    }
  }

  // 6. Update status to idle
  await pool.query(
    `UPDATE agents SET status = 'idle', last_activity_at = NOW(), updated_at = NOW() WHERE slug = $1`,
    [agent.slug],
  );

  logger.info(
    { slug: agent.slug, outputLength: output.length },
    "Agent execution completed",
  );
}

function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

// ─── Webhook helpers ───

/**
 * Post a comment to an issue or PR via the agent's Forgejo token.
 */
export async function postAgentComment(
  agentToken: string,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string,
): Promise<void> {
  const res = await fetch(
    `${FORGEJO_URL}/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/comments`,
    {
      method: "POST",
      headers: {
        Authorization: `token ${agentToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    logger.warn(
      { owner, repo, issueNumber, status: res.status },
      `Failed to post agent comment: ${text}`,
    );
  }
}
