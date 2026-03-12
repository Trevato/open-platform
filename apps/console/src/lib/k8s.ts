import * as k8s from "@kubernetes/client-node";
import pool from "@/lib/db";

let appsV1: k8s.AppsV1Api | null = null;
let coreV1: k8s.CoreV1Api | null = null;

function getClients() {
  if (!appsV1 || !coreV1) {
    const kc = new k8s.KubeConfig();
    kc.loadFromCluster();
    appsV1 = kc.makeApiClient(k8s.AppsV1Api);
    coreV1 = kc.makeApiClient(k8s.CoreV1Api);
  }
  return { appsV1, coreV1 };
}

export interface ServiceStatus {
  name: string;
  namespace: string;
  ready: boolean;
  replicas: number;
  readyReplicas: number;
  url: string;
}

const PLATFORM_SERVICES = [
  { name: "Forgejo", namespace: "forgejo", label: "app.kubernetes.io/name=forgejo", subdomain: "forgejo" },
  { name: "Woodpecker", namespace: "woodpecker", label: "app.kubernetes.io/name=server", subdomain: "ci" },
  { name: "Headlamp", namespace: "headlamp", label: "app.kubernetes.io/name=headlamp", subdomain: "headlamp" },
  { name: "MinIO", namespace: "minio", label: "app=minio", subdomain: "minio" },
];

export async function getServiceStatuses(): Promise<ServiceStatus[]> {
  const { coreV1 } = getClients();
  const domain = process.env.PLATFORM_DOMAIN;
  if (!domain) throw new Error("PLATFORM_DOMAIN not set");
  const prefix = process.env.SERVICE_PREFIX || "";

  const statuses: ServiceStatus[] = [];

  for (const svc of PLATFORM_SERVICES) {
    try {
      const pods = await coreV1!.listNamespacedPod({
        namespace: svc.namespace,
        labelSelector: svc.label,
      });
      const total = pods.items.length;
      const ready = pods.items.filter((p) =>
        p.status?.conditions?.some(
          (c) => c.type === "Ready" && c.status === "True"
        )
      ).length;

      statuses.push({
        name: svc.name,
        namespace: svc.namespace,
        ready: ready > 0,
        replicas: total,
        readyReplicas: ready,
        url: `https://${prefix}${svc.subdomain}.${domain}`,
      });
    } catch {
      statuses.push({
        name: svc.name,
        namespace: svc.namespace,
        ready: false,
        replicas: 0,
        readyReplicas: 0,
        url: `https://${prefix}${svc.subdomain}.${domain}`,
      });
    }
  }

  // PostgreSQL (CNPG) — check for primary pod
  try {
    const pods = await coreV1!.listNamespacedPod({
      namespace: "postgres",
      labelSelector: "role=primary",
    });
    const ready = pods.items.filter((p) =>
      p.status?.conditions?.some(
        (c) => c.type === "Ready" && c.status === "True"
      )
    ).length;

    statuses.push({
      name: "PostgreSQL",
      namespace: "postgres",
      ready: ready > 0,
      replicas: pods.items.length,
      readyReplicas: ready,
      url: "postgres-rw.postgres.svc.cluster.local:5432",
    });
  } catch {
    statuses.push({
      name: "PostgreSQL",
      namespace: "postgres",
      ready: false,
      replicas: 0,
      readyReplicas: 0,
      url: "postgres-rw.postgres.svc.cluster.local:5432",
    });
  }

  return statuses;
}

export interface AppInfo {
  name: string;
  namespace: string;
  org: string;
  repo: string;
  ready: boolean;
  replicas: number;
  readyReplicas: number;
  url: string;
  createdAt: string | null;
}

export async function getApps(): Promise<AppInfo[]> {
  const { coreV1, appsV1 } = getClients();
  const domain = process.env.PLATFORM_DOMAIN;
  if (!domain) throw new Error("PLATFORM_DOMAIN not set");
  const prefix = process.env.SERVICE_PREFIX || "";

  const namespaces = await coreV1!.listNamespace({
    labelSelector: "open-platform.sh/tier=workload,open-platform.sh/environment=production",
  });

  const apps: AppInfo[] = [];

  for (const ns of namespaces.items) {
    const nsName = ns.metadata?.name || "";
    const org = ns.metadata?.labels?.["open-platform.sh/org"] || "";
    const repo = ns.metadata?.labels?.["open-platform.sh/repo"] || "";

    let ready = false;
    let replicas = 0;
    let readyReplicas = 0;

    try {
      const deployments = await appsV1!.listNamespacedDeployment({
        namespace: nsName,
      });
      for (const dep of deployments.items) {
        replicas += dep.status?.replicas ?? 0;
        readyReplicas += dep.status?.readyReplicas ?? 0;
      }
      ready = replicas > 0 && readyReplicas === replicas;
    } catch {
      // Namespace exists but no deployments
    }

    apps.push({
      name: repo || nsName.replace(/^op-[^-]+-/, ""),
      namespace: nsName,
      org,
      repo,
      ready,
      replicas,
      readyReplicas,
      url: `https://${prefix}${repo || nsName}.${domain}`,
      createdAt: ns.metadata?.creationTimestamp?.toISOString() || null,
    });
  }

  return apps;
}

