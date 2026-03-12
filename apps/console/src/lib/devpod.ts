import * as k8s from "@kubernetes/client-node";
import { setHeaderOptions } from "@kubernetes/client-node";
import { getClientsForInstance } from "@/lib/k8s";

const MERGE_PATCH = setHeaderOptions(
  "Content-Type",
  "application/strategic-merge-patch+json"
);

const NAMESPACE = "op-dev-pods";
const DEVPOD_IMAGE =
  process.env.DEVPOD_IMAGE || "system/devpod:latest";
const REGISTRY_HOST =
  process.env.REGISTRY_HOST ||
  `${process.env.SERVICE_PREFIX || ""}forgejo.${process.env.PLATFORM_DOMAIN}`;

let appsV1: k8s.AppsV1Api | null = null;
let coreV1: k8s.CoreV1Api | null = null;

function getClients() {
  if (!appsV1 || !coreV1) {
    const kc = new k8s.KubeConfig();
    kc.loadFromCluster();
    appsV1 = kc.makeApiClient(k8s.AppsV1Api);
    coreV1 = kc.makeApiClient(k8s.CoreV1Api);
  }
  return { appsV1: appsV1!, coreV1: coreV1! };
}

export interface DevPodSpec {
  username: string;
  email: string;
  fullName: string;
  forgejoToken: string;
  forgejoUrl: string;
  cpuLimit?: string;
  memoryLimit?: string;
  storageSize?: string;
}

function podName(username: string) {
  return `devpod-${username}`;
}

function pvcName(username: string) {
  return `devpod-${username}-home`;
}

function secretName(username: string) {
  return `devpod-${username}-credentials`;
}

const labels = (username: string) => ({
  "open-platform.sh/devpod": "true",
  "open-platform.sh/user": username,
  app: `devpod-${username}`,
});

/**
 * Create PVC + Secret + Deployment for a dev pod.
 */
export async function createDevPod(spec: DevPodSpec): Promise<void> {
  const { appsV1, coreV1 } = getClients();
  const name = podName(spec.username);
  const pvc = pvcName(spec.username);
  const secret = secretName(spec.username);
  const l = labels(spec.username);
  const domain = process.env.PLATFORM_DOMAIN || "";
  const prefix = process.env.SERVICE_PREFIX || "";

  // 1. Create PVC
  try {
    await coreV1.readNamespacedPersistentVolumeClaim({
      name: pvc,
      namespace: NAMESPACE,
    });
  } catch {
    await coreV1.createNamespacedPersistentVolumeClaim({
      namespace: NAMESPACE,
      body: {
        metadata: { name: pvc, namespace: NAMESPACE, labels: l },
        spec: {
          accessModes: ["ReadWriteOnce"],
          resources: {
            requests: { storage: spec.storageSize || "20Gi" },
          },
        },
      },
    });
  }

  // 2. Create credentials secret
  try {
    await coreV1.deleteNamespacedSecret({ name: secret, namespace: NAMESPACE });
  } catch {
    // doesn't exist yet
  }

  await coreV1.createNamespacedSecret({
    namespace: NAMESPACE,
    body: {
      metadata: { name: secret, namespace: NAMESPACE, labels: l },
      type: "Opaque",
      stringData: {
        username: spec.username,
        email: spec.email,
        full_name: spec.fullName,
        token: spec.forgejoToken,
        forgejo_url: spec.forgejoUrl,
      },
    },
  });

  // 3. Create Deployment
  const cpuLimit = spec.cpuLimit || "2000m";
  const memoryLimit = spec.memoryLimit || "4Gi";

  await appsV1.createNamespacedDeployment({
    namespace: NAMESPACE,
    body: {
      metadata: { name, namespace: NAMESPACE, labels: l },
      spec: {
        replicas: 1,
        selector: { matchLabels: { app: name } },
        template: {
          metadata: { labels: l },
          spec: {
            serviceAccountName: "devpod-sa",
            imagePullSecrets: [{ name: "forgejo-registry" }],
            terminationGracePeriodSeconds: 10,
            containers: [
              {
                name: "dev",
                image: `${REGISTRY_HOST}/${DEVPOD_IMAGE}`,
                tty: true,
                stdin: true,
                env: [
                  {
                    name: "FORGEJO_USERNAME",
                    valueFrom: {
                      secretKeyRef: { name: secret, key: "username" },
                    },
                  },
                  {
                    name: "FORGEJO_EMAIL",
                    valueFrom: {
                      secretKeyRef: { name: secret, key: "email" },
                    },
                  },
                  {
                    name: "FORGEJO_FULL_NAME",
                    valueFrom: {
                      secretKeyRef: { name: secret, key: "full_name" },
                    },
                  },
                  {
                    name: "FORGEJO_TOKEN",
                    valueFrom: {
                      secretKeyRef: { name: secret, key: "token" },
                    },
                  },
                  {
                    name: "FORGEJO_URL",
                    valueFrom: {
                      secretKeyRef: { name: secret, key: "forgejo_url" },
                    },
                  },
                  {
                    name: "DOCKER_HOST",
                    value: "tcp://localhost:2376",
                  },
                  {
                    name: "DOCKER_TLS_VERIFY",
                    value: "1",
                  },
                  {
                    name: "DOCKER_CERT_PATH",
                    value: "/certs/client",
                  },
                  {
                    name: "OP_API_URL",
                    value: `http://op-api.op-system-op-api.svc:80`,
                  },
                ],
                volumeMounts: [
                  { name: "home", mountPath: "/home/dev" },
                  {
                    name: "docker-certs",
                    mountPath: "/certs/client",
                    readOnly: true,
                  },
                  {
                    name: "platform-ca",
                    mountPath: "/etc/ssl/custom",
                    readOnly: true,
                  },
                ],
                resources: {
                  requests: { cpu: "500m", memory: "1Gi" },
                  limits: { cpu: cpuLimit, memory: memoryLimit },
                },
              },
              {
                name: "dind",
                image: "docker:dind",
                securityContext: { privileged: true },
                env: [{ name: "DOCKER_TLS_CERTDIR", value: "/certs" }],
                volumeMounts: [
                  { name: "docker-certs", mountPath: "/certs" },
                  { name: "dind-storage", mountPath: "/var/lib/docker" },
                ],
                resources: {
                  requests: { cpu: "250m", memory: "512Mi" },
                  limits: { cpu: "1000m", memory: "2Gi" },
                },
              },
            ],
            volumes: [
              {
                name: "home",
                persistentVolumeClaim: { claimName: pvc },
              },
              { name: "docker-certs", emptyDir: {} },
              { name: "dind-storage", emptyDir: {} },
              {
                name: "platform-ca",
                configMap: { name: "platform-ca", optional: true },
              },
            ],
          },
        },
      },
    },
  });
}

