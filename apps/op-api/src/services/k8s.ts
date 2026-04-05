import * as k8s from "@kubernetes/client-node";
import type { AppInfo, PreviewInfo, ServiceStatus } from "./types.js";

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const coreV1 = kc.makeApiClient(k8s.CoreV1Api);
const appsV1 = kc.makeApiClient(k8s.AppsV1Api);
const networkingV1 = kc.makeApiClient(k8s.NetworkingV1Api);

const SERVICE_PREFIX = process.env.SERVICE_PREFIX || "";
const PLATFORM_DOMAIN = process.env.PLATFORM_DOMAIN || "";

const PLATFORM_SERVICES = [
  {
    name: "forgejo",
    namespace: "forgejo",
    labelSelector: "app.kubernetes.io/name=forgejo",
    subdomain: "forgejo",
  },
  {
    name: "woodpecker",
    namespace: "woodpecker",
    labelSelector: "app.kubernetes.io/name=server",
    subdomain: "ci",
  },
  {
    name: "headlamp",
    namespace: "headlamp",
    labelSelector: "app.kubernetes.io/name=headlamp",
    subdomain: "headlamp",
  },
  {
    name: "minio",
    namespace: "minio",
    labelSelector: "app=minio",
    subdomain: "minio",
  },
  {
    name: "postgres",
    namespace: "postgres",
    labelSelector: "role=primary",
    subdomain: "",
  },
];

/** Build a service URL from domain config, falling back to ingress lookup. */
function buildServiceUrl(subdomain: string): string {
  if (PLATFORM_DOMAIN && subdomain) {
    return `https://${SERVICE_PREFIX}${subdomain}.${PLATFORM_DOMAIN}`;
  }
  return "";
}

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

/** Resolve URL for a service: prefer domain config, fall back to ingress. */
async function resolveServiceUrl(
  subdomain: string,
  namespace: string,
): Promise<string> {
  const domainUrl = buildServiceUrl(subdomain);
  if (domainUrl) return domainUrl;
  return getIngressUrl(namespace);
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
        resolveServiceUrl(svc.subdomain, svc.namespace),
      ]);
      const pods = podList.items || [];
      const ready = pods.filter((p: k8s.V1Pod) =>
        p.status?.conditions?.some(
          (c: k8s.V1PodCondition) => c.type === "Ready" && c.status === "True",
        ),
      ).length;

      statuses.push({
        name: svc.name,
        namespace: svc.namespace,
        ready: ready > 0,
        replicas: { ready, total: pods.length },
        url,
        subdomain: svc.subdomain,
      });
    } catch {
      statuses.push({
        name: svc.name,
        namespace: svc.namespace,
        ready: false,
        replicas: { ready: 0, total: 0 },
        url: buildServiceUrl(svc.subdomain),
        subdomain: svc.subdomain,
      });
    }
  }

  return statuses;
}

export async function getApps(): Promise<AppInfo[]> {
  const apps: AppInfo[] = [];

  try {
    const nsList = await coreV1.listNamespace({
      labelSelector: "open-platform.sh/tier=workload,!open-platform.sh/pr",
    });

    // Infrastructure repos that should never appear in the apps list
    const INFRA_REPOS = new Set([
      "console",
      "op-api",
      "open-platform",
      "template",
    ]);

    for (const ns of nsList.items || []) {
      const org = ns.metadata?.labels?.["open-platform.sh/org"] || "";
      const repo = ns.metadata?.labels?.["open-platform.sh/repo"] || "";
      const namespace = ns.metadata?.name || "";

      if (INFRA_REPOS.has(repo)) continue;

      try {
        const [depList, url] = await Promise.all([
          appsV1.listNamespacedDeployment({ namespace }),
          getIngressUrl(namespace),
        ]);
        const dep = depList.items?.[0];
        const ready = dep?.status?.readyReplicas || 0;
        const desired = dep?.spec?.replicas || 0;

        const isReady = ready >= desired && desired > 0;
        apps.push({
          org,
          repo,
          namespace,
          ready: isReady,
          status: isReady ? "running" : ready > 0 ? "degraded" : "stopped",
          replicas: { ready, desired, total: desired },
          url,
        });
      } catch {
        apps.push({
          org,
          repo,
          namespace,
          ready: false,
          status: "stopped",
          replicas: { ready: 0, desired: 0, total: 0 },
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

    const isReady = ready >= desired && desired > 0;
    return {
      org,
      repo,
      namespace,
      ready: isReady,
      status: isReady ? "running" : ready > 0 ? "degraded" : "stopped",
      replicas: { ready, desired, total: desired },
      url,
    };
  } catch {
    return null;
  }
}

export async function getPreviewStatus(
  org: string,
  repo: string,
  pr: number,
): Promise<PreviewInfo | null> {
  const namespace = `op-${org}-${repo}-pr-${pr}`;
  try {
    const [depList, url] = await Promise.all([
      appsV1.listNamespacedDeployment({ namespace }),
      getIngressUrl(namespace),
    ]);
    const dep = depList.items?.[0];
    if (!dep) return null;

    const ready = dep.status?.readyReplicas || 0;
    const desired = dep.spec?.replicas || 0;
    const isReady = ready >= desired && desired > 0;

    return {
      org,
      repo,
      pr,
      namespace,
      ready: isReady,
      status: isReady ? "running" : ready > 0 ? "degraded" : "stopped",
      replicas: { ready, desired, total: desired },
      url: url || `https://pr-${pr}-${repo}.${PLATFORM_DOMAIN}`,
    };
  } catch {
    return null;
  }
}

export async function listPreviews(
  org: string,
  repo: string,
): Promise<PreviewInfo[]> {
  const previews: PreviewInfo[] = [];

  try {
    const nsList = await coreV1.listNamespace({
      labelSelector: `open-platform.sh/tier=workload,open-platform.sh/org=${org},open-platform.sh/repo=${repo},open-platform.sh/pr`,
    });

    for (const ns of nsList.items || []) {
      const namespace = ns.metadata?.name || "";
      const prLabel = ns.metadata?.labels?.["open-platform.sh/pr"];
      const pr = prLabel ? parseInt(prLabel, 10) : 0;
      if (!pr) continue;

      try {
        const [depList, url] = await Promise.all([
          appsV1.listNamespacedDeployment({ namespace }),
          getIngressUrl(namespace),
        ]);
        const dep = depList.items?.[0];
        const ready = dep?.status?.readyReplicas || 0;
        const desired = dep?.spec?.replicas || 0;
        const isReady = ready >= desired && desired > 0;

        previews.push({
          org,
          repo,
          pr,
          namespace,
          ready: isReady,
          status: isReady ? "running" : ready > 0 ? "degraded" : "stopped",
          replicas: { ready, desired, total: desired },
          url: url || `https://pr-${pr}-${repo}.${PLATFORM_DOMAIN}`,
        });
      } catch {
        previews.push({
          org,
          repo,
          pr,
          namespace,
          ready: false,
          status: "stopped",
          replicas: { ready: 0, desired: 0, total: 0 },
          url: `https://pr-${pr}-${repo}.${PLATFORM_DOMAIN}`,
        });
      }
    }
  } catch {
    // namespace listing failed
  }

  return previews;
}

export async function deleteNamespace(namespace: string): Promise<void> {
  await coreV1.deleteNamespace({ name: namespace });
}
