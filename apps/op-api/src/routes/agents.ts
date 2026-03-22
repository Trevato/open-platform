import { Elysia, t } from "elysia";
import { requireAdminPlugin } from "../auth.js";
import {
  createAgent,
  listAgents,
  getAgent,
  updateAgent,
  deleteAgent,
  activateAgent,
  type Agent,
} from "../services/agent.js";

// ─── Helpers ───

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Strip forgejo_token from agent before returning to clients. */
function stripToken(agent: Agent): Omit<Agent, "forgejo_token"> {
  const { forgejo_token: _, ...rest } = agent;
  return rest;
}

// ─── Routes ───

export const agentRoutes = new Elysia({ prefix: "/agents" })
  .use(requireAdminPlugin)

  // GET / — list agents
  .get(
    "/",
    async ({ user, query }) => {
      const all = query.all === "true";
      const agents = await listAgents(String(user.id), all);
      return { agents: agents.map(stripToken) };
    },
    {
      query: t.Object({
        all: t.Optional(t.String()),
      }),
      detail: { tags: ["Agents"], summary: "List agents" },
    },
  )

  // POST / — create agent
  .post(
    "/",
    async ({ body, user, set }) => {
      const slug = slugify(body.name);
      if (!slug) {
        set.status = 400;
        return {
          error: "Name must produce a valid slug (alphanumeric + hyphens)",
        };
      }

      // Check uniqueness
      const existing = await getAgent(slug);
      if (existing) {
        set.status = 409;
        return { error: `Agent with slug "${slug}" already exists` };
      }

      try {
        const agent = await createAgent(user, {
          name: body.name,
          slug,
          description: body.description,
          model: body.model,
          instructions: body.instructions,
          allowed_tools: body.allowed_tools,
          orgs: body.orgs,
          schedule: body.schedule,
          max_steps: body.max_steps,
        });

        set.status = 201;
        return { agent: stripToken(agent) };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        set.status = 500;
        return { error: message };
      }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        description: t.Optional(t.String()),
        model: t.Optional(t.String()),
        instructions: t.Optional(t.String()),
        allowed_tools: t.Optional(t.Array(t.String())),
        orgs: t.Optional(t.Array(t.String())),
        schedule: t.Optional(t.String()),
        max_steps: t.Optional(t.Number({ minimum: 1, maximum: 500 })),
      }),
      detail: { tags: ["Agents"], summary: "Create agent" },
    },
  )

  // GET /:slug — get agent
  .get(
    "/:slug",
    async ({ params: { slug }, query, set }) => {
      const agent = await getAgent(slug);
      if (!agent) {
        set.status = 404;
        return { error: "Agent not found" };
      }
      // Internal calls (e.g., chat endpoint) need the token
      if (query.internal === "true") {
        return { agent };
      }
      return { agent: stripToken(agent) };
    },
    {
      query: t.Object({
        internal: t.Optional(t.String()),
      }),
      detail: { tags: ["Agents"], summary: "Get agent by slug" },
    },
  )

  // PATCH /:slug — update agent
  .patch(
    "/:slug",
    async ({ params: { slug }, body, set }) => {
      const agent = await getAgent(slug);
      if (!agent) {
        set.status = 404;
        return { error: "Agent not found" };
      }

      try {
        const updated = await updateAgent(slug, body);
        if (!updated) {
          set.status = 404;
          return { error: "Agent not found" };
        }
        return { agent: stripToken(updated) };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        set.status = 500;
        return { error: message };
      }
    },
    {
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1 })),
        description: t.Optional(t.String()),
        model: t.Optional(t.String()),
        instructions: t.Optional(t.String()),
        allowed_tools: t.Optional(t.Array(t.String())),
        orgs: t.Optional(t.Array(t.String())),
        schedule: t.Optional(t.String()),
        max_steps: t.Optional(t.Number({ minimum: 1, maximum: 500 })),
      }),
      detail: { tags: ["Agents"], summary: "Update agent" },
    },
  )

  // DELETE /:slug — delete agent
  .delete(
    "/:slug",
    async ({ params: { slug }, set }) => {
      const deleted = await deleteAgent(slug);
      if (!deleted) {
        set.status = 404;
        return { error: "Agent not found" };
      }
      set.status = 204;
    },
    {
      detail: { tags: ["Agents"], summary: "Delete agent" },
    },
  )

  // POST /:slug/activate — manual trigger
  .post(
    "/:slug/activate",
    async ({ params: { slug }, body, set }) => {
      const agent = await activateAgent(slug, body.prompt, body.context);
      if (!agent) {
        set.status = 404;
        return { error: "Agent not found" };
      }
      return { agent: stripToken(agent) };
    },
    {
      body: t.Object({
        prompt: t.String({ minLength: 1 }),
        context: t.Optional(t.Record(t.String(), t.Any())),
      }),
      detail: { tags: ["Agents"], summary: "Activate agent with prompt" },
    },
  );
