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
import { models } from "./models.js";
import { logger } from "./logger.js";

// MCP session management
const transports = new Map<
  string,
  { transport: WebStandardStreamableHTTPServerTransport; createdAt: number }
>();

// Clean up stale sessions every 5 minutes
setInterval(
  () => {
    const maxAge = 30 * 60 * 1000; // 30 minutes
    for (const [id, entry] of transports) {
      if (Date.now() - entry.createdAt > maxAge) {
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
      .use(agentRoutes),
  )

  // MCP endpoint — Streamable HTTP with session management
  .all("/mcp", async ({ request }) => {
    const method = request.method;

    // DELETE — close session
    if (method === "DELETE") {
      const sessionId = request.headers.get("mcp-session-id");
      if (sessionId) {
        const entry = transports.get(sessionId);
        if (entry) {
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
          headers: { "Content-Type": "application/json" },
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
      return entry.transport.handleRequest(request);
    }

    // POST — authenticate and handle
    const user = await authenticateRequest(request);
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const sessionId = request.headers.get("mcp-session-id");

    // Existing session
    if (sessionId && transports.has(sessionId)) {
      const { transport } = transports.get(sessionId)!;
      return transport.handleRequest(request);
    }

    // New session — must be initialize request
    const body = await request.json();
    if (!isInitializeRequest(body)) {
      return new Response(
        JSON.stringify({
          error:
            "Invalid request. Send an initialize request without session ID to start.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const newSessionId = randomUUID();
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => newSessionId,
    });
    transports.set(newSessionId, { transport, createdAt: Date.now() });

    const server = createMcpServer(user);
    await server.connect(transport);
    return transport.handleRequest(request, { parsedBody: body });
  })

  .listen(parseInt(process.env.PORT || "3000", 10));

logger.info(`listening on :${app.server?.port}`);
logger.info(`REST: http://localhost:${app.server?.port}/api/v1`);
logger.info(`MCP:  http://localhost:${app.server?.port}/mcp`);

export type App = typeof app;
