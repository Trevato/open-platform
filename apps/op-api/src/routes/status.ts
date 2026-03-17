import { Elysia } from "elysia";
import { authPlugin } from "../auth.js";
import { getServiceStatuses, getApps } from "../services/k8s.js";

export const statusPlugin = new Elysia({ prefix: "/status" })
  .use(authPlugin)
  .get(
    "/",
    async () => {
      const [services, apps] = await Promise.all([
        getServiceStatuses(),
        getApps(),
      ]);
      return {
        healthy: services.every((s) => s.ready),
        services,
        apps,
      };
    },
    {
      detail: { tags: ["Status"], summary: "Platform status" },
    },
  );
