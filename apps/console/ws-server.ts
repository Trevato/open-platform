import { WebSocketServer, WebSocket } from "ws";
import { Pool } from "pg";
import * as pty from "node-pty";
import { IncomingMessage, createServer } from "http";
import { randomBytes, createHmac } from "crypto";
import { writeFileSync, unlinkSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const PORT = parseInt(process.env.WS_PORT || "3001", 10);
const MAX_SESSIONS_PER_USER = 3;
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_SESSION_MS = 2 * 60 * 60 * 1000;
const AUTH_SECRET = process.env.BETTER_AUTH_SECRET || "";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// --- Types ---

interface TerminalSession {
  kind: "terminal";
  userId: string;
  slug: string;
  ptyProcess: pty.IPty;
  kubeconfigPath: string;
  idleTimer: ReturnType<typeof setTimeout>;
  maxTimer: ReturnType<typeof setTimeout>;
}

interface DevPodSession {
  kind: "devpod";
  userId: string;
  username: string;
  k8sWs: WebSocket;
  idleTimer: ReturnType<typeof setTimeout>;
  maxTimer: ReturnType<typeof setTimeout>;
}

interface DevPodPtySession {
  kind: "devpod-pty";
  userId: string;
  username: string;
  slug: string;
  ptyProcess: pty.IPty;
  kubeconfigPath: string;
  idleTimer: ReturnType<typeof setTimeout>;
  maxTimer: ReturnType<typeof setTimeout>;
}

type Session = TerminalSession | DevPodSession | DevPodPtySession;

const sessions = new Map<WebSocket, Session>();

// --- Cookie / Auth ---

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const cookies: Record<string, string> = {};
  for (const pair of header.split(";")) {
    const [key, ...rest] = pair.trim().split("=");
    if (key) cookies[key] = rest.join("=");
  }
  return cookies;
}

function verifySignedCookie(
  rawValue: string,
  secret: string
): string | null {
  const decoded = decodeURIComponent(rawValue);
  const lastDot = decoded.lastIndexOf(".");
  if (lastDot < 1) return null;

  const value = decoded.substring(0, lastDot);
  const signature = decoded.substring(lastDot + 1);

  if (!signature) return null;

  const expected = createHmac("sha256", secret)
    .update(value)
    .digest("base64");

  if (expected !== signature) return null;

  return value;
}

async function validateSession(
  cookieHeader: string | undefined
): Promise<{ userId: string } | null> {
  const cookies = parseCookies(cookieHeader);

  const rawToken =
    cookies["__Secure-better-auth.session_token"] ||
    cookies["better-auth.session_token"];

  if (!rawToken) {
    console.log("[ws-server] No session cookie found in request");
    return null;
  }

  const token = verifySignedCookie(rawToken, AUTH_SECRET);
  if (!token) {
    console.log("[ws-server] Cookie signature verification failed");
    return null;
  }

  const result = await pool.query(
    `SELECT "userId" FROM session WHERE token = $1 AND "expiresAt" > NOW()`,
    [token]
  );

  if (result.rows.length === 0) {
    console.log("[ws-server] No matching session found in database");
    return null;
  }

  return { userId: result.rows[0].userId };
}

// --- Hosted mode helpers ---

async function verifyOwnership(
  slug: string,
  userId: string
): Promise<{ kubeconfig: string; clusterIp: string | null } | null> {
  const result = await pool.query(
    `SELECT i.kubeconfig, i.cluster_ip
     FROM instances i
     JOIN customers c ON c.id = i.customer_id
     WHERE i.slug = $1 AND c.user_id = $2 AND i.status = 'ready'`,
    [slug, userId]
  );

  if (result.rows.length === 0 || !result.rows[0].kubeconfig) return null;
  return {
    kubeconfig: result.rows[0].kubeconfig,
    clusterIp: result.rows[0].cluster_ip,
  };
}

function prepareKubeconfig(
  kubeconfig: string,
  clusterIp: string | null
): string {
  if (!clusterIp) return kubeconfig;
  return kubeconfig.replace(
    /server:\s*https?:\/\/[^\s]+/,
    `server: https://${clusterIp}:443`
  );
}

// --- K8s exec bridge helpers ---