/**
 * Start a stopped dev pod (scale replicas 0 → 1).
 */
export async function startDevPod(username: string): Promise<void> {
  const { appsV1 } = getClients();
  const name = podName(username);

  await appsV1.patchNamespacedDeployment({
    name,
    namespace: NAMESPACE,
    body: { spec: { replicas: 1 } },
  }, MERGE_PATCH);
}

/**
 * Stop a running dev pod (scale replicas 1 → 0).
 */
export async function stopDevPod(username: string): Promise<void> {
  const { appsV1 } = getClients();
  const name = podName(username);

  await appsV1.patchNamespacedDeployment({
    name,
    namespace: NAMESPACE,
    body: { spec: { replicas: 0 } },
  }, MERGE_PATCH);
}

/**
 * Delete a dev pod and all its resources (Deployment + PVC + Secret).
 */
export async function deleteDevPod(username: string): Promise<void> {
  const { appsV1, coreV1 } = getClients();
  const name = podName(username);
  const pvc = pvcName(username);
  const secret = secretName(username);

  // Delete in order: deployment first (stops pod), then PVC, then secret
  try {
    await appsV1.deleteNamespacedDeployment({ name, namespace: NAMESPACE });
  } catch {
    // may not exist
  }

  try {
    await coreV1.deleteNamespacedPersistentVolumeClaim({
      name: pvc,
      namespace: NAMESPACE,
    });
  } catch {
    // may not exist
  }

  try {
    await coreV1.deleteNamespacedSecret({ name: secret, namespace: NAMESPACE });
  } catch {
    // may not exist
  }
}

/**
 * Get the running pod name for a dev pod deployment.
 * Returns null if no ready pod exists.
 */
export async function getDevPodPodName(
  username: string
): Promise<string | null> {
  const { coreV1 } = getClients();

  try {
    const pods = await coreV1.listNamespacedPod({
      namespace: NAMESPACE,
      labelSelector: `app=devpod-${username}`,
    });

    for (const pod of pods.items) {
      const ready = pod.status?.conditions?.some(
        (c) => c.type === "Ready" && c.status === "True"
      );
      if (ready && pod.metadata?.name) {
        return pod.metadata.name;
      }
    }

    // Fall back to any running pod
    for (const pod of pods.items) {
      if (
        pod.status?.phase === "Running" &&
        pod.metadata?.name
      ) {
        return pod.metadata.name;
      }
    }
  } catch {
    // listing failed
  }

  return null;
}

