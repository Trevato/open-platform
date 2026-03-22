import * as k8s from "@kubernetes/client-node";
import { setHeaderOptions } from "@kubernetes/client-node";
import { PassThrough } from "stream";
import { getClientsForInstance } from "./k8s.js";
import { logger } from "../logger.js";

// ─── Constants ───

const MERGE_PATCH = setHeaderOptions(
  "Content-Type",
  "application/strategic-merge-patch+json",
);

export const NAMESPACE = "op-dev-pods";
const DEVPOD_IMAGE = process.env.DEVPOD_IMAGE || "system/devpod:latest";
const SERVICE_PREFIX = process.env.SERVICE_PREFIX || "";
const PLATFORM_DOMAIN = process.env.PLATFORM_DOMAIN || "";
const REGISTRY_HOST = `${SERVICE_PREFIX}forgejo.${PLATFORM_DOMAIN}`;

// ─── Types ───

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

export interface DevPodStatus {
  exists: boolean;
  replicas: number;
  readyReplicas: number;
}

// ─── Lazy singleton K8s clients (host cluster) ───

let hostAppsV1: k8s.AppsV1Api | null = null;
let hostCoreV1: k8s.CoreV1Api | null = null;
let hostRbacV1: k8s.RbacAuthorizationV1Api | null = null;
let hostKc: k8s.KubeConfig | null = null;

export function getHostClients() {
  if (!hostAppsV1 || !hostCoreV1 || !hostRbacV1 || !hostKc) {
    hostKc = new k8s.KubeConfig();
    hostKc.loadFromDefault();
    hostAppsV1 = hostKc.makeApiClient(k8s.AppsV1Api);
    hostCoreV1 = hostKc.makeApiClient(k8s.CoreV1Api);
    hostRbacV1 = hostKc.makeApiClient(k8s.RbacAuthorizationV1Api);
  }
  return {
    appsV1: hostAppsV1!,
    coreV1: hostCoreV1!,
    rbacV1: hostRbacV1!,
    kc: hostKc!,
  };
}

// ─── Resource naming ───

export function podName(username: string) {
  return `devpod-${username}`;
}

export function pvcName(username: string) {
  return `devpod-${username}-home`;
}

export function secretName(username: string) {
  return `devpod-${username}-credentials`;
}

function labels(username: string) {
  return {
    "open-platform.sh/devpod": "true",
    "open-platform.sh/user": username,
    app: `devpod-${username}`,
  };
}

// ─── Infrastructure helpers ───

async function ensureNamespace(
  coreV1: k8s.CoreV1Api,
  namespace: string,
): Promise<void> {
  try {
    await coreV1.readNamespace({ name: namespace });
  } catch {
    await coreV1.createNamespace({
      body: { metadata: { name: namespace } },
    });
  }
}

