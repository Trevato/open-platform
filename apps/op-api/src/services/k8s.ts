import * as k8s from "@kubernetes/client-node";
import { setHeaderOptions } from "@kubernetes/client-node";
import type { AppInfo, PreviewInfo } from "./types.js";

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const coreV1 = kc.makeApiClient(k8s.CoreV1Api);
const appsV1 = kc.makeApiClient(k8s.AppsV1Api);
const networkingV1 = kc.makeApiClient(k8s.NetworkingV1Api);

const SERVICE_PREFIX = process.env.SERVICE_PREFIX || "";
const PLATFORM_DOMAIN = process.env.PLATFORM_DOMAIN || "";

export const PLATFORM_SERVICES = [
  {
    name: "Forgejo",
    repo: "forgejo",
    namespace: "forgejo",
    labelSelector: "app.kubernetes.io/name=forgejo",
    subdomain: "forgejo",
    repoUrl: "https://codeberg.org/forgejo/forgejo",
    toggleable: false,
  },
  {
    name: "Woodpecker",
    repo: "woodpecker",
    namespace: "woodpecker",
    labelSelector: "app.kubernetes.io/name=server",
    subdomain: "ci",
    repoUrl: "https://github.com/woodpecker-ci/woodpecker",
    toggleable: false,
  },
  {
    name: "Headlamp",
    repo: "headlamp",
    namespace: "headlamp",
    labelSelector: "app.kubernetes.io/name=headlamp",
    subdomain: "headlamp",
    repoUrl: "https://github.com/headlamp-k8s/headlamp",
    toggleable: false,
  },
  {
    name: "MinIO",
    repo: "minio",
    namespace: "minio",
    labelSelector: "app=minio",
    subdomain: "minio",
    repoUrl: "https://github.com/minio/minio",
    toggleable: false,
  },
  {
    name: "PostgreSQL",
    repo: "postgres",
    namespace: "postgres",
    labelSelector: "role=primary",
    subdomain: "",
    repoUrl: "https://github.com/cloudnative-pg/cloudnative-pg",
    toggleable: false,
  },
  {
    name: "pgAdmin",
    repo: "pgadmin",
    namespace: "pgadmin",
    labelSelector: "app.kubernetes.io/name=pgadmin4",
    subdomain: "db",
    repoUrl: "https://github.com/pgadmin-org/pgadmin4",
    toggleable: true,
  },
  {
    name: "Jitsi Meet",
    repo: "jitsi",
    namespace: "jitsi",
    labelSelector: "app.kubernetes.io/name=jitsi-meet",
    subdomain: "meet",
    repoUrl: "https://github.com/jitsi/jitsi-meet",
    toggleable: true,
  },
  {
    name: "Zulip",
    repo: "zulip",
    namespace: "zulip",
    labelSelector: "app.kubernetes.io/name=zulip",
    subdomain: "chat",
    repoUrl: "https://github.com/zulip/zulip",
    toggleable: true,
  },
  {
    name: "Mailpit",
    repo: "mailpit",
    namespace: "mailpit",
    labelSelector: "app.kubernetes.io/name=mailpit",
    subdomain: "mail",
    repoUrl: "https://github.com/axllent/mailpit",
    toggleable: true,
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

export async function getPlatformApps(): Promise<AppInfo[]> {
  const apps: AppInfo[] = [];

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

      apps.push({
        name: svc.name,
        org: "system",
        repo: svc.repo,
        namespace: svc.namespace,
        tier: "platform",
        status:
          ready > 0 ? "running" : pods.length > 0 ? "degraded" : "stopped",
        replicas: { ready, desired: pods.length, total: pods.length },
        url,
        repoUrl: svc.repoUrl,
        toggleable: svc.toggleable,
      });
    } catch {
      apps.push({
        name: svc.name,
        org: "system",
        repo: svc.repo,
        namespace: svc.namespace,
        tier: "platform",
        status: "stopped",
        replicas: { ready: 0, desired: 0, total: 0 },
        url: buildServiceUrl(svc.subdomain),
        repoUrl: svc.repoUrl,
        toggleable: svc.toggleable,
      });
    }
  }

  return apps;
}

export async function getWorkloadApps(): Promise<AppInfo[]> {
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

      const repoUrl = `https://${SERVICE_PREFIX}forgejo.${PLATFORM_DOMAIN}/${org}/${repo}`;

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
          name: repo,
          org,
          repo,
          namespace,
          tier: "workload",
          status: isReady ? "running" : ready > 0 ? "degraded" : "stopped",
          replicas: { ready, desired, total: desired },
          url,
          repoUrl,
        });
      } catch {
        apps.push({
          name: repo,
          org,
          repo,
          namespace,
          tier: "workload",
          status: "stopped",
          replicas: { ready: 0, desired: 0, total: 0 },
          url: "",
          repoUrl,
        });
      }
    }
  } catch {
    // namespace listing failed
  }

  return apps;
}

