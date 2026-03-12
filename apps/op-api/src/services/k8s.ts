import * as k8s from "@kubernetes/client-node";
import type { AppInfo, ServiceStatus } from "./types.js";

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const coreV1 = kc.makeApiClient(k8s.CoreV1Api);
const appsV1 = kc.makeApiClient(k8s.AppsV1Api);

const PLATFORM_DOMAIN = process.env.PLATFORM_DOMAIN || "";
const SERVICE_PREFIX = process.env.SERVICE_PREFIX || "";

const PLATFORM_SERVICES = [
  {
    name: "forgejo",
    namespace: "forgejo",
    labelSelector: "app.kubernetes.io/name=forgejo",
    url: `https://${SERVICE_PREFIX}forgejo.${PLATFORM_DOMAIN}`,
  },
  {
    name: "woodpecker",
    namespace: "woodpecker",
    labelSelector: "app.kubernetes.io/name=server",
    url: `https://${SERVICE_PREFIX}ci.${PLATFORM_DOMAIN}`,
  },
  {
    name: "headlamp",
    namespace: "headlamp",
    labelSelector: "app.kubernetes.io/name=headlamp",
    url: `https://${SERVICE_PREFIX}headlamp.${PLATFORM_DOMAIN}`,
  },
  {
    name: "minio",
    namespace: "minio",
    labelSelector: "app=minio",
    url: `https://${SERVICE_PREFIX}minio.${PLATFORM_DOMAIN}`,
  },
  {
    name: "postgres",
    namespace: "postgres",
    labelSelector: "cnpg.io/cluster=postgres",
    url: "",
  },
];

export async function getServiceStatuses(): Promise<ServiceStatus[]> {
  const statuses: ServiceStatus[] = [];

  for (const svc of PLATFORM_SERVICES) {
    try {
      const podList = await coreV1.listNamespacedPod({
        namespace: svc.namespace,
        labelSelector: svc.labelSelector,
      });
      const pods = podList.items || [];
      const ready = pods.filter((p: k8s.V1Pod) =>
        p.status?.conditions?.some(
          (c: k8s.V1PodCondition) =>
            c.type === "Ready" && c.status === "True",
        ),
      ).length;

      statuses.push({
        name: svc.name,
        namespace: svc.namespace,
        ready: ready > 0,
        replicas: { ready, total: pods.length },
        url: svc.url,
      });
    } catch {
      statuses.push({
        name: svc.name,
        namespace: svc.namespace,
        ready: false,
        replicas: { ready: 0, total: 0 },
        url: svc.url,
      });
    }
  }

  return statuses;
}

export async function getApps(): Promise<AppInfo[]> {
  const apps: AppInfo[] = [];

  try {
    const nsList = await coreV1.listNamespace({
      labelSelector: "open-platform.sh/tier=workload",
    });

    for (const ns of nsList.items || []) {
      const org = ns.metadata?.labels?.["open-platform.sh/org"] || "";
      const repo = ns.metadata?.labels?.["open-platform.sh/repo"] || "";
      const namespace = ns.metadata?.name || "";

      try {
        const depList = await appsV1.listNamespacedDeployment({
          namespace,
        });
        const dep = depList.items?.[0];
        const ready = dep?.status?.readyReplicas || 0;
        const desired = dep?.spec?.replicas || 0;

        apps.push({
          org,
          repo,
          namespace,
          status:
            ready >= desired && desired > 0
              ? "running"
              : ready > 0
                ? "degraded"
                : "stopped",
          replicas: { ready, desired },
          url: `https://${SERVICE_PREFIX}${repo}.${PLATFORM_DOMAIN}`,
        });
      } catch {
        apps.push({
          org,
          repo,
          namespace,
          status: "stopped",
          replicas: { ready: 0, desired: 0 },
          url: `https://${SERVICE_PREFIX}${repo}.${PLATFORM_DOMAIN}`,
        });
      }
    }
  } catch {
    // namespace listing failed
  }

  return apps;
}

export async function getAppStatus(
  org: string,
  repo: string,
): Promise<AppInfo | null> {
  const namespace = `op-${org}-${repo}`;
  try {
    const depList = await appsV1.listNamespacedDeployment({
      namespace,
    });
    const dep = depList.items?.[0];
    if (!dep) return null;

    const ready = dep.status?.readyReplicas || 0;
    const desired = dep.spec?.replicas || 0;

    return {
      org,
      repo,
      namespace,
      status:
        ready >= desired && desired > 0
          ? "running"
          : ready > 0
            ? "degraded"
            : "stopped",
      replicas: { ready, desired },
      url: `https://${SERVICE_PREFIX}${repo}.${PLATFORM_DOMAIN}`,
    };
  } catch {
    return null;
  }
}
