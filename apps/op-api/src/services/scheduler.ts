import { CronJob } from "cron";
import pool from "./db.js";
import { getAgent, activateAgent } from "./agent.js";
import { logger } from "../logger.js";

const jobs = new Map<string, CronJob>();
const running = new Set<string>();

/**
 * Initialize the scheduler — load all agents with non-null schedules
 * and create cron jobs for them.
 */
export async function initScheduler(): Promise<void> {
  const result = await pool.query(
    `SELECT slug, schedule FROM agents WHERE schedule IS NOT NULL AND schedule != ''`,
  );

  for (const row of result.rows) {
    try {
      scheduleAgent(row.slug, row.schedule);
    } catch (err) {
      logger.warn(
        { err, slug: row.slug, schedule: row.schedule },
        "Failed to schedule agent",
      );
    }
  }

  logger.info({ count: jobs.size }, "Scheduler initialized");
}

/**
 * Create or replace a cron job for an agent.
 */
export function scheduleAgent(slug: string, cronExpr: string): void {
  // Remove existing job if any
  unscheduleAgent(slug);

  try {
    const job = CronJob.from({
      cronTime: cronExpr,
      onTick: () => triggerAgent(slug),
      start: true,
      timeZone: "UTC",
    });

    jobs.set(slug, job);
    logger.info({ slug, schedule: cronExpr }, "Scheduled agent");
  } catch (err) {
    logger.error({ err, slug, schedule: cronExpr }, "Invalid cron expression");
    throw err;
  }
}

/**
 * Stop and remove a cron job for an agent.
 */
export function unscheduleAgent(slug: string): void {
  const existing = jobs.get(slug);
  if (existing) {
    existing.stop();
    jobs.delete(slug);
    logger.info({ slug }, "Unscheduled agent");
  }
}

/**
 * Trigger an agent execution from cron. Skips if already running.
 */
async function triggerAgent(slug: string): Promise<void> {
  if (running.has(slug)) {
    logger.info({ slug }, "Skipping scheduled trigger — agent already running");
    return;
  }

  running.add(slug);

  // Write run record
  const runId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO agent_runs (id, agent_slug, trigger, status, prompt, started_at)
     VALUES ($1, $2, 'cron', 'running', 'Scheduled execution', NOW())`,
    [runId, slug],
  );

  try {
    const agent = await getAgent(slug);
    if (!agent) {
      logger.warn(
        { slug },
        "Scheduled agent not found — removing from scheduler",
      );
      unscheduleAgent(slug);
      return;
    }

    logger.info({ slug }, "Cron triggering agent");
    await activateAgent(
      slug,
      agent.instructions || "Execute your scheduled tasks.",
      undefined,
    );

    // Wait for agent to finish (poll status)
    const start = Date.now();
    const timeout = 10 * 60 * 1000; // 10 minutes
    while (Date.now() - start < timeout) {
      await new Promise((r) => setTimeout(r, 10_000));
      const current = await getAgent(slug);
      if (!current || current.status !== "running") break;
    }

    const final = await getAgent(slug);
    const duration = Date.now() - start;

    await pool.query(
      `UPDATE agent_runs
       SET status = $1, completed_at = NOW(), duration_ms = $2, error_message = $3
       WHERE id = $4`,
      [
        final?.status === "error" ? "error" : "completed",
        duration,
        final?.error_message || null,
        runId,
      ],
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, slug }, "Scheduled agent execution failed");
    await pool
      .query(
        `UPDATE agent_runs
       SET status = 'error', completed_at = NOW(), error_message = $1
       WHERE id = $2`,
        [message, runId],
      )
      .catch(() => {});
  } finally {
    running.delete(slug);
  }
}