export async function getAllApps(): Promise<AppInfo[]> {
  const [platform, workload] = await Promise.all([
    getPlatformApps(),
    getWorkloadApps(),
  ]);
  return [...platform, ...workload];
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
      name: repo,
      org,
      repo,
      namespace,
      tier: "workload" as const,
      status: isReady ? "running" : ready > 0 ? "degraded" : "stopped",
      replicas: { ready, desired, total: desired },
      url,
      repoUrl: `https://${SERVICE_PREFIX}forgejo.${PLATFORM_DOMAIN}/${org}/${repo}`,
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

/** Scale the first deployment in a namespace to the given replica count. */
export async function scaleDeployment(
  namespace: string,
  replicas: number,
): Promise<void> {
  const depList = await appsV1.listNamespacedDeployment({ namespace });
  const dep = depList.items?.[0];
  if (!dep?.metadata?.name) throw new Error("No deployment found");

  await appsV1.patchNamespacedDeployment(
    { namespace, name: dep.metadata.name, body: { spec: { replicas } } },
    setHeaderOptions("Content-Type", "application/merge-patch+json"),
  );
}

export async function deleteNamespace(namespace: string): Promise<void> {
  await coreV1.deleteNamespace({ name: namespace });
}

/** Run a short-lived pod, wait for completion, then delete it. */
async function runEphemeralPod(
  namespace: string,
  name: string,
  pod: k8s.V1Pod,
  timeoutMs = 60_000,
): Promise<void> {
  await coreV1.createNamespacedPod({ namespace, body: pod });

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { status } = await coreV1.readNamespacedPod({ namespace, name });
    const phase = status?.phase;
    if (phase === "Succeeded") break;
    if (phase === "Failed") {
      throw new Error(`Pod ${name} failed`);
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }

  try {
    await coreV1.deleteNamespacedPod({ namespace, name });
  } catch {
    // Best-effort cleanup
  }
}

/** Drop the database and user for an app. */
export async function dropAppDatabase(
  org: string,
  repo: string,
): Promise<void> {
  const dbName = `op_${org.replace(/-/g, "_")}_${repo.replace(/-/g, "_")}`;
  const podName = `db-cleanup-${org}-${repo}-${Date.now()}`.slice(0, 63);

  const pod: k8s.V1Pod = {
    apiVersion: "v1",
    kind: "Pod",
    metadata: { name: podName },
    spec: {
      restartPolicy: "Never",
      containers: [
        {
          name: "cleanup",
          image: "postgres:16-alpine",
          command: [
            "sh",
            "-c",
            [
              `psql -h postgres-rw.postgres.svc -U postgres -c "DROP DATABASE IF EXISTS ${dbName}"`,
              `psql -h postgres-rw.postgres.svc -U postgres -c "DROP USER IF EXISTS ${dbName}"`,
            ].join(" && "),
          ],
          env: [
            {
              name: "PGPASSWORD",
              valueFrom: {
                secretKeyRef: {
                  name: "postgres-superuser",
                  key: "password",
                },
              },
            },
          ],
        },
      ],
    },
  };

  await runEphemeralPod("postgres", podName, pod);
}

/** Delete the S3 bucket for an app. */
export async function deleteAppBucket(
  org: string,
  repo: string,
): Promise<void> {
  const bucket = `op-${org}-${repo}`;
  const podName = `s3-cleanup-${org}-${repo}-${Date.now()}`.slice(0, 63);

  const pod: k8s.V1Pod = {
    apiVersion: "v1",
    kind: "Pod",
    metadata: { name: podName },
    spec: {
      restartPolicy: "Never",
      containers: [
        {
          name: "cleanup",
          image: "minio/mc:latest",
          command: [
            "sh",
            "-c",
            `mc alias set minio http://minio.minio.svc:9000 $(cat /minio/rootUser) $(cat /minio/rootPassword) && mc rb --force minio/${bucket} || true`,
          ],
          volumeMounts: [
            { name: "minio-creds", mountPath: "/minio", readOnly: true },
          ],
        },
      ],
      volumes: [
        {
          name: "minio-creds",
          secret: { secretName: "minio-credentials" },
        },
      ],
    },
  };

  await runEphemeralPod("minio", podName, pod);
}
