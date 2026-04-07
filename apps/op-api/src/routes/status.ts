import { Elysia } from "elysia";
import { authPlugin } from "../auth.js";
import {
  getPlatformApps,
  getWorkloadApps,
  PLATFORM_SERVICES,
} from "../services/k8s.js";

export const statusPlugin = new Elysia({ prefix: "/status" })
  .use(authPlugin)
  .get(
    "/",
    async () => {
      const [platformApps, workloadApps] = await Promise.all([
        getPlatformApps(),
        getWorkloadApps(),
      ]);
      const svcMap = new Map(PLATFORM_SERVICES.map((s) => [s.repo, s]));
      const services = platformApps.map((a) => ({
        name: a.repo,
        namespace: a.namespace,
        ready: a.status === "running",
        replicas: { ready: a.replicas.ready, total: a.replicas.total },
        url: a.url,
        subdomain: svcMap.get(a.repo)?.subdomain || "",
      }));
      return {
        healthy: services.every((s) => s.ready),
        services,
        apps: workloadApps,
      };
    },
    {
      detail: { tags: ["Status"], summary: "Platform status" },
    },
  );