function getK8sExecUrl(namespace: string, podName: string): string {
  const host = process.env.KUBERNETES_SERVICE_HOST || "kubernetes.default.svc";
  const port = process.env.KUBERNETES_SERVICE_PORT || "443";

  const params = new URLSearchParams();
  params.append("command", "/bin/zsh");
  params.append("command", "--login");
  params.append("stdin", "true");
  params.append("stdout", "true");
  params.append("stderr", "true");
  params.append("tty", "true");
  params.append("container", "dev");

  return `wss://${host}:${port}/api/v1/namespaces/${namespace}/pods/${podName}/exec?${params.toString()}`;
}

function getServiceAccountToken(): string {
  try {
    return readFileSync(
      "/var/run/secrets/kubernetes.io/serviceaccount/token",
      "utf8"
    ).trim();
  } catch {
    return "";
  }
}

function getServiceAccountCA(): Buffer | undefined {
  try {
    return readFileSync(
      "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt"
    );
  } catch {
    return undefined;
  }
}

// --- Shared helpers ---

function userSessionCount(userId: string): number {
  let count = 0;
  for (const session of sessions.values()) {
    if (session.userId === userId) count++;
  }
  return count;
}

function sendMessage(ws: WebSocket, msg: object) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function cleanupSession(ws: WebSocket) {
  const session = sessions.get(ws);
  if (!session) return;

  clearTimeout(session.idleTimer);
  clearTimeout(session.maxTimer);

  if (session.kind === "terminal" || session.kind === "devpod-pty") {
    try {
      session.ptyProcess.kill();
    } catch {}

    try {
      if (existsSync(session.kubeconfigPath)) {
        unlinkSync(session.kubeconfigPath);
      }
    } catch {}
  } else if (session.kind === "devpod") {
    try {
      session.k8sWs.close();
    } catch {}
  }

  sessions.delete(ws);
}

function resetIdleTimer(ws: WebSocket) {
  const session = sessions.get(ws);
  if (!session) return;

  clearTimeout(session.idleTimer);
  session.idleTimer = setTimeout(() => {
    sendMessage(ws, {
      type: "error",
      message: "Session closed due to inactivity.",
    });
    ws.close();
  }, IDLE_TIMEOUT_MS);
}

// --- Admin check helpers ---

async function getUserName(userId: string): Promise<string | null> {
  const result = await pool.query(`SELECT name FROM "user" WHERE id = $1`, [userId]);
  return result.rows[0]?.name || null;
}

async function checkAdminViaForgejo(username: string): Promise<boolean> {
  const forgejoUrl = process.env.AUTH_FORGEJO_INTERNAL_URL || process.env.AUTH_FORGEJO_URL || "";
  const adminUser = process.env.FORGEJO_ADMIN_USER || "";
  const adminPass = process.env.FORGEJO_ADMIN_PASSWORD || "";
  try {
    const res = await fetch(
      `${forgejoUrl}/api/v1/orgs/system/members/${encodeURIComponent(username)}`,
      { headers: { Authorization: `Basic ${Buffer.from(`${adminUser}:${adminPass}`).toString("base64")}` } }
    );
    return res.status === 204;
  } catch {
    return false;
  }
}

// --- Terminal handler (existing) ---

