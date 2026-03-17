import * as k8s from "@kubernetes/client-node";
import pool from "./db.js";
import type {
  AppInfo,
  ServiceStatus,
  InstanceServiceStatus,
  InstanceAppInfo,
} from "./types.js";

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

// ─── Instance-scoped K8s clients ───

const instanceClients = new Map<
  string,
  {
    appsV1: k8s.AppsV1Api;
    coreV1: k8s.CoreV1Api;
    rbacV1: k8s.RbacAuthorizationV1Api;
    kc: k8s.KubeConfig;
    cachedAt: number;
  }
>();
const CLIENT_TTL_MS = 60_000;

export async function getClientsForInstance(slug: string) {
  const cached = instanceClients.get(slug);
  if (cached && Date.now() - cached.cachedAt < CLIENT_TTL_MS) {
    return {
      appsV1: cached.appsV1,
      coreV1: cached.coreV1,
      rbacV1: cached.rbacV1,
      kc: cached.kc,
    };
  }

  const result = await pool.query(
    `SELECT kubeconfig, cluster_ip FROM instances WHERE slug = $1 AND status = 'ready'`,
    [slug],
  );
  if (result.rows.length === 0 || !result.rows[0].kubeconfig) return null;

  const instKc = new k8s.KubeConfig();
  let kubeconfigStr: string = result.rows[0].kubeconfig;
  if (result.rows[0].cluster_ip) {
    kubeconfigStr = kubeconfigStr.replace(
      /server:\s*https?:\/\/[^\s]+/,
      `server: https://${result.rows[0].cluster_ip}:443`,
    );
  }
  instKc.loadFromString(kubeconfigStr);

  const instAppsV1 = instKc.makeApiClient(k8s.AppsV1Api);
  const instCoreV1 = instKc.makeApiClient(k8s.CoreV1Api);
  const instRbacV1 = instKc.makeApiClient(k8s.RbacAuthorizationV1Api);
  instanceClients.set(slug, {
    appsV1: instAppsV1,
    coreV1: instCoreV1,
    rbacV1: instRbacV1,
    kc: instKc,
    cachedAt: Date.now(),
  });
  return {
    appsV1: instAppsV1,
    coreV1: instCoreV1,
    rbacV1: instRbacV1,
    kc: instKc,
  };
}

function countReadyPods(pods: k8s.V1Pod[]): number {
  return pods.filter((p) =>
    p.status?.conditions?.some(
      (c: k8s.V1PodCondition) => c.type === "Ready" && c.status === "True",
    ),
  ).length;
}

export async function getInstanceServiceStatuses(
  slug: string,
): Promise<InstanceServiceStatus[]> {
  const clients = await getClientsForInstance(slug);
  if (!clients) return [];

  const statuses: InstanceServiceStatus[] = [];

  for (const svc of PLATFORM_SERVICES) {
    try {
      const podList = await clients.coreV1.listNamespacedPod({
        namespace: svc.namespace,
        labelSelector: svc.labelSelector,
      });
      const pods = podList.items || [];
      const ready = countReadyPods(pods);

      statuses.push({
        name: svc.name,
        namespace: svc.namespace,
        ready: ready > 0,
        replicas: { ready, total: pods.length },
        url: svc.subdomain
          ? `https://${slug}-${svc.subdomain}.${PLATFORM_DOMAIN}`
          : "",
      });
    } catch {
      statuses.push({
        name: svc.name,
        namespace: svc.namespace,
        ready: false,
        replicas: { ready: 0, total: 0 },
        url: svc.subdomain
          ? `https://${slug}-${svc.subdomain}.${PLATFORM_DOMAIN}`
          : "",
      });
    }
  }

  return statuses;
}

export async function getInstanceApps(
  slug: string,
): Promise<InstanceAppInfo[]> {
  const clients = await getClientsForInstance(slug);
  if (!clients) return [];

  const apps: InstanceAppInfo[] = [];

  try {
    const nsList = await clients.coreV1.listNamespace({
      labelSelector:
        "open-platform.sh/tier=workload,open-platform.sh/environment=production",
    });

    for (const ns of nsList.items || []) {
      const nsName = ns.metadata?.name || "";
      const org = ns.metadata?.labels?.["open-platform.sh/org"] || "";
      const repo = ns.metadata?.labels?.["open-platform.sh/repo"] || "";

      let ready = false;
      let totalReplicas = 0;
      let readyReplicas = 0;

      try {
        const depList = await clients.appsV1.listNamespacedDeployment({
          namespace: nsName,
        });
        for (const dep of depList.items) {
          totalReplicas += dep.status?.replicas ?? 0;
          readyReplicas += dep.status?.readyReplicas ?? 0;
        }
        ready = totalReplicas > 0 && readyReplicas === totalReplicas;
      } catch {
        // namespace exists but no deployments
      }

      apps.push({
        name: repo || nsName.replace(/^op-[^-]+-/, ""),
        namespace: nsName,
        org,
        repo,
        ready,
        replicas: { ready: readyReplicas, total: totalReplicas },
        url: `https://${slug}-${repo || nsName}.${PLATFORM_DOMAIN}`,
      });
    }
  } catch {
    // namespace listing failed
  }

  return apps;
}
