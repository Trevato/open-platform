import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { randomUUID } from "crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { authenticateRequest } from "./auth.js";
import { errorPlugin } from "./routes/error.js";
import { createMcpServer } from "./mcp/server.js";
import { statusPlugin } from "./routes/status.js";
import { reposPlugin } from "./routes/repos.js";
import { prsPlugin } from "./routes/prs.js";
import { pipelinesPlugin } from "./routes/pipelines.js";
import { appsPlugin } from "./routes/apps.js";
import { orgsPlugin } from "./routes/orgs.js";
import { usersPlugin } from "./routes/users.js";
import { issuesPlugin } from "./routes/issues.js";
import { branchesPlugin } from "./routes/branches.js";
import { filesPlugin } from "./routes/files.js";
import { platformPlugin } from "./routes/platform.js";
import { instancesPlugin } from "./routes/instances.js";
import { devPodsPlugin } from "./routes/dev-pods.js";
import { agentRoutes } from "./routes/agents.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { mcpToolsPlugin } from "./routes/mcp-tools.js";
import { oauthRoutes } from "./auth/oauth-routes.js";
import { models } from "./models.js";
import { logger } from "./logger.js";
import { initScheduler } from "./services/scheduler.js";

// MCP session management
const transports = new Map<
  string,
  {
    transport: WebStandardStreamableHTTPServerTransport;
    lastAccessedAt: number;
    userLogin: string;
  }
>();

// Clean up idle sessions every 5 minutes
setInterval(
  () => {
    const maxAge = 4 * 60 * 60 * 1000; // 4 hours of inactivity
    for (const [id, entry] of transports) {
      if (Date.now() - entry.lastAccessedAt > maxAge) {
        entry.transport.close();
        transports.delete(id);
      }
    }
  },
  5 * 60 * 1000,
);