async function handleTerminalConnection(
  ws: WebSocket,
  req: IncomingMessage
) {
  // 1. Validate session
  const user = await validateSession(req.headers.cookie);
  if (!user) {
    sendMessage(ws, { type: "error", message: "Unauthorized" });
    ws.close();
    return;
  }

  // 2. Check session limit
  if (userSessionCount(user.userId) >= MAX_SESSIONS_PER_USER) {
    sendMessage(ws, {
      type: "error",
      message: `Maximum ${MAX_SESSIONS_PER_USER} concurrent sessions reached.`,
    });
    ws.close();
    return;
  }

  // 3. Extract slug
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const slug = url.searchParams.get("slug");

  let kubeconfigPath = "";

  if (!slug) {
    // Platform terminal — admin only
    const userName = await getUserName(user.userId);
    if (!userName || !(await checkAdminViaForgejo(userName))) {
      sendMessage(ws, { type: "error", message: "Admin access required" });
      ws.close();
      return;
    }
    kubeconfigPath = "";
  } else {
    if (!/^[a-z][a-z0-9-]{1,30}[a-z0-9]$/.test(slug)) {
      sendMessage(ws, { type: "error", message: "Invalid instance slug." });
      ws.close();
      return;
    }

    const instance = await verifyOwnership(slug, user.userId);
    if (!instance) {
      sendMessage(ws, {
        type: "error",
        message: "Instance not found or not ready.",
      });
      ws.close();
      return;
    }

    const sessionId = randomBytes(8).toString("hex");
    kubeconfigPath = join(tmpdir(), `term-${sessionId}.kubeconfig`);
    const kubeconfigContent = prepareKubeconfig(
      instance.kubeconfig,
      instance.clusterIp
    );
    writeFileSync(kubeconfigPath, kubeconfigContent, { mode: 0o600 });
  }

  // Spawn PTY
  const ptyEnv: Record<string, string> = {
    PATH: "/usr/local/bin:/usr/bin:/bin",
    TERM: "xterm-256color",
    HOME: "/tmp",
    ZDOTDIR: "/app/scripts",
    SHELL: "/bin/zsh",
    LANG: "C.UTF-8",
    STARSHIP_CONFIG: "/app/scripts/starship.toml",
    K9S_CONFIG_DIR: "/app/scripts/k9s",
    GIT_CONFIG_GLOBAL: "/app/scripts/gitconfig",
    BAT_THEME: "Catppuccin Mocha",
    FZF_DEFAULT_OPTS: "--height 40% --border",
  };

  if (kubeconfigPath) {
    ptyEnv.KUBECONFIG = kubeconfigPath;
  }

  const ptyProcess = pty.spawn("/bin/zsh", ["--login"], {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    env: ptyEnv,
  });

  const idleTimer = setTimeout(() => {
    sendMessage(ws, {
      type: "error",
      message: "Session closed due to inactivity.",
    });
    ws.close();
  }, IDLE_TIMEOUT_MS);

  const maxTimer = setTimeout(() => {
    sendMessage(ws, {
      type: "error",
      message: "Maximum session duration reached.",
    });
    ws.close();
  }, MAX_SESSION_MS);

  sessions.set(ws, {
    kind: "terminal",
    userId: user.userId,
    slug: slug || "",
    ptyProcess,
    kubeconfigPath,
    idleTimer,
    maxTimer,
  });

  ptyProcess.onData((data: string) => {
    sendMessage(ws, { type: "output", data });
  });

  ptyProcess.onExit(() => {
    sendMessage(ws, { type: "closed", reason: "Shell exited." });
    ws.close();
  });

  ws.on("message", (raw: Buffer | string) => {
    resetIdleTimer(ws);
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "input" && typeof msg.data === "string") {
        ptyProcess.write(msg.data);
      } else if (
        msg.type === "resize" &&
        typeof msg.cols === "number" &&
        typeof msg.rows === "number"
      ) {
        ptyProcess.resize(
          Math.max(1, Math.min(500, msg.cols)),
          Math.max(1, Math.min(200, msg.rows))
        );
      }
    } catch (err) {
      console.error("Failed to parse WebSocket message:", err);
    }
  });

  ws.on("close", () => cleanupSession(ws));
  ws.on("error", () => cleanupSession(ws));

  sendMessage(ws, { type: "connected", slug });
}

// --- Dev Pod handler (new) ---