// ─── Instance-scoped k8s clients ───

const instanceClients = new Map<
  string,
  { appsV1: k8s.AppsV1Api; coreV1: k8s.CoreV1Api; cachedAt: number }
>();
const CLIENT_TTL_MS = 60_000;

export async function getClientsForInstance(slug: string) {
  const cached = instanceClients.get(slug);
  if (cached && Date.now() - cached.cachedAt < CLIENT_TTL_MS) {
    return { appsV1: cached.appsV1, coreV1: cached.coreV1 };
  }

  const result = await pool.query(
    `SELECT kubeconfig, cluster_ip FROM instances WHERE slug = $1 AND status = 'ready'`,
    [slug]
  );
  if (result.rows.length === 0 || !result.rows[0].kubeconfig) return null;

  const kc = new k8s.KubeConfig();
  let kubeconfigStr = result.rows[0].kubeconfig;
  if (result.rows[0].cluster_ip) {
    kubeconfigStr = kubeconfigStr.replace(
      /server:\s*https?:\/\/[^\s]+/,
      `server: https://${result.rows[0].cluster_ip}:443`
    );
  }
  kc.loadFromString(kubeconfigStr);

  const appsV1 = kc.makeApiClient(k8s.AppsV1Api);
  const coreV1 = kc.makeApiClient(k8s.CoreV1Api);
  instanceClients.set(slug, { appsV1, coreV1, cachedAt: Date.now() });
  return { appsV1, coreV1 };
}

export async function getInstanceServiceStatuses(
  slug: string
): Promise<ServiceStatus[]> {
  const clients = await getClientsForInstance(slug);
  if (!clients) return [];
  const { coreV1 } = clients;
  const domain = process.env.MANAGED_DOMAIN || "open-platform.sh";
  const statuses: ServiceStatus[] = [];

  for (const svc of PLATFORM_SERVICES) {
    try {
      const pods = await coreV1.listNamespacedPod({
        namespace: svc.namespace,
        labelSelector: svc.label,
      });
      const total = pods.items.length;
      const ready = pods.items.filter((p) =>
        p.status?.conditions?.some(
          (c) => c.type === "Ready" && c.status === "True"
        )
      ).length;
      statuses.push({
        name: svc.name,
        namespace: svc.namespace,
        ready: ready > 0,
        replicas: total,
        readyReplicas: ready,
        url: `https://${slug}-${svc.subdomain}.${domain}`,
      });
    } catch {
      statuses.push({
        name: svc.name,
        namespace: svc.namespace,
        ready: false,
        replicas: 0,
        readyReplicas: 0,
        url: `https://${slug}-${svc.subdomain}.${domain}`,
      });
    }
  }

  // PostgreSQL
  try {
    const pods = await coreV1.listNamespacedPod({
      namespace: "postgres",
      labelSelector: "role=primary",
    });
    const ready = pods.items.filter((p) =>
      p.status?.conditions?.some(
        (c) => c.type === "Ready" && c.status === "True"
      )
    ).length;
    statuses.push({
      name: "PostgreSQL",
      namespace: "postgres",
      ready: ready > 0,
      replicas: pods.items.length,
      readyReplicas: ready,
      url: "postgres-rw.postgres.svc.cluster.local:5432",
    });
  } catch {
    statuses.push({
      name: "PostgreSQL",
      namespace: "postgres",
      ready: false,
      replicas: 0,
      readyReplicas: 0,
      url: "postgres-rw.postgres.svc.cluster.local:5432",
    });
  }

  return statuses;
}

export async function getInstanceApps(slug: string): Promise<AppInfo[]> {
  const clients = await getClientsForInstance(slug);
  if (!clients) return [];
  const { coreV1, appsV1 } = clients;
  const domain = process.env.MANAGED_DOMAIN || "open-platform.sh";

  const namespaces = await coreV1.listNamespace({
    labelSelector:
      "open-platform.sh/tier=workload,open-platform.sh/environment=production",
  });

  const apps: AppInfo[] = [];
  for (const ns of namespaces.items) {
    const nsName = ns.metadata?.name || "";
    const org = ns.metadata?.labels?.["open-platform.sh/org"] || "";
    const repo = ns.metadata?.labels?.["open-platform.sh/repo"] || "";
    let ready = false,
      replicas = 0,
      readyReplicas = 0;
    try {
      const deployments = await appsV1.listNamespacedDeployment({
        namespace: nsName,
      });
      for (const dep of deployments.items) {
        replicas += dep.status?.replicas ?? 0;
        readyReplicas += dep.status?.readyReplicas ?? 0;
      }
      ready = replicas > 0 && readyReplicas === replicas;
    } catch {
      // Namespace exists but no deployments
    }
    apps.push({
      name: repo || nsName.replace(/^op-[^-]+-/, ""),
      namespace: nsName,
      org,
      repo,
      ready,
      replicas,
      readyReplicas,
      url: `https://${slug}-${repo || nsName}.${domain}`,
      createdAt: ns.metadata?.creationTimestamp?.toISOString() || null,
    });
  }
  return apps;
}
