import { Elysia } from "elysia";
import { createHmac, timingSafeEqual } from "crypto";
import {
  getAgent,
  getAgentWithToken,
  activateAgent,
  postAgentComment,
} from "../services/agent.js";
import { logger } from "../logger.js";

// ─── Constants ───

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";

// ─── Helpers ───

function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  // timingSafeEqual prevents HMAC guessing via response-time side-channel
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  return timingSafeEqual(sigBuf, expBuf);
}

/** Extract @agent-{slug} mentions from text. */
function extractAgentMentions(text: string): string[] {
  const matches = text.match(/@agent-([a-z0-9-]+)/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(1)); // Remove the @ prefix → "agent-{slug}"
}

/** Derive the agent slug from a forgejo_username like "agent-my-bot". */
function usernameToSlug(forgejoUsername: string): string {
  return forgejoUsername.replace(/^agent-/, "");
}

// ─── Webhook payload types ───

interface WebhookIssueComment {
  action: string;
  comment: {
    body: string;
    user: { login: string };
  };
  issue: {
    number: number;
    title: string;
  };
  repository: {
    name: string;
    owner: { login: string };
  };
}

interface WebhookPullRequest {
  action: string;
  pull_request: {
    number: number;
    title: string;
    body: string;
    user: { login: string };
  };
  repository: {
    name: string;
    owner: { login: string };
  };
}

interface WebhookIssue {
  action: string;
  issue: {
    number: number;
    title: string;
    body: string;
    user: { login: string };
  };
  repository: {
    name: string;
    owner: { login: string };
  };
}

// ─── Route ───

export const webhookRoutes = new Elysia({ prefix: "/webhooks" })
  // POST /api/v1/webhooks/forgejo — receives Forgejo webhook payloads
  // No authPlugin — webhooks use HMAC signature validation
  .post(
    "/forgejo",
    async ({ request, set }) => {
      const rawBody = await request.text();

      // Validate signature — WEBHOOK_SECRET must be configured
      if (!WEBHOOK_SECRET) {
        logger.warn(
          "Webhook received but WEBHOOK_SECRET is not configured — rejecting",
        );
        set.status = 503;
        return {
          error: "Webhook endpoint not configured (WEBHOOK_SECRET missing)",
        };
      }
      const signature = request.headers.get("x-forgejo-signature") || "";
      if (!verifyWebhookSignature(rawBody, signature, WEBHOOK_SECRET)) {
        logger.warn("Webhook signature verification failed");
        set.status = 401;
        return { error: "Invalid webhook signature" };
      }

      const eventType = request.headers.get("x-forgejo-event") || "";
      let payload: unknown;
      try {
        payload = JSON.parse(rawBody);
      } catch {
        set.status = 400;
        return { error: "Invalid JSON payload" };
      }

      // Process based on event type
      try {
        switch (eventType) {
          case "issue_comment":
            await handleIssueComment(payload as WebhookIssueComment);
            break;
          case "pull_request":
            await handlePullRequest(payload as WebhookPullRequest);
            break;
          case "issues":
            await handleIssue(payload as WebhookIssue);
            break;
          default:
            logger.debug({ eventType }, "Ignoring unhandled webhook event");
        }
      } catch (err) {
        logger.error({ err, eventType }, "Error processing webhook");
      }

      // Always return 200 — webhook processing is best-effort
      return { received: true };
    },
    {
      detail: {
        tags: ["Webhooks"],
        summary: "Receive Forgejo webhook",
        security: [],
      },
    },
  );

// ─── Event handlers ───

async function handleIssueComment(payload: WebhookIssueComment): Promise<void> {
  if (payload.action !== "created") return;

  const mentions = extractAgentMentions(payload.comment.body);
  if (mentions.length === 0) return;

  const owner = payload.repository.owner.login;
  const repo = payload.repository.name;
  const issueNumber = payload.issue.number;

  for (const forgejoUsername of mentions) {
    const slug = usernameToSlug(forgejoUsername);
    const agent = await getAgentWithToken(slug);
    if (!agent || !agent.forgejo_token) continue;

    // Skip if the comment was made by the agent itself (prevent loops)
    if (payload.comment.user.login === agent.forgejo_username) continue;

    const context = {
      event: "issue_comment",
      owner,
      repo,
      issue_number: issueNumber,
      issue_title: payload.issue.title,
      comment_body: payload.comment.body,
      comment_author: payload.comment.user.login,
    };

    // Post acknowledgment
    await postAgentComment(
      agent.forgejo_token,
      owner,
      repo,
      issueNumber,
      `On it. Looking into this now.`,
    );

    // Activate agent
    await activateAgent(slug, payload.comment.body, context);

    logger.info(
      { slug, owner, repo, issueNumber },
      "Agent activated from issue comment mention",
    );
  }
}

async function handlePullRequest(payload: WebhookPullRequest): Promise<void> {
  if (payload.action !== "opened" && payload.action !== "edited") return;

  const body = payload.pull_request.body || "";
  const mentions = extractAgentMentions(body);
  if (mentions.length === 0) return;

  const owner = payload.repository.owner.login;
  const repo = payload.repository.name;
  const prNumber = payload.pull_request.number;

  for (const forgejoUsername of mentions) {
    const slug = usernameToSlug(forgejoUsername);
    const agent = await getAgentWithToken(slug);
    if (!agent || !agent.forgejo_token) continue;

    if (payload.pull_request.user.login === agent.forgejo_username) continue;

    const context = {
      event: "pull_request",
      action: payload.action,
      owner,
      repo,
      pr_number: prNumber,
      pr_title: payload.pull_request.title,
      pr_body: body,
      pr_author: payload.pull_request.user.login,
    };

    await postAgentComment(
      agent.forgejo_token,
      owner,
      repo,
      prNumber,
      `On it. Reviewing this pull request now.`,
    );

    await activateAgent(slug, body, context);

    logger.info(
      { slug, owner, repo, prNumber },
      "Agent activated from PR mention",
    );
  }
}

async function handleIssue(payload: WebhookIssue): Promise<void> {
  if (payload.action !== "opened") return;

  const body = payload.issue.body || "";
  const mentions = extractAgentMentions(body);
  if (mentions.length === 0) return;

  const owner = payload.repository.owner.login;
  const repo = payload.repository.name;
  const issueNumber = payload.issue.number;

  for (const forgejoUsername of mentions) {
    const slug = usernameToSlug(forgejoUsername);
    const agent = await getAgentWithToken(slug);
    if (!agent || !agent.forgejo_token) continue;

    if (payload.issue.user.login === agent.forgejo_username) continue;

    const context = {
      event: "issue",
      owner,
      repo,
      issue_number: issueNumber,
      issue_title: payload.issue.title,
      issue_body: body,
      issue_author: payload.issue.user.login,
    };

    await postAgentComment(
      agent.forgejo_token,
      owner,
      repo,
      issueNumber,
      `On it. Looking into this now.`,
    );

    await activateAgent(slug, body, context);

    logger.info(
      { slug, owner, repo, issueNumber },
      "Agent activated from issue mention",
    );
  }
}