async function handleDevPodConnection(
  ws: WebSocket,
  req: IncomingMessage
) {
  // 1. Validate session
  const user = await validateSession(req.headers.cookie);
  if (!user) {
    sendMessage(ws, { type: "error", message: "Unauthorized" });
    ws.close();
    return;
  }

  // 2. Check session limit
  if (userSessionCount(user.userId) >= MAX_SESSIONS_PER_USER) {
    sendMessage(ws, {
      type: "error",
      message: `Maximum ${MAX_SESSIONS_PER_USER} concurrent sessions reached.`,
    });
    ws.close();
    return;
  }

  // 3. Get username and optional slug from query params
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const username = url.searchParams.get("username");
  const slug = url.searchParams.get("slug");

  if (!username || !/^[a-zA-Z][a-zA-Z0-9_-]{0,38}[a-zA-Z0-9]$/.test(username)) {
    sendMessage(ws, { type: "error", message: "Invalid username." });
    ws.close();
    return;
  }

  // Instance-scoped dev pod — use PTY with instance kubeconfig
  if (slug) {
    if (!/^[a-z][a-z0-9-]{1,30}[a-z0-9]$/.test(slug)) {
      sendMessage(ws, { type: "error", message: "Invalid instance slug." });
      ws.close();
      return;
    }

    // Verify dev pod ownership with instance scope
    const dpResult = await pool.query(
      `SELECT dp.* FROM dev_pods dp
       WHERE dp.forgejo_username = $1 AND dp.user_id = $2 AND dp.status = 'running' AND dp.instance_slug = $3`,
      [username, user.userId, slug]
    );

    if (dpResult.rows.length === 0) {
      // Check admin access
      const userName = await getUserName(user.userId);
      if (!userName || !(await checkAdminViaForgejo(userName))) {
        sendMessage(ws, { type: "error", message: "Dev pod not found or not running." });
        ws.close();
        return;
      }

      // Admin can access any instance dev pod — verify it exists
      const adminCheck = await pool.query(
        `SELECT dp.* FROM dev_pods dp
         WHERE dp.forgejo_username = $1 AND dp.status = 'running' AND dp.instance_slug = $2`,
        [username, slug]
      );
      if (adminCheck.rows.length === 0) {
        sendMessage(ws, { type: "error", message: "Dev pod not found or not running." });
        ws.close();
        return;
      }
    }

    // Get instance kubeconfig
    const instance = await verifyOwnership(slug, user.userId);
    if (!instance) {
      // Try admin path
      const userName = await getUserName(user.userId);
      const isAdmin = userName ? await checkAdminViaForgejo(userName) : false;
      if (!isAdmin) {
        sendMessage(ws, { type: "error", message: "Instance not found or not ready." });
        ws.close();
        return;
      }

      const adminResult = await pool.query(
        `SELECT kubeconfig, cluster_ip FROM instances WHERE slug = $1 AND status = 'ready'`,
        [slug]
      );
      if (adminResult.rows.length === 0 || !adminResult.rows[0].kubeconfig) {
        sendMessage(ws, { type: "error", message: "Instance not found or not ready." });
        ws.close();
        return;
      }

      return spawnInstanceDevPodPty(ws, user.userId, username, slug, {
        kubeconfig: adminResult.rows[0].kubeconfig,
        clusterIp: adminResult.rows[0].cluster_ip,
      });
    }

    return spawnInstanceDevPodPty(ws, user.userId, username, slug, instance);
  }

  // Host-level dev pod — use K8s exec API directly

  // 4. Verify the user owns this dev pod
  const result = await pool.query(
    `SELECT dp.* FROM dev_pods dp
     WHERE dp.forgejo_username = $1 AND dp.user_id = $2 AND dp.status = 'running' AND dp.instance_slug IS NULL`,
    [username, user.userId]
  );

  if (result.rows.length === 0) {
    sendMessage(ws, {
      type: "error",
      message: "Dev pod not found or not running.",
    });
    ws.close();
    return;
  }

  // 5. Find the running pod name
  // The pod is named by the deployment's replicaset, so we need to find it
  const podName = await findDevPodName(username);
  if (!podName) {
    sendMessage(ws, {
      type: "error",
      message: "Dev pod container not ready yet.",
    });
    ws.close();
    return;
  }

  // 6. Open K8s exec WebSocket
  const namespace = "op-dev-pods";
  const k8sUrl = getK8sExecUrl(namespace, podName);
  const saToken = getServiceAccountToken();
  const caCert = getServiceAccountCA();

  const k8sWs = new WebSocket(k8sUrl, ["v4.channel.k8s.io"], {
    headers: {
      Authorization: `Bearer ${saToken}`,
    },
    rejectUnauthorized: !!caCert,
    ca: caCert,
  });

  k8sWs.on("error", (err) => {
    console.error(`[ws-server] K8s exec WebSocket error for ${username}:`, err.message);
    sendMessage(ws, { type: "error", message: "Failed to connect to dev pod." });
    ws.close();
  });

  k8sWs.on("open", () => {
    console.log(`[ws-server] K8s exec connected for ${username} (pod: ${podName})`);

    const idleTimer = setTimeout(() => {
      sendMessage(ws, {
        type: "error",
        message: "Session closed due to inactivity.",
      });
      ws.close();
    }, IDLE_TIMEOUT_MS);

    const maxTimer = setTimeout(() => {
      sendMessage(ws, {
        type: "error",
        message: "Maximum session duration reached.",
      });
      ws.close();
    }, MAX_SESSION_MS);

    sessions.set(ws, {
      kind: "devpod",
      userId: user.userId,
      username,
      k8sWs,
      idleTimer,
      maxTimer,
    });

    sendMessage(ws, { type: "connected", username });
  });

  // K8s exec WebSocket → browser
  // K8s exec protocol: first byte is channel (0=stdin, 1=stdout, 2=stderr, 3=error, 4=resize)
  k8sWs.on("message", (data: Buffer | string) => {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (buf.length < 1) return;

    const channel = buf[0];
    const payload = buf.subarray(1);

    if (channel === 1 || channel === 2) {
      // stdout or stderr → send as output
      sendMessage(ws, { type: "output", data: payload.toString("utf-8") });
    } else if (channel === 3) {
      // error channel
      const errorMsg = payload.toString("utf-8");
      console.error(`[ws-server] K8s exec error for ${username}:`, errorMsg);
      // Don't close on non-fatal errors, but log them
      try {
        const parsed = JSON.parse(errorMsg);
        if (parsed.status === "Success") {
          // Command completed successfully
          sendMessage(ws, { type: "closed", reason: "Shell exited." });
          ws.close();
        }
      } catch {
        // Not JSON, likely a real error message
      }
    }
  });

  k8sWs.on("close", () => {
    sendMessage(ws, { type: "closed", reason: "Dev pod connection closed." });
    ws.close();
  });

  // Browser → K8s exec WebSocket
  ws.on("message", (raw: Buffer | string) => {
    resetIdleTimer(ws);

    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === "input" && typeof msg.data === "string") {
        // Write to stdin (channel 0)
        const inputBuf = Buffer.from(msg.data, "utf-8");
        const frame = Buffer.alloc(inputBuf.length + 1);
        frame[0] = 0; // channel 0 = stdin
        inputBuf.copy(frame, 1);

        if (k8sWs.readyState === WebSocket.OPEN) {
          k8sWs.send(frame);
        }

        // Update activity timestamp
        pool
          .query(
            `UPDATE dev_pods SET last_activity_at = NOW() WHERE forgejo_username = $1 AND instance_slug IS NULL`,
            [username]
          )
          .catch(() => {});
      } else if (
        msg.type === "resize" &&
        typeof msg.cols === "number" &&
        typeof msg.rows === "number"
      ) {
        // Resize via channel 4
        const cols = Math.max(1, Math.min(500, msg.cols));
        const rows = Math.max(1, Math.min(200, msg.rows));
        const resizePayload = JSON.stringify({
          Width: cols,
          Height: rows,
        });
        const resizeBuf = Buffer.from(resizePayload, "utf-8");
        const frame = Buffer.alloc(resizeBuf.length + 1);
        frame[0] = 4; // channel 4 = resize
        resizeBuf.copy(frame, 1);

        if (k8sWs.readyState === WebSocket.OPEN) {
          k8sWs.send(frame);
        }
      }
    } catch (err) {
      console.error("Failed to parse WebSocket message:", err);
    }
  });

  ws.on("close", () => cleanupSession(ws));
  ws.on("error", () => cleanupSession(ws));
}

