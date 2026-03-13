import * as k8s from "@kubernetes/client-node";
import type { AppInfo, ServiceStatus } from "./types.js";

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const coreV1 = kc.makeApiClient(k8s.CoreV1Api);
const appsV1 = kc.makeApiClient(k8s.AppsV1Api);
const networkingV1 = kc.makeApiClient(k8s.NetworkingV1Api);

const PLATFORM_SERVICES = [
  {
    name: "forgejo",
    namespace: "forgejo",
    labelSelector: "app.kubernetes.io/name=forgejo",
  },
  {
    name: "woodpecker",
    namespace: "woodpecker",
    labelSelector: "app.kubernetes.io/name=server",
  },
  {
    name: "headlamp",
    namespace: "headlamp",
    labelSelector: "app.kubernetes.io/name=headlamp",
  },
  {
    name: "minio",
    namespace: "minio",
    labelSelector: "app=minio",
  },
  {
    name: "postgres",
    namespace: "postgres",
    labelSelector: "cnpg.io/cluster=postgres",
  },
];

/** Read the first ingress host in a namespace, or empty string. */
async function getIngressUrl(namespace: string): Promise<string> {
  try {
    const ingList = await networkingV1.listNamespacedIngress({ namespace });
    const host = ingList.items?.[0]?.spec?.rules?.[0]?.host;
    return host ? `https://${host}` : "";
  } catch {
    return "";
  }
}

export async function getServiceStatuses(): Promise<ServiceStatus[]> {
  const statuses: ServiceStatus[] = [];

  for (const svc of PLATFORM_SERVICES) {
    try {
      const [podList, url] = await Promise.all([
        coreV1.listNamespacedPod({
          namespace: svc.namespace,
          labelSelector: svc.labelSelector,
        }),
        getIngressUrl(svc.namespace),
      ]);
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
        url,
      });
    } catch {
      statuses.push({
        name: svc.name,
        namespace: svc.namespace,
        ready: false,
        replicas: { ready: 0, total: 0 },
        url: "",
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
        const [depList, url] = await Promise.all([
          appsV1.listNamespacedDeployment({ namespace }),
          getIngressUrl(namespace),
        ]);
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
          url,
        });
      } catch {
        apps.push({
          org,
          repo,
          namespace,
          status: "stopped",
          replicas: { ready: 0, desired: 0 },
          url: "",
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
    const [depList, url] = await Promise.all([
      appsV1.listNamespacedDeployment({ namespace }),
      getIngressUrl(namespace),
    ]);
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
      url,
    };
  } catch {
    return null;
  }
}
