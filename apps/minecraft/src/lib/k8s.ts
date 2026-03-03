import * as k8s from "@kubernetes/client-node";

const kc = new k8s.KubeConfig();
kc.loadFromCluster();

const appsV1 = kc.makeApiClient(k8s.AppsV1Api);
const coreV1 = kc.makeApiClient(k8s.CoreV1Api);

const NAMESPACE = process.env.MINECRAFT_NAMESPACE || "minecraft";

function deploymentName(serverId: string): string {
  return `mc-${serverId.slice(0, 8)}`;
}

interface ServerConfig {
  id: string;
  name: string;
  version: string;
  difficulty: string;
  game_mode: string;
  max_players: number;
  motd: string;
}

export async function createServerDeployment(
  server: ServerConfig,
): Promise<number> {
  const name = deploymentName(server.id);

  const deployment: k8s.V1Deployment = {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: { name, namespace: NAMESPACE },
    spec: {
      replicas: 1,
      selector: { matchLabels: { app: name } },
      template: {
        metadata: { labels: { app: name } },
        spec: {
          containers: [
            {
              name: "minecraft",
              image: "itzg/minecraft-server",
              env: [
                { name: "EULA", value: "TRUE" },
                { name: "TYPE", value: "VANILLA" },
                { name: "VERSION", value: server.version },
                { name: "DIFFICULTY", value: server.difficulty.toUpperCase() },
                { name: "MODE", value: server.game_mode },
                { name: "MAX_PLAYERS", value: String(server.max_players) },
                { name: "MOTD", value: server.motd },
                { name: "ENABLE_COMMAND_BLOCK", value: "true" },
                { name: "SNOOPER_ENABLED", value: "false" },
                { name: "VIEW_DISTANCE", value: "10" },
              ],
              ports: [{ containerPort: 25565, protocol: "TCP" }],
              resources: {
                requests: { cpu: "250m", memory: "512Mi" },
                limits: { cpu: "1000m", memory: "1536Mi" },
              },
              readinessProbe: {
                exec: { command: ["mc-health"] },
                initialDelaySeconds: 30,
                periodSeconds: 10,
              },
            },
          ],
        },
      },
    },
  };

  await appsV1.createNamespacedDeployment({
    namespace: NAMESPACE,
    body: deployment,
  });

  const service: k8s.V1Service = {
    apiVersion: "v1",
    kind: "Service",
    metadata: { name, namespace: NAMESPACE },
    spec: {
      type: "NodePort",
      selector: { app: name },
      ports: [{ port: 25565, targetPort: 25565, protocol: "TCP" }],
    },
  };

  const svcResponse = await coreV1.createNamespacedService({
    namespace: NAMESPACE,
    body: service,
  });

  const nodePort = svcResponse.spec?.ports?.[0]?.nodePort;
  if (!nodePort) {
    throw new Error("NodePort was not assigned");
  }

  return nodePort;
}

export async function deleteServerDeployment(serverId: string): Promise<void> {
  const name = deploymentName(serverId);

  await appsV1
    .deleteNamespacedDeployment({ name, namespace: NAMESPACE })
    .catch(() => {});

  await coreV1
    .deleteNamespacedService({ name, namespace: NAMESPACE })
    .catch(() => {});
}

export async function getServerStatus(
  serverId: string,
): Promise<"running" | "starting" | "stopped" | "error"> {
  const name = deploymentName(serverId);

  let deployment: k8s.V1Deployment;
  try {
    deployment = await appsV1.readNamespacedDeployment({
      name,
      namespace: NAMESPACE,
    });
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: number }).code === 404
    ) {
      return "stopped";
    }
    throw err;
  }

  const ready = deployment.status?.readyReplicas ?? 0;
  if (ready > 0) {
    return "running";
  }

  // Check for CrashLoopBackOff
  try {
    const podList = await coreV1.listNamespacedPod({
      namespace: NAMESPACE,
      labelSelector: `app=${name}`,
    });

    for (const pod of podList.items) {
      const statuses = pod.status?.containerStatuses ?? [];
      for (const cs of statuses) {
        if (cs.state?.waiting?.reason === "CrashLoopBackOff") {
          return "error";
        }
      }
    }
  } catch {
    // If we can't check pods, fall through to "starting"
  }

  return "starting";
}