/**
 * Spawn a PTY-based kubectl exec session for an instance dev pod.
 * Uses the instance's kubeconfig to connect to the vCluster.
 */
function spawnInstanceDevPodPty(
  ws: WebSocket,
  userId: string,
  username: string,
  slug: string,
  instance: { kubeconfig: string; clusterIp: string | null }
) {
  const sessionId = randomBytes(8).toString("hex");
  const kubeconfigPath = join(tmpdir(), `devpod-${sessionId}.kubeconfig`);
  const kubeconfigContent = prepareKubeconfig(instance.kubeconfig, instance.clusterIp);
  writeFileSync(kubeconfigPath, kubeconfigContent, { mode: 0o600 });

  const ptyProcess = pty.spawn("kubectl", [
    "exec", "-n", "op-dev-pods",
    `deployment/devpod-${username}`, "-c", "dev",
    "-it", "--", "/bin/zsh", "--login",
  ], {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    env: {
      PATH: "/usr/local/bin:/usr/bin:/bin",
      TERM: "xterm-256color",
      KUBECONFIG: kubeconfigPath,
    },
  });

  const idleTimer = setTimeout(() => {
    sendMessage(ws, {
      type: "error",
      message: "Session closed due to inactivity.",
    });
    ws.close();
  }, IDLE_TIMEOUT_MS);

  const maxTimer = setTimeout(() => {
    sendMessage(ws, {
      type: "error",
      message: "Maximum session duration reached.",
    });
    ws.close();
  }, MAX_SESSION_MS);

  sessions.set(ws, {
    kind: "devpod-pty",
    userId,
    username,
    slug,
    ptyProcess,
    kubeconfigPath,
    idleTimer,
    maxTimer,
  });

  ptyProcess.onData((data: string) => {
    sendMessage(ws, { type: "output", data });
  });

  ptyProcess.onExit(() => {
    sendMessage(ws, { type: "closed", reason: "Shell exited." });
    ws.close();
  });

  ws.on("message", (raw: Buffer | string) => {
    resetIdleTimer(ws);
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "input" && typeof msg.data === "string") {
        ptyProcess.write(msg.data);

        // Update activity timestamp
        pool
          .query(
            `UPDATE dev_pods SET last_activity_at = NOW() WHERE forgejo_username = $1 AND instance_slug = $2`,
            [username, slug]
          )
          .catch(() => {});
      } else if (
        msg.type === "resize" &&
        typeof msg.cols === "number" &&
        typeof msg.rows === "number"
      ) {
        ptyProcess.resize(
          Math.max(1, Math.min(500, msg.cols)),
          Math.max(1, Math.min(200, msg.rows))
        );
      }
    } catch (err) {
      console.error("Failed to parse WebSocket message:", err);
    }
  });

  ws.on("close", () => cleanupSession(ws));
  ws.on("error", () => cleanupSession(ws));

  sendMessage(ws, { type: "connected", username, slug });
}