/**
 * Check if a dev pod deployment exists and get its replica count.
 */
export async function getDevPodStatus(
  username: string
): Promise<{ exists: boolean; replicas: number; readyReplicas: number }> {
  const { appsV1 } = getClients();
  const name = podName(username);

  try {
    const dep = await appsV1.readNamespacedDeployment({
      name,
      namespace: NAMESPACE,
    });

    return {
      exists: true,
      replicas: dep.spec?.replicas ?? 0,
      readyReplicas: dep.status?.readyReplicas ?? 0,
    };
  } catch {
    return { exists: false, replicas: 0, readyReplicas: 0 };
  }
}

// ─── Instance-scoped dev pod operations ───

async function ensureNamespace(
  coreV1: k8s.CoreV1Api,
  namespace: string
): Promise<void> {
  try {
    await coreV1.readNamespace({ name: namespace });
  } catch {
    await coreV1.createNamespace({
      body: {
        metadata: { name: namespace },
      },
    });
  }
}

/**
 * Ensure forgejo-registry imagePullSecret exists in the target namespace.
 * Uses HOST Forgejo credentials so instance vClusters can pull the devpod image.
 */
async function ensureRegistrySecret(
  coreV1: k8s.CoreV1Api,
  namespace: string
): Promise<void> {
  const secretName = "forgejo-registry";
  try {
    await coreV1.readNamespacedSecret({ name: secretName, namespace });
    return; // already exists
  } catch {
    // create it
  }

  const registryHost = REGISTRY_HOST;
  const username = process.env.FORGEJO_ADMIN_USER || "";
  const password = process.env.FORGEJO_ADMIN_PASSWORD || "";
  const auth = Buffer.from(`${username}:${password}`).toString("base64");
  const dockerConfigJson = JSON.stringify({
    auths: {
      [registryHost]: { auth },
    },
  });

  await coreV1.createNamespacedSecret({
    namespace,
    body: {
      metadata: { name: secretName, namespace },
      type: "kubernetes.io/dockerconfigjson",
      stringData: { ".dockerconfigjson": dockerConfigJson },
    },
  });
}

async function getInstanceClients(slug: string) {
  const clients = await getClientsForInstance(slug);
  if (!clients) throw new Error(`Instance "${slug}" not found or not ready`);
  return clients;
}

/**
 * Get Forgejo admin credentials for an instance's vCluster.
 * Reads the forgejo-admin-credentials secret from the forgejo namespace.
 */
async function getInstanceForgejoCredentials(
  coreV1: k8s.CoreV1Api,
  slug: string
): Promise<{ username: string; password: string; url: string } | null> {
  const domain = process.env.PLATFORM_DOMAIN || "open-platform.sh";
  try {
    const secret = await coreV1.readNamespacedSecret({
      name: "forgejo-admin-credentials",
      namespace: "forgejo",
    });
    const username = Buffer.from(
      secret.data?.["username"] || "",
      "base64"
    ).toString();
    const password = Buffer.from(
      secret.data?.["password"] || "",
      "base64"
    ).toString();
    return {
      username,
      password,
      url: `https://${slug}-forgejo.${domain}`,
    };
  } catch {
    return null;
  }
}

/**
 * Create a Forgejo PAT on an instance's Forgejo for git access.
 */
async function createInstanceForgejoToken(
  forgejoUrl: string,
  adminUser: string,
  adminPass: string,
  targetUser: string,
  tokenName: string
): Promise<string> {
  const authHeader = `Basic ${Buffer.from(`${adminUser}:${adminPass}`).toString("base64")}`;
  const headers = { Authorization: authHeader, "Content-Type": "application/json" };

  // The target user might not exist in the instance Forgejo — use admin user instead
  const user = targetUser || adminUser;

  // Delete existing token with same name
  try {
    const listRes = await fetch(
      `${forgejoUrl}/api/v1/users/${encodeURIComponent(user)}/tokens`,
      { headers, cache: "no-store" }
    );
    if (listRes.ok) {
      const tokens = await listRes.json();
      const existing = tokens.find((t: { name: string; id: number }) => t.name === tokenName);
      if (existing) {
        await fetch(
          `${forgejoUrl}/api/v1/users/${encodeURIComponent(user)}/tokens/${existing.id}`,
          { method: "DELETE", headers }
        );
      }
    }
  } catch {
    // non-fatal
  }

  const res = await fetch(
    `${forgejoUrl}/api/v1/users/${encodeURIComponent(user)}/tokens`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: tokenName,
        scopes: [
          "read:user",
          "write:repository",
          "read:repository",
          "read:organization",
          "write:issue",
          "read:issue",
          "read:package",
          "write:package",
        ],
      }),
    }
  );

  if (!res.ok) {
    // Fall back to empty token — dev pod still works, just no git
    return "";
  }

  const token = await res.json();
  return token.sha1 || "";
}

