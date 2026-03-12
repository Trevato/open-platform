import * as k8s from "@kubernetes/client-node";
import { setHeaderOptions } from "@kubernetes/client-node";
import { PassThrough } from "stream";
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

async function ensurePvc(
  api: k8s.CoreV1Api,
  name: string,
  namespace: string,
  labels: Record<string, string>,
  storage: string
) {
  try {
    const existing = await api.readNamespacedPersistentVolumeClaim({
      name,
      namespace,
    });
    // If the PVC is being deleted, wait for it to finish then create a new one
    if (existing.metadata?.deletionTimestamp) {
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        try {
          await api.readNamespacedPersistentVolumeClaim({ name, namespace });
        } catch {
          break; // deleted
        }
      }
      // Fall through to create
    } else {
      return; // PVC exists and is healthy
    }
  } catch {
    // doesn't exist
  }
  await api.createNamespacedPersistentVolumeClaim({
    namespace,
    body: {
      metadata: { name, namespace, labels },
      spec: {
        accessModes: ["ReadWriteOnce"],
        resources: { requests: { storage } },
      },
    },
  });
}

const SA_NAME = "devpod-sa";
const CLUSTER_ROLE_NAME = "devpod-explorer";

async function ensureDevPodRbac(
  coreV1: k8s.CoreV1Api,
  rbacV1: k8s.RbacAuthorizationV1Api,
  namespace: string
) {
  // ServiceAccount
  try {
    await coreV1.readNamespacedServiceAccount({ name: SA_NAME, namespace });
  } catch {
    await coreV1.createNamespacedServiceAccount({
      namespace,
      body: { metadata: { name: SA_NAME, namespace } },
    });
  }

  // ClusterRole — create or update (k9s needs broad read access)
  const clusterRoleBody: k8s.V1ClusterRole = {
    metadata: { name: CLUSTER_ROLE_NAME },
    rules: [
      // Read everything — k9s queries many resource types on startup
      {
        apiGroups: ["*"],
        resources: ["*"],
        verbs: ["get", "list", "watch"],
      },
      // Manage workloads
      {
        apiGroups: ["apps"],
        resources: ["deployments"],
        verbs: ["create", "update", "patch", "delete"],
      },
      {
        apiGroups: [""],
        resources: ["services", "configmaps", "secrets"],
        verbs: ["create", "update", "patch", "delete"],
      },
      // Exec + port-forward + logs
      {
        apiGroups: [""],
        resources: ["pods/exec", "pods/portforward", "pods/log"],
        verbs: ["create", "get"],
      },
    ],
  };
  try {
    await rbacV1.readClusterRole({ name: CLUSTER_ROLE_NAME });
    // Exists — replace with current rules
    await rbacV1.replaceClusterRole({
      name: CLUSTER_ROLE_NAME,
      body: clusterRoleBody,
    });
  } catch {
    await rbacV1.createClusterRole({ body: clusterRoleBody });
  }

  // ClusterRoleBinding
  const bindingName = `${SA_NAME}-explorer`;
  try {
    await rbacV1.readClusterRoleBinding({ name: bindingName });
  } catch {
    await rbacV1.createClusterRoleBinding({
      body: {
        metadata: { name: bindingName },
        subjects: [
          { kind: "ServiceAccount", name: SA_NAME, namespace },
        ],
        roleRef: {
          kind: "ClusterRole",
          name: CLUSTER_ROLE_NAME,
          apiGroup: "rbac.authorization.k8s.io",
        },
      },
    });
  }
}

/**
 * Execute a command inside a pod via the k8s Exec API.
 * Returns { stdout, stderr } as strings.
 */
async function execInPod(
  kc: k8s.KubeConfig,
  namespace: string,
  podName: string,
  container: string,
  command: string[]
): Promise<{ stdout: string; stderr: string }> {
  const exec = new k8s.Exec(kc);
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let out = "";
  let err = "";
  stdout.on("data", (chunk: Buffer) => (out += chunk.toString()));
  stderr.on("data", (chunk: Buffer) => (err += chunk.toString()));

  return new Promise((resolve, reject) => {
    exec
      .exec(namespace, podName, container, command, stdout, stderr, null, false)
      .then((ws) => {
        ws.on("close", () => resolve({ stdout: out, stderr: err }));
        ws.on("error", reject);
      })
      .catch(reject);
  });
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
  await ensurePvc(coreV1, pvc, NAMESPACE, l, spec.storageSize || "20Gi");

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
): Promise<{ username: string; url: string } | null> {
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
    return {
      username,
      url: `https://${slug}-forgejo.${domain}`,
    };
  } catch {
    return null;
  }
}

