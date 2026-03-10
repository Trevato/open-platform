import { WebSocketServer, WebSocket } from "ws";
import { Pool } from "pg";
import * as pty from "node-pty";
import { IncomingMessage } from "http";
import { randomBytes, createHmac } from "crypto";
import { writeFileSync, unlinkSync, existsSync } from "fs";
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

interface Session {
  userId: string;
  slug: string;
  ptyProcess: pty.IPty;
  kubeconfigPath: string;
  idleTimer: ReturnType<typeof setTimeout>;
  maxTimer: ReturnType<typeof setTimeout>;
}

const sessions = new Map<WebSocket, Session>();

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const cookies: Record<string, string> = {};
  for (const pair of header.split(";")) {
    const [key, ...rest] = pair.trim().split("=");
    if (key) cookies[key] = rest.join("=");
  }
  return cookies;
}

/**
 * Verify the HMAC-SHA256 signature on a better-auth signed cookie.
 * Cookie format: {value}.{base64-hmac-sha256-signature}
 * The signature is always 44 base64 characters ending with '='.
 */
function verifySignedCookie(
  rawValue: string,
  secret: string
): string | null {
  const decoded = decodeURIComponent(rawValue);
  const lastDot = decoded.lastIndexOf(".");
  if (lastDot < 1) return null;

  const value = decoded.substring(0, lastDot);
  const signature = decoded.substring(lastDot + 1);

  // better-auth/better-call signatures are 44-char base64 ending with '='
  if (signature.length !== 44 || !signature.endsWith("=")) return null;

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

  // better-auth uses __Secure- prefix when baseURL is https
  const rawToken =
    cookies["__Secure-better-auth.session_token"] ||
    cookies["better-auth.session_token"];

  if (!rawToken) {
    console.log("[ws-server] No session cookie found in request");
    return null;
  }

  // Verify HMAC signature and extract the plain token
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

async function verifyOwnership(
  slug: string,
  userId: string
): Promise<{ kubeconfig: string } | null> {
  const result = await pool.query(
    `SELECT i.kubeconfig
     FROM instances i
     JOIN customers c ON c.id = i.customer_id
     WHERE i.slug = $1 AND c.user_id = $2 AND i.status = 'ready'`,
    [slug, userId]
  );

  if (result.rows.length === 0 || !result.rows[0].kubeconfig) return null;
  return { kubeconfig: result.rows[0].kubeconfig };
}

const MANAGED_DOMAIN = process.env.MANAGED_DOMAIN || "open-platform.sh";

/**
 * Prepare kubeconfig for kubectl in the PTY. Rewrites the server URL to the
 * external domain ({slug}-k8s.{domain}) which routes via Traefik
 * IngressRouteTCP with TLS passthrough. Replaces certificate-authority-data
 * with insecure-skip-tls-verify since vCluster cert SANs don't include the
 * external domain.
 */
function prepareKubeconfig(kubeconfig: string, slug: string): string {
  let prepared = kubeconfig.replace(
    /server:\s*https?:\/\/[^\s]+/,
    `server: https://${slug}-k8s.${MANAGED_DOMAIN}`
  );
  prepared = prepared.replace(
    /\s*certificate-authority-data:\s*[A-Za-z0-9+/=]+\n?/,
    "\n    insecure-skip-tls-verify: true\n"
  );
  return prepared;
}

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

  try {
    session.ptyProcess.kill();
  } catch {}

  try {
    if (existsSync(session.kubeconfigPath)) {
      unlinkSync(session.kubeconfigPath);
    }
  } catch {}

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

const wss = new WebSocketServer({ port: PORT, path: "/ws/terminal" });

wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
  try {
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
    if (!slug || !/^[a-z][a-z0-9-]{1,30}[a-z0-9]$/.test(slug)) {
      sendMessage(ws, { type: "error", message: "Invalid instance slug." });
      ws.close();
      return;
    }

    // 4. Verify ownership and get kubeconfig
    const instance = await verifyOwnership(slug, user.userId);
    if (!instance) {
      sendMessage(ws, {
        type: "error",
        message: "Instance not found or not ready.",
      });
      ws.close();
      return;
    }

    // 5. Write kubeconfig to temp file
    const sessionId = randomBytes(8).toString("hex");
    const kubeconfigPath = join(tmpdir(), `term-${sessionId}.kubeconfig`);
    const kubeconfigContent = prepareKubeconfig(instance.kubeconfig, slug);
    writeFileSync(kubeconfigPath, kubeconfigContent, { mode: 0o600 });

    // 6. Spawn PTY
    const ptyProcess = pty.spawn("/bin/zsh", ["--login"], {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      env: {
        KUBECONFIG: kubeconfigPath,
        PATH: "/usr/local/bin:/usr/bin:/bin",
        TERM: "xterm-256color",
        HOME: "/tmp",
        ZDOTDIR: "/app/scripts",
        SHELL: "/bin/zsh",
        LANG: "C.UTF-8",
      },
    });

    // 7. Set up session tracking
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
      userId: user.userId,
      slug,
      ptyProcess,
      kubeconfigPath,
      idleTimer,
      maxTimer,
    });

    // 8. Wire up I/O
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
      } catch {}
    });

    ws.on("close", () => cleanupSession(ws));
    ws.on("error", () => cleanupSession(ws));

    sendMessage(ws, { type: "connected", slug });
  } catch (err) {
    console.error("[ws-server] Connection error:", err);
    sendMessage(ws, { type: "error", message: "Internal server error." });
    ws.close();
  }
});

// Cleanup on shutdown
function shutdown() {
  for (const [ws] of sessions) {
    cleanupSession(ws);
    ws.close();
  }
  pool.end();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

console.log(`[ws-server] Terminal WebSocket server listening on port ${PORT}`);
