import { Elysia, t } from "elysia";
import { authPlugin } from "../auth.js";
import { ForgejoClient } from "../services/forgejo.js";

export const orgsPlugin = new Elysia({ prefix: "/orgs" })
  .use(authPlugin)
  .get(
    "/",
    async ({ user }) => {
      const client = new ForgejoClient(user.token);
      return client.listOrgs();
    },
    {
      detail: { tags: ["Orgs"], summary: "List orgs" },
    },
  )
  .post(
    "/",
    async ({ body, user, set }) => {
      if (!user.isAdmin) {
        set.status = 403;
        return { error: "Admin access required" };
      }
      const client = new ForgejoClient(user.token);
      const org = await client.createOrg(body.name, {
        description: body.description,
      });
      set.status = 201;
      return org;
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        description: t.Optional(t.String()),
      }),
      detail: { tags: ["Orgs"], summary: "Create org (admin only)" },
    },
  );