const app = new Elysia()
  .use(errorPlugin)
  .model(models)
  // @ts-ignore — duplicate elysia types from monorepo hoisting (same version, different paths)
  .use(
    swagger({
      path: "/swagger",
      documentation: {
        info: {
          title: "Open Platform API",
          version: "1.0.0",
          description: "REST and MCP interface for the Open Platform.",
        },
        tags: [
          { name: "Status", description: "Platform health" },
          { name: "Users", description: "User profile" },
          { name: "Orgs", description: "Organizations" },
          { name: "Repos", description: "Git repositories" },
          { name: "PRs", description: "Pull requests" },
          { name: "Branches", description: "Git branches" },
          { name: "Files", description: "File content" },
          { name: "Issues", description: "Issues, labels, milestones" },
          { name: "Pipelines", description: "CI/CD pipelines" },
          { name: "Apps", description: "Deployed applications" },
          { name: "Platform", description: "Admin-only platform management" },
          { name: "Instances", description: "vCluster instances" },
          { name: "Dev Pods", description: "Development environments" },
          { name: "Agents", description: "AI agent management" },
          { name: "MCP", description: "MCP tool catalog" },
          { name: "Webhooks", description: "Forgejo webhook receiver" },
        ],
        components: {
          securitySchemes: {
            bearer: {
              type: "http",
              scheme: "bearer",
              description: "Forgejo personal access token",
            },
          },
        },
        security: [{ bearer: [] }],
      },
      exclude: ["/mcp", "/swagger", "/swagger/json"],
    }),
  )

  // Request logging
  .onAfterResponse(({ request, set }) => {
    if (!request.url) return;
    try {
      const url = new URL(request.url);
      if (url.pathname === "/healthz") return;
      logger.info(
        { method: request.method, path: url.pathname, status: set.status },
        `${request.method} ${url.pathname}`,
      );
    } catch {
      // Ignore unparseable URLs
    }
  })

  // Reject null bytes in URL to prevent PostgreSQL injection
  .onBeforeHandle(({ request, set }) => {
    if (request.url.includes("%00") || request.url.includes("\0")) {
      set.status = 400;
      return { error: "Invalid characters in request" };
    }
  })

  // Root → Swagger docs
  .get("/", ({ redirect }) => redirect("/swagger"), {
    detail: { hide: true },
  })

  // Health check (no auth)
  .get("/healthz", () => ({ status: "ok" }), {
    detail: { tags: ["Health"], security: [] },
  })

  // OAuth2 Protected Resource Metadata (RFC 9728)
  .get(
    "/.well-known/oauth-protected-resource",
    () => {
      const domain = process.env.PLATFORM_DOMAIN || "";
      const prefix = process.env.SERVICE_PREFIX || "";
      return {
        resource: `https://${prefix}api.${domain}/mcp`,
        authorization_servers: [`https://${prefix}api.${domain}`],
        scopes_supported: [
          "read:user",
          "write:repository",
          "read:repository",
          "read:organization",
          "write:issue",
          "read:issue",
        ],
      };
    },
    { detail: { hide: true } },
  )

  // OAuth 2.1 routes (register, authorize, callback, token)
  .use(oauthRoutes)

  // REST API routes (all require Bearer token, except webhooks)
  .group("/api/v1", (app) =>
    app
      .use(webhookRoutes)
      .use(statusPlugin)
      .use(reposPlugin)
      .use(prsPlugin)
      .use(pipelinesPlugin)
      .use(appsPlugin)
      .use(orgsPlugin)
      .use(usersPlugin)
      .use(issuesPlugin)
      .use(branchesPlugin)
      .use(filesPlugin)
      .use(platformPlugin)
      .use(instancesPlugin)
      .use(devPodsPlugin)
      .use(agentRoutes)
      .use(mcpToolsPlugin),
  )

  // MCP endpoint — Streamable HTTP with session management
  .all("/mcp", async ({ request }) => {
    const method = request.method;
    const _mcpDomain = process.env.PLATFORM_DOMAIN || "";
    const _mcpPrefix = process.env.SERVICE_PREFIX || "";
    const _wwwAuth = `Bearer resource_metadata="https://${_mcpPrefix}api.${_mcpDomain}/.well-known/oauth-protected-resource"`;

    // DELETE — close session
    if (method === "DELETE") {
      const user = await authenticateRequest(request);
      if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: {
            "Content-Type": "application/json",
            "WWW-Authenticate": _wwwAuth,
          },
        });
      }
      const sessionId = request.headers.get("mcp-session-id");
      if (sessionId) {
        const entry = transports.get(sessionId);
        if (entry) {
          if (entry.userLogin !== user.login) {
            return new Response(JSON.stringify({ error: "Forbidden" }), {
              status: 403,
              headers: { "Content-Type": "application/json" },
            });
          }
          entry.transport.close();
          transports.delete(sessionId);
        }
      }
      return new Response(null, { status: 200 });
    }

    // GET — SSE stream for existing session
    if (method === "GET") {
      const user = await authenticateRequest(request);
      if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: {
            "Content-Type": "application/json",
            "WWW-Authenticate": _wwwAuth,
          },
        });
      }
      const sessionId = request.headers.get("mcp-session-id");
      const entry = sessionId ? transports.get(sessionId) : undefined;
      if (!entry) {
        return new Response(JSON.stringify({ error: "Session not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (entry.userLogin !== user.login) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
      entry.lastAccessedAt = Date.now();
      return entry.transport.handleRequest(request);
    }

    // POST — authenticate and handle
    const user = await authenticateRequest(request);
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "WWW-Authenticate": _wwwAuth,
        },
      });
    }

    const sessionId = request.headers.get("mcp-session-id");

    // Existing session
    if (sessionId && transports.has(sessionId)) {
      const entry = transports.get(sessionId)!;
      if (entry.userLogin !== user.login) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
      entry.lastAccessedAt = Date.now();
      return entry.transport.handleRequest(request);
    }

    // New or stale session — parse body to determine handling
    const body = await request.json();

    // No session ID and not an initialize request — client error
    if (!sessionId && !isInitializeRequest(body)) {
      return new Response(
        JSON.stringify({
          error:
            "Invalid request. Send an initialize request without session ID to start.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Create a fresh session (handles both new and stale/expired sessions)
    const newSessionId = randomUUID();
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => newSessionId,
    });
    transports.set(newSessionId, {
      transport,
      lastAccessedAt: Date.now(),
      userLogin: user.login,
    });

    const server = createMcpServer(user);
    await server.connect(transport);

    // For stale sessions with non-initialize requests, the new session
    // handles the request transparently — each tool call is self-contained
    // since the user's Forgejo token arrives in the bearer header every time.
    return transport.handleRequest(request, { parsedBody: body });
  })

  .listen(parseInt(process.env.PORT || "3000", 10));

logger.info(`listening on :${app.server?.port}`);
logger.info(`REST: http://localhost:${app.server?.port}/api/v1`);
logger.info(`MCP:  http://localhost:${app.server?.port}/mcp`);

// Initialize cron scheduler for agents
initScheduler().catch((err) => {
  logger.error({ err }, "Failed to initialize scheduler");
});

export type App = typeof app;