/**
 * Find the actual pod name for a dev pod deployment.
 * Deployment creates pods with names like devpod-{username}-{replicaset-hash}-{pod-hash}.
 */
async function findDevPodName(username: string): Promise<string | null> {
  // Use K8s API directly via HTTPS since we're in-cluster
  const host = process.env.KUBERNETES_SERVICE_HOST || "kubernetes.default.svc";
  const port = process.env.KUBERNETES_SERVICE_PORT || "443";
  const token = getServiceAccountToken();
  const ca = getServiceAccountCA();

  try {
    const url = `https://${host}:${port}/api/v1/namespaces/op-dev-pods/pods?labelSelector=app%3Ddevpod-${encodeURIComponent(username)}`;

    const https = await import("https");
    const response = await new Promise<string>((resolve, reject) => {
      const req = https.get(
        url,
        {
          headers: { Authorization: `Bearer ${token}` },
          ca: ca,
          rejectUnauthorized: !!ca,
        },
        (res) => {
          let data = "";
          res.on("data", (chunk: string) => (data += chunk));
          res.on("end", () => resolve(data));
          res.on("error", reject);
        }
      );
      req.on("error", reject);
    });

    const podList = JSON.parse(response);
    if (!podList.items || podList.items.length === 0) return null;

    // Prefer a Ready pod
    for (const pod of podList.items) {
      const ready = pod.status?.conditions?.some(
        (c: { type: string; status: string }) =>
          c.type === "Ready" && c.status === "True"
      );
      if (ready) return pod.metadata.name;
    }

    // Fall back to any Running pod
    for (const pod of podList.items) {
      if (pod.status?.phase === "Running") return pod.metadata.name;
    }

    return null;
  } catch (err) {
    console.error(`[ws-server] Failed to find dev pod for ${username}:`, err);
    return null;
  }
}

// --- Server setup ---

const server = createServer((_req, res) => {
  res.writeHead(200);
  res.end("ws-server");
});

// Two WebSocket servers sharing the HTTP server (noServer mode)
const terminalWss = new WebSocketServer({ noServer: true });
const devpodWss = new WebSocketServer({ noServer: true });

// Route WebSocket upgrades by path
server.on("upgrade", (req, socket, head) => {
  const pathname = new URL(
    req.url || "/",
    `http://localhost:${PORT}`
  ).pathname;

  if (pathname === "/ws/terminal") {
    terminalWss.handleUpgrade(req, socket, head, (ws) => {
      terminalWss.emit("connection", ws, req);
    });
  } else if (pathname === "/ws/devpod") {
    devpodWss.handleUpgrade(req, socket, head, (ws) => {
      devpodWss.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});

terminalWss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
  try {
    await handleTerminalConnection(ws, req);
  } catch (err) {
    console.error("[ws-server] Terminal connection error:", err);
    sendMessage(ws, { type: "error", message: "Internal server error." });
    ws.close();
  }
});

devpodWss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
  try {
    await handleDevPodConnection(ws, req);
  } catch (err) {
    console.error("[ws-server] DevPod connection error:", err);
    sendMessage(ws, { type: "error", message: "Internal server error." });
    ws.close();
  }
});

server.listen(PORT, () => {
  console.log(`[ws-server] Terminal WebSocket server listening on port ${PORT}`);
  console.log(`[ws-server] Paths: /ws/terminal, /ws/devpod`);
});

// Cleanup on shutdown
function shutdown() {
  for (const [ws] of sessions) {
    cleanupSession(ws);
    ws.close();
  }
  pool.end();
  server.close();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