async function ensurePvc(
  api: k8s.CoreV1Api,
  name: string,
  namespace: string,
  pvcLabels: Record<string, string>,
  storage: string,
): Promise<void> {
  try {
    const existing = await api.readNamespacedPersistentVolumeClaim({
      name,
      namespace,
    });
    if (existing.metadata?.deletionTimestamp) {
      // PVC is terminating — poll until gone
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
      metadata: { name, namespace, labels: pvcLabels },
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
  namespace: string,
): Promise<void> {
  // ServiceAccount — namespace-scoped, safe to create at runtime
  try {
    await coreV1.readNamespacedServiceAccount({ name: SA_NAME, namespace });
  } catch {
    await coreV1.createNamespacedServiceAccount({
      namespace,
      body: { metadata: { name: SA_NAME, namespace } },
    });
  }

  // ClusterRole + ClusterRoleBinding are pre-created in k8s/rbac.yaml
  // (applied at deploy time by the CI pipeline's cluster-admin SA).
  // Creating a ClusterRole with apiGroups: ["*"] at runtime would require
  // RBAC escalation privileges that the op-api SA doesn't have.
  // Verify they exist and log a warning if missing.
  try {
    await rbacV1.readClusterRole({ name: CLUSTER_ROLE_NAME });
  } catch {
    logger.warn(
      `ClusterRole "${CLUSTER_ROLE_NAME}" not found — dev pods will have limited permissions. ` +
        "Ensure k8s/rbac.yaml has been applied.",
    );
  }

  const bindingName = `${SA_NAME}-explorer`;
  try {
    await rbacV1.readClusterRoleBinding({ name: bindingName });
  } catch {
    // Binding can be created at runtime (no escalation needed)
    try {
      await rbacV1.createClusterRoleBinding({
        body: {
          metadata: { name: bindingName },
          subjects: [{ kind: "ServiceAccount", name: SA_NAME, namespace }],
          roleRef: {
            kind: "ClusterRole",
            name: CLUSTER_ROLE_NAME,
            apiGroup: "rbac.authorization.k8s.io",
          },
        },
      });
    } catch {
      logger.warn(
        `ClusterRoleBinding "${bindingName}" could not be created — verify RBAC setup.`,
      );
    }
  }
}

async function ensureRegistrySecret(
  coreV1: k8s.CoreV1Api,
  namespace: string,
): Promise<void> {
  const name = "forgejo-registry";
  try {
    await coreV1.readNamespacedSecret({ name, namespace });
    return; // already exists
  } catch {
    // create it
  }

  const username = process.env.FORGEJO_ADMIN_USER || "";
  const password = process.env.FORGEJO_ADMIN_PASSWORD || "";
  const auth = Buffer.from(`${username}:${password}`).toString("base64");
  const dockerConfigJson = JSON.stringify({
    auths: {
      [REGISTRY_HOST]: { auth },
    },
  });

  await coreV1.createNamespacedSecret({
    namespace,
    body: {
      metadata: { name, namespace },
      type: "kubernetes.io/dockerconfigjson",
      stringData: { ".dockerconfigjson": dockerConfigJson },
    },
  });
}

// ─── Deployment spec builder ───

function buildDeploymentSpec(
  spec: DevPodSpec,
  image: string,
  extraEnv: k8s.V1EnvVar[] = [],
): k8s.V1Deployment {
  const name = podName(spec.username);
  const pvc = pvcName(spec.username);
  const secret = secretName(spec.username);
  const l = labels(spec.username);
  const cpuLimit = spec.cpuLimit || "2000m";
  const memoryLimit = spec.memoryLimit || "4Gi";

  const baseEnv: k8s.V1EnvVar[] = [
    {
      name: "FORGEJO_USERNAME",
      valueFrom: { secretKeyRef: { name: secret, key: "username" } },
    },
    {
      name: "FORGEJO_EMAIL",
      valueFrom: { secretKeyRef: { name: secret, key: "email" } },
    },
    {
      name: "FORGEJO_FULL_NAME",
      valueFrom: { secretKeyRef: { name: secret, key: "full_name" } },
    },
    {
      name: "FORGEJO_TOKEN",
      valueFrom: { secretKeyRef: { name: secret, key: "token" } },
    },
    {
      name: "FORGEJO_URL",
      valueFrom: { secretKeyRef: { name: secret, key: "forgejo_url" } },
    },
    { name: "DOCKER_HOST", value: "tcp://localhost:2376" },
    { name: "DOCKER_TLS_VERIFY", value: "1" },
    { name: "DOCKER_CERT_PATH", value: "/certs/client" },
    { name: "OP_API_URL", value: "http://op-api.op-system-op-api.svc:80" },
  ];

  return {
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
              env: [...baseEnv, ...extraEnv],
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
  };
}

// ─── Host-level operations ───

export async function createDevPod(spec: DevPodSpec): Promise<void> {
  const { appsV1, coreV1 } = getHostClients();
  const pvc = pvcName(spec.username);
  const secret = secretName(spec.username);
  const l = labels(spec.username);
  const image = `${REGISTRY_HOST}/${DEVPOD_IMAGE}`;

  // PVC
  await ensurePvc(coreV1, pvc, NAMESPACE, l, spec.storageSize || "20Gi");

  // Credentials secret (delete-then-create for idempotency)
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

  // Deployment
  await appsV1.createNamespacedDeployment({
    namespace: NAMESPACE,
    body: buildDeploymentSpec(spec, image),
  });
}

export async function startDevPod(username: string): Promise<void> {
  const { appsV1 } = getHostClients();
  await appsV1.patchNamespacedDeployment(
    {
      name: podName(username),
      namespace: NAMESPACE,
      body: { spec: { replicas: 1 } },
    },
    MERGE_PATCH,
  );
}

export async function stopDevPod(username: string): Promise<void> {
  const { appsV1 } = getHostClients();
  await appsV1.patchNamespacedDeployment(
    {
      name: podName(username),
      namespace: NAMESPACE,
      body: { spec: { replicas: 0 } },
    },
    MERGE_PATCH,
  );
}

export async function deleteDevPod(username: string): Promise<void> {
  const { appsV1, coreV1 } = getHostClients();
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

export async function getDevPodStatus(username: string): Promise<DevPodStatus> {
  const { appsV1 } = getHostClients();
  try {
    const dep = await appsV1.readNamespacedDeployment({
      name: podName(username),
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

export async function ensureHostInfrastructure(): Promise<void> {
  const { coreV1, rbacV1 } = getHostClients();
  await ensureNamespace(coreV1, NAMESPACE);
  await ensureDevPodRbac(coreV1, rbacV1, NAMESPACE);
  await ensureRegistrySecret(coreV1, NAMESPACE);
}

// ─── Instance-scoped operations ───

async function getInstanceClients(slug: string) {
  const clients = await getClientsForInstance(slug);
  if (!clients) throw new Error(`Instance "${slug}" not found or not ready`);
  return clients;
}

/**
 * Execute a command inside a pod via the k8s Exec API.
 */
export async function execInPod(
  kc: k8s.KubeConfig,
  namespace: string,
  pod: string,
  container: string,
  command: string[],
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
      .exec(namespace, pod, container, command, stdout, stderr, null, false)
      .then((ws) => {
        ws.on("close", () => {
          // End streams so buffered data flushes before we resolve
          stdout.end();
          stderr.end();
        });
        ws.on("error", reject);
      })
      .catch(reject);

    let stdoutDone = false;
    let stderrDone = false;
    const tryResolve = () => {
      if (stdoutDone && stderrDone) resolve({ stdout: out, stderr: err });
    };
    stdout.on("end", () => {
      stdoutDone = true;
      tryResolve();
    });
    stderr.on("end", () => {
      stderrDone = true;
      tryResolve();
    });
  });
}

/**
 * Get Forgejo admin credentials from an instance's vCluster.
 */
async function getInstanceForgejoCredentials(
  coreV1: k8s.CoreV1Api,
  slug: string,
): Promise<{ username: string; url: string } | null> {
  const domain = process.env.PLATFORM_DOMAIN || "";
  try {
    const secret = await coreV1.readNamespacedSecret({
      name: "forgejo-admin-credentials",
      namespace: "forgejo",
    });
    const username = Buffer.from(
      secret.data?.["username"] || "",
      "base64",
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
 * Uses k8s exec to avoid cross-vCluster DNS and Authorization header conflicts.
 */
export async function createInstanceForgejoToken(
  kc: k8s.KubeConfig,
  coreV1: k8s.CoreV1Api,
  adminUser: string,
  tokenName: string,
): Promise<string> {
  // Find the running Forgejo pod
  const pods = await coreV1.listNamespacedPod({
    namespace: "forgejo",
    labelSelector: "app.kubernetes.io/name=forgejo",
  });
  const forgejoPod = pods.items.find(
    (p) => p.status?.phase === "Running" && p.metadata?.name,
  );
  if (!forgejoPod?.metadata?.name) {
    logger.error("[devpod] No running Forgejo pod found in vCluster");
    return "";
  }

  const fPodName = forgejoPod.metadata.name;
  const container = "forgejo";

  // Read admin password from secret
  let adminPassword = "";
  try {
    const secret = await coreV1.readNamespacedSecret({
      name: "forgejo-admin-credentials",
      namespace: "forgejo",
    });
    adminPassword = Buffer.from(
      secret.data?.["password"] || "",
      "base64",
    ).toString();
  } catch {
    logger.error("[devpod] Could not read forgejo-admin-credentials secret");
  }

  // Delete existing token via Forgejo API
  if (adminPassword) {
    try {
      const listResult = await execInPod(kc, "forgejo", fPodName, container, [
        "curl",
        "-sk",
        "-u",
        `${adminUser}:${adminPassword}`,
        `http://localhost:3000/api/v1/users/${adminUser}/tokens`,
      ]);
      const tokens = JSON.parse(listResult.stdout || "[]");
      const existing = tokens.find(
        (t: { name: string }) => t.name === tokenName,
      );
      if (existing) {
        await execInPod(kc, "forgejo", fPodName, container, [
          "curl",
          "-sk",
          "-X",
          "DELETE",
          "-u",
          `${adminUser}:${adminPassword}`,
          `http://localhost:3000/api/v1/users/${adminUser}/tokens/${existing.id}`,
        ]);
        logger.info(
          `[devpod] Deleted existing token "${tokenName}" (id=${existing.id})`,
        );
      }
    } catch {
      // Token didn't exist or API failed — continue to create
    }
  }

  // Create new token via gitea CLI
  try {
    const scopes = [
      "read:user",
      "write:repository",
      "read:repository",
      "read:organization",
      "write:issue",
      "read:issue",
      "read:package",
      "write:package",
    ].join(",");

    const result = await execInPod(kc, "forgejo", fPodName, container, [
      "gitea",
      "admin",
      "user",
      "generate-access-token",
      "--username",
      adminUser,
      "--token-name",
      tokenName,
      "--scopes",
      scopes,
      "--raw",
    ]);

    const token = result.stdout.trim();
    if (token && !token.includes("error") && !token.includes("Error")) {
      return token;
    }

    // Fallback: parse "Access token was successfully created: <token>" format
    const match = result.stdout.match(/:\s*([a-f0-9]{40})/);
    if (match) return match[1];

    logger.error(
      `[devpod] Token creation output: stdout=${result.stdout}, stderr=${result.stderr}`,
    );
    return "";
  } catch (err) {
    logger.error({ err }, "[devpod] Error creating Forgejo token via exec");
    return "";
  }
}

export async function createInstanceDevPod(
  slug: string,
  spec: DevPodSpec,
): Promise<void> {
  const { appsV1, coreV1, rbacV1, kc } = await getInstanceClients(slug);
  await ensureNamespace(coreV1, NAMESPACE);
  await ensureRegistrySecret(coreV1, NAMESPACE);
  await ensureDevPodRbac(coreV1, rbacV1, NAMESPACE);

  const pvc = pvcName(spec.username);
  const secret = secretName(spec.username);
  const l = labels(spec.username);
  const image = `${REGISTRY_HOST}/${DEVPOD_IMAGE}`;

  // Resolve Forgejo token from instance if not provided
  let forgejoToken = spec.forgejoToken;
  let forgejoUrl = spec.forgejoUrl;
  if (!forgejoToken) {
    logger.info(
      `[devpod] No token provided for ${spec.username}@${slug}, reading from vCluster...`,
    );
    const creds = await getInstanceForgejoCredentials(coreV1, slug);
    if (creds) {
      forgejoUrl = creds.url;
      forgejoToken = await createInstanceForgejoToken(
        kc,
        coreV1,
        creds.username,
        `devpod-${spec.username}`,
      );
      if (forgejoToken) {
        logger.info(
          `[devpod] Created Forgejo PAT for ${spec.username}@${slug}`,
        );
      } else {
        logger.error(
          `[devpod] Failed to create Forgejo PAT for ${spec.username}@${slug}`,
        );
      }
    } else {
      logger.error(
        `[devpod] Could not read Forgejo credentials from vCluster ${slug}`,
      );
    }
  }

  // PVC
  await ensurePvc(coreV1, pvc, NAMESPACE, l, spec.storageSize || "20Gi");

  // Credentials secret
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

  // Deployment — instance pods get GIT_SSL_NO_VERIFY for self-signed certs
  const instanceSpec = { ...spec, forgejoToken, forgejoUrl };
  const deployment = buildDeploymentSpec(instanceSpec, image, [
    { name: "GIT_SSL_NO_VERIFY", value: "1" },
  ]);

  await appsV1.createNamespacedDeployment({
    namespace: NAMESPACE,
    body: deployment,
  });
}

export async function startInstanceDevPod(
  slug: string,
  username: string,
): Promise<void> {
  const { appsV1 } = await getInstanceClients(slug);
  await appsV1.patchNamespacedDeployment(
    {
      name: podName(username),
      namespace: NAMESPACE,
      body: { spec: { replicas: 1 } },
    },
    MERGE_PATCH,
  );
}

export async function stopInstanceDevPod(
  slug: string,
  username: string,
): Promise<void> {
  const { appsV1 } = await getInstanceClients(slug);
  await appsV1.patchNamespacedDeployment(
    {
      name: podName(username),
      namespace: NAMESPACE,
      body: { spec: { replicas: 0 } },
    },
    MERGE_PATCH,
  );
}

export async function deleteInstanceDevPod(
  slug: string,
  username: string,
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

export async function getInstanceDevPodStatus(
  slug: string,
  username: string,
): Promise<DevPodStatus> {
  const { appsV1 } = await getInstanceClients(slug);
  try {
    const dep = await appsV1.readNamespacedDeployment({
      name: podName(username),
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
