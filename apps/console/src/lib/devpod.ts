import * as k8s from "@kubernetes/client-node";

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
  });
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
  });
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

export { NAMESPACE as DEV_POD_NAMESPACE };