/**
 * Create PVC + Secret + Deployment for a dev pod inside an instance's vCluster.
 * Uses the HOST Forgejo registry for the devpod image and creates registry
 * credentials in the instance's namespace.
 */
export async function createInstanceDevPod(
  slug: string,
  spec: DevPodSpec
): Promise<void> {
  const { appsV1, coreV1 } = await getInstanceClients(slug);
  await ensureNamespace(coreV1, NAMESPACE);
  await ensureRegistrySecret(coreV1, NAMESPACE);

  const name = podName(spec.username);
  const pvc = pvcName(spec.username);
  const secret = secretName(spec.username);
  const l = labels(spec.username);
  // Use HOST registry — the devpod image is built and stored on the host Forgejo
  const image = `${REGISTRY_HOST}/${DEVPOD_IMAGE}`;

  // Try to get Forgejo credentials from the instance's vCluster
  let forgejoToken = spec.forgejoToken;
  let forgejoUrl = spec.forgejoUrl;
  if (!forgejoToken) {
    const creds = await getInstanceForgejoCredentials(coreV1, slug);
    if (creds) {
      forgejoUrl = creds.url;
      forgejoToken = await createInstanceForgejoToken(
        creds.url,
        creds.username,
        creds.password,
        creds.username, // use instance admin for now
        `devpod-${spec.username}`
      );
    }
  }

  // 1. Create PVC
  try {
    await coreV1.readNamespacedPersistentVolumeClaim({
      name: pvc,
      namespace: NAMESPACE,
    });
  } catch {
    await coreV1.createNamespacedPersistentVolumeClaim({
      namespace: NAMESPACE,
      body: {
        metadata: { name: pvc, namespace: NAMESPACE, labels: l },
        spec: {
          accessModes: ["ReadWriteOnce"],
          resources: {
            requests: { storage: spec.storageSize || "20Gi" },
          },
        },
      },
    });
  }

  // 2. Create credentials secret
  try {
    await coreV1.deleteNamespacedSecret({ name: secret, namespace: NAMESPACE });
  } catch {
    // doesn't exist yet
  }

  await coreV1.createNamespacedSecret({
    namespace: NAMESPACE,
    body: {
      metadata: { name: secret, namespace: NAMESPACE, labels: l },
      type: "Opaque",
      stringData: {
        username: spec.username,
        email: spec.email,
        full_name: spec.fullName,
        token: forgejoToken,
        forgejo_url: forgejoUrl,
      },
    },
  });

  // 3. Create Deployment
  const cpuLimit = spec.cpuLimit || "2000m";
  const memoryLimit = spec.memoryLimit || "4Gi";

  await appsV1.createNamespacedDeployment({
    namespace: NAMESPACE,
    body: {
      metadata: { name, namespace: NAMESPACE, labels: l },
      spec: {
        replicas: 1,
        selector: { matchLabels: { app: name } },
        template: {
          metadata: { labels: l },
          spec: {
            imagePullSecrets: [{ name: "forgejo-registry" }],
            terminationGracePeriodSeconds: 10,
            containers: [
              {
                name: "dev",
                image,
                tty: true,
                stdin: true,
                env: [
                  {
                    name: "FORGEJO_USERNAME",
                    valueFrom: {
                      secretKeyRef: { name: secret, key: "username" },
                    },
                  },
                  {
                    name: "FORGEJO_EMAIL",
                    valueFrom: {
                      secretKeyRef: { name: secret, key: "email" },
                    },
                  },
                  {
                    name: "FORGEJO_FULL_NAME",
                    valueFrom: {
                      secretKeyRef: { name: secret, key: "full_name" },
                    },
                  },
                  {
                    name: "FORGEJO_TOKEN",
                    valueFrom: {
                      secretKeyRef: { name: secret, key: "token" },
                    },
                  },
                  {
                    name: "FORGEJO_URL",
                    valueFrom: {
                      secretKeyRef: { name: secret, key: "forgejo_url" },
                    },
                  },
                  {
                    name: "DOCKER_HOST",
                    value: "tcp://localhost:2376",
                  },
                  {
                    name: "DOCKER_TLS_VERIFY",
                    value: "1",
                  },
                  {
                    name: "DOCKER_CERT_PATH",
                    value: "/certs/client",
                  },
                ],
                volumeMounts: [
                  { name: "home", mountPath: "/home/dev" },
                  {
                    name: "docker-certs",
                    mountPath: "/certs/client",
                    readOnly: true,
                  },
                ],
                resources: {
                  requests: { cpu: "500m", memory: "1Gi" },
                  limits: { cpu: cpuLimit, memory: memoryLimit },
                },
              },
              {
                name: "dind",
                image: "docker:dind",
                securityContext: { privileged: true },
                env: [{ name: "DOCKER_TLS_CERTDIR", value: "/certs" }],
                volumeMounts: [
                  { name: "docker-certs", mountPath: "/certs" },
                  { name: "dind-storage", mountPath: "/var/lib/docker" },
                ],
                resources: {
                  requests: { cpu: "250m", memory: "512Mi" },
                  limits: { cpu: "1000m", memory: "2Gi" },
                },
              },
            ],
            volumes: [
              {
                name: "home",
                persistentVolumeClaim: { claimName: pvc },
              },
              { name: "docker-certs", emptyDir: {} },
              { name: "dind-storage", emptyDir: {} },
            ],
          },
        },
      },
    },
  });
}