/**
 * Create a Forgejo PAT via the gitea CLI inside the Forgejo pod.
 * Uses k8s exec to avoid cross-vCluster DNS and Authorization header conflicts
 * (vCluster kubeconfigs use Bearer token auth which occupies the Authorization header).
 *
 * Deletes existing token of the same name via Forgejo API (the gitea CLI has no
 * delete-access-token subcommand), then creates a fresh one.
 */
async function createInstanceForgejoToken(
  kc: k8s.KubeConfig,
  coreV1: k8s.CoreV1Api,
  adminUser: string,
  tokenName: string
): Promise<string> {
  // Find the running Forgejo pod
  const pods = await coreV1.listNamespacedPod({
    namespace: "forgejo",
    labelSelector: "app.kubernetes.io/name=forgejo",
  });
  const forgejoPod = pods.items.find(
    (p) => p.status?.phase === "Running" && p.metadata?.name
  );
  if (!forgejoPod?.metadata?.name) {
    console.error("[devpod] No running Forgejo pod found in vCluster");
    return "";
  }

  const fPodName = forgejoPod.metadata.name;
  const container = "forgejo"; // Forgejo Helm chart container name

  // Read admin password from forgejo-admin-credentials secret
  let adminPassword = "";
  try {
    const secret = await coreV1.readNamespacedSecret({
      name: "forgejo-admin-credentials",
      namespace: "forgejo",
    });
    adminPassword = Buffer.from(
      secret.data?.["password"] || "",
      "base64"
    ).toString();
  } catch {
    console.error("[devpod] Could not read forgejo-admin-credentials secret");
  }

  // Delete existing token via Forgejo API (gitea CLI has no delete-access-token)
  if (adminPassword) {
    try {
      // List tokens to find the one with our name
      const listResult = await execInPod(kc, "forgejo", fPodName, container, [
        "curl", "-sk",
        "-u", `${adminUser}:${adminPassword}`,
        `http://localhost:3000/api/v1/users/${adminUser}/tokens`,
      ]);
      const tokens = JSON.parse(listResult.stdout || "[]");
      const existing = tokens.find((t: { name: string }) => t.name === tokenName);
      if (existing) {
        await execInPod(kc, "forgejo", fPodName, container, [
          "curl", "-sk", "-X", "DELETE",
          "-u", `${adminUser}:${adminPassword}`,
          `http://localhost:3000/api/v1/users/${adminUser}/tokens/${existing.id}`,
        ]);
        console.log(`[devpod] Deleted existing token "${tokenName}" (id=${existing.id})`);
      }
    } catch {
      // Token didn't exist or API failed — continue to create
    }
  }

  // Create new token via gitea CLI
  try {
    const scopes = [
      "read:user", "write:repository", "read:repository",
      "read:organization", "write:issue", "read:issue",
      "read:package", "write:package",
    ].join(",");

    const result = await execInPod(kc, "forgejo", fPodName, container, [
      "gitea", "admin", "user", "generate-access-token",
      "--username", adminUser,
      "--token-name", tokenName,
      "--scopes", scopes,
      "--raw",
    ]);

    const token = result.stdout.trim();
    if (token && !token.includes("error") && !token.includes("Error")) {
      return token;
    }

    // Fallback: parse "Access token was successfully created: <token>" format
    const match = result.stdout.match(/:\s*([a-f0-9]{40})/);
    if (match) return match[1];

    console.error(`[devpod] Token creation output: stdout=${result.stdout}, stderr=${result.stderr}`);
    return "";
  } catch (err) {
    console.error(`[devpod] Error creating Forgejo token via exec:`, err);
    return "";
  }
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
  const { appsV1, coreV1, rbacV1, kc } = await getInstanceClients(slug);
  await ensureNamespace(coreV1, NAMESPACE);
  await ensureRegistrySecret(coreV1, NAMESPACE);
  await ensureDevPodRbac(coreV1, rbacV1, NAMESPACE);

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
    console.log(`[devpod] No token provided for ${spec.username}@${slug}, reading from vCluster...`);
    const creds = await getInstanceForgejoCredentials(coreV1, slug);
    if (creds) {
      forgejoUrl = creds.url;
      console.log(`[devpod] Forgejo URL: ${forgejoUrl}, admin: ${creds.username}`);
      forgejoToken = await createInstanceForgejoToken(
        kc,
        coreV1,
        creds.username,
        `devpod-${spec.username}`
      );
      if (forgejoToken) {
        console.log(`[devpod] Created Forgejo PAT for ${spec.username}@${slug}`);
      } else {
        console.error(`[devpod] Failed to create Forgejo PAT for ${spec.username}@${slug}`);
      }
    } else {
      console.error(`[devpod] Could not read Forgejo credentials from vCluster ${slug}`);
    }
  }

  // 1. Create PVC
  await ensurePvc(coreV1, pvc, NAMESPACE, l, spec.storageSize || "20Gi");

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
            serviceAccountName: SA_NAME,
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
                    name: "GIT_SSL_NO_VERIFY",
                    value: "1",
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