/**
 * Start a stopped instance dev pod (scale replicas 0 -> 1).
 */
export async function startInstanceDevPod(
  slug: string,
  username: string
): Promise<void> {
  const { appsV1 } = await getInstanceClients(slug);
  const name = podName(username);

  await appsV1.patchNamespacedDeployment({
    name,
    namespace: NAMESPACE,
    body: { spec: { replicas: 1 } },
  }, MERGE_PATCH);
}

/**
 * Stop a running instance dev pod (scale replicas 1 -> 0).
 */
export async function stopInstanceDevPod(
  slug: string,
  username: string
): Promise<void> {
  const { appsV1 } = await getInstanceClients(slug);
  const name = podName(username);

  await appsV1.patchNamespacedDeployment({
    name,
    namespace: NAMESPACE,
    body: { spec: { replicas: 0 } },
  }, MERGE_PATCH);
}

/**
 * Delete an instance dev pod and all its resources.
 */
export async function deleteInstanceDevPod(
  slug: string,
  username: string
): Promise<void> {
  const { appsV1, coreV1 } = await getInstanceClients(slug);
  const name = podName(username);
  const pvc = pvcName(username);
  const secret = secretName(username);

  try {
    await appsV1.deleteNamespacedDeployment({ name, namespace: NAMESPACE });
  } catch {
    // may not exist
  }

  try {
    await coreV1.deleteNamespacedPersistentVolumeClaim({
      name: pvc,
      namespace: NAMESPACE,
    });
  } catch {
    // may not exist
  }

  try {
    await coreV1.deleteNamespacedSecret({ name: secret, namespace: NAMESPACE });
  } catch {
    // may not exist
  }
}

/**
 * Get the running pod name for an instance dev pod deployment.
 */
export async function getInstanceDevPodPodName(
  slug: string,
  username: string
): Promise<string | null> {
  const { coreV1 } = await getInstanceClients(slug);

  try {
    const pods = await coreV1.listNamespacedPod({
      namespace: NAMESPACE,
      labelSelector: `app=devpod-${username}`,
    });

    for (const pod of pods.items) {
      const ready = pod.status?.conditions?.some(
        (c) => c.type === "Ready" && c.status === "True"
      );
      if (ready && pod.metadata?.name) {
        return pod.metadata.name;
      }
    }

    for (const pod of pods.items) {
      if (pod.status?.phase === "Running" && pod.metadata?.name) {
        return pod.metadata.name;
      }
    }
  } catch {
    // listing failed
  }

  return null;
}

/**
 * Check if an instance dev pod deployment exists and get its replica count.
 */
export async function getInstanceDevPodStatus(
  slug: string,
  username: string
): Promise<{ exists: boolean; replicas: number; readyReplicas: number }> {
  const { appsV1 } = await getInstanceClients(slug);
  const name = podName(username);

  try {
    const dep = await appsV1.readNamespacedDeployment({
      name,
      namespace: NAMESPACE,
    });

    return {
      exists: true,
      replicas: dep.spec?.replicas ?? 0,
      readyReplicas: dep.status?.readyReplicas ?? 0,
    };
  } catch {
    return { exists: false, replicas: 0, readyReplicas: 0 };
  }
}

export { NAMESPACE as DEV_POD_NAMESPACE };
