/**
 * Platform configuration service.
 *
 * Reads and writes platform config by committing files to the
 * system/open-platform Forgejo repo. Flux reconciles changes.
 */

const FORGEJO_URL =
  process.env.FORGEJO_INTERNAL_URL || process.env.FORGEJO_URL || "";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlatformConfig {
  domain: string;
  servicePrefix: string;
  tls: { mode: "selfsigned" | "letsencrypt" | "cloudflare" };
  network: {
    mode: "host" | "loadbalancer";
    traefikIp?: string;
    addressPool?: string;
    interface?: string;
  };
  services: {
    jitsi: { enabled: boolean };
    zulip: { enabled: boolean };
    mailpit: { enabled: boolean };
  };
}

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

interface FileOp {
  operation: "create" | "update" | "delete";
  path: string;
  content?: string;
  sha?: string;
}

// ---------------------------------------------------------------------------
// Service YAML templates
// ---------------------------------------------------------------------------

const JITSI_TEMPLATE = `apiVersion: source.toolkit.fluxcd.io/v1
kind: HelmRepository
metadata:
  name: jitsi
  namespace: flux-system
spec:
  interval: 24h
  url: https://jitsi-contrib.github.io/jitsi-helm/
---
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: jitsi
  namespace: jitsi
spec:
  interval: 15m
  timeout: 10m
  chart:
    spec:
      chart: jitsi-meet
      version: "2.13.1"
      sourceRef:
        kind: HelmRepository
        name: jitsi
        namespace: flux-system
  install:
    createNamespace: true
  upgrade:
    remediation:
      remediateLastFailure: true
      retries: 3
  values:
    publicURL: "https://\${SERVICE_PREFIX}meet.\${DOMAIN}"
    enableAuth: true
    enableGuests: true
    extraCommonEnvs:
      AUTH_TYPE: jwt
      JWT_APP_ID: "jitsi"
    web:
      ingress:
        enabled: true
        ingressClassName: traefik
        hosts:
          - host: \${SERVICE_PREFIX}meet.\${DOMAIN}
            paths: ["/"]
      extraEnvs:
        TOKEN_AUTH_URL: "https://\${SERVICE_PREFIX}meet-auth.\${DOMAIN}/room/{room}"
      extraContainers:
        - name: jitsi-oidc
          image: ghcr.io/marcelcoding/jitsi-openid:latest
          imagePullPolicy: Always
          ports:
            - name: http
              containerPort: 3000
          env:
            - name: JITSI_SECRET
              valueFrom:
                secretKeyRef:
                  name: jitsi-secrets
                  key: JWT_APP_SECRET
            - name: JITSI_URL
              value: "https://\${SERVICE_PREFIX}meet.\${DOMAIN}"
            - name: JITSI_SUB
              value: "\${SERVICE_PREFIX}meet.\${DOMAIN}"
            - name: ISSUER_URL
              value: "https://\${SERVICE_PREFIX}forgejo.\${DOMAIN}"
            - name: BASE_URL
              value: "https://\${SERVICE_PREFIX}meet-auth.\${DOMAIN}"
            - name: CLIENT_ID
              valueFrom:
                secretKeyRef:
                  name: jitsi-oidc
                  key: client-id
            - name: CLIENT_SECRET
              valueFrom:
                secretKeyRef:
                  name: jitsi-oidc
                  key: client-secret
            - name: VERIFY_ACCESS_TOKEN_HASH
              value: "false"
          resources:
            requests:
              cpu: 25m
              memory: 32Mi
            limits:
              cpu: 200m
              memory: 128Mi
      resources:
        requests:
          memory: 256Mi
          cpu: 100m
        limits:
          memory: 512Mi
    prosody:
      jwt:
        existingSecretName: jitsi-secrets
      persistence:
        enabled: true
        size: 5Gi
    jicofo:
      resources:
        requests:
          memory: 256Mi
          cpu: 100m
        limits:
          memory: 512Mi
    jvb:
      replicaCount: 1
      useNodeIP: true
      stunServers: "stun.l.google.com:19302"
      UDPPort: 10000
      service:
        enabled: true
        type: NodePort
        nodePort: 10000
      resources:
        requests:
          memory: 512Mi
          cpu: 500m
        limits:
          memory: 2Gi
          cpu: "2"
---
apiVersion: v1
kind: Service
metadata:
  name: jitsi-oidc
  namespace: jitsi
spec:
  selector:
    app.kubernetes.io/name: jitsi-meet
    app.kubernetes.io/component: web
    app.kubernetes.io/instance: jitsi
  ports:
    - port: 80
      targetPort: 3000
      protocol: TCP
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: jitsi-oidc
  namespace: jitsi
spec:
  ingressClassName: traefik
  rules:
    - host: \${SERVICE_PREFIX}meet-auth.\${DOMAIN}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: jitsi-oidc
                port:
                  number: 80
`;

const ZULIP_TEMPLATE = `apiVersion: source.toolkit.fluxcd.io/v1
kind: HelmRepository
metadata:
  name: zulip
  namespace: flux-system
spec:
  type: oci
  interval: 24h
  url: oci://ghcr.io/zulip/helm-charts
---
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: zulip
  namespace: zulip
spec:
  interval: 15m
  timeout: 10m
  chart:
    spec:
      chart: zulip
      version: "1.11.57"
      sourceRef:
        kind: HelmRepository
        name: zulip
        namespace: flux-system
  install:
    createNamespace: true
  upgrade:
    remediation:
      remediateLastFailure: true
      retries: 3
  values:
    ingress:
      enabled: true
      className: traefik
      hosts:
        - host: \${SERVICE_PREFIX}chat.\${DOMAIN}
          paths:
            - path: /
    resources:
      requests:
        memory: 1Gi
        cpu: 500m
      limits:
        memory: 2Gi
        cpu: "2"
    zulip:
      environment:
        SETTING_EXTERNAL_HOST: "\${SERVICE_PREFIX}chat.\${DOMAIN}"
        SETTING_ZULIP_ADMINISTRATOR: "\${ADMIN_EMAIL}"
        DISABLE_HTTPS: "true"
        SSL_CERTIFICATE_GENERATION: "self-signed"
        SETTING_SECURE_PROXY_SSL_HEADER: "('HTTP_X_FORWARDED_PROTO', 'https')"
        SETTING_CSRF_TRUSTED_ORIGINS: '["https://\${SERVICE_PREFIX}chat.\${DOMAIN}"]'
        SETTING_SOCIAL_AUTH_REDIRECT_IS_HTTPS: "True"
        SETTING_EMAIL_HOST: "\${SMTP_HOST}"
        SETTING_EMAIL_HOST_PORT: "\${SMTP_PORT}"
        SETTING_EMAIL_USE_TLS: "false"
        SETTING_DEFAULT_FROM_EMAIL: "zulip@\${DOMAIN}"
        SETTING_NOREPLY_EMAIL_ADDRESS: "noreply@\${DOMAIN}"
        ZULIP_AUTH_BACKENDS: "GenericOpenIdConnectBackend"
        SETTING_SOCIAL_AUTH_OIDC_PKCE_ENABLED: "False"
        SETTING_INVITATION_REQUIRED: "False"
        OIDC_CLIENT_ID:
          valueFrom:
            secretKeyRef:
              name: zulip-secrets
              key: oidc-client-id
        OIDC_CLIENT_SECRET:
          valueFrom:
            secretKeyRef:
              name: zulip-secrets
              key: oidc-client-secret
        SETTING_SOCIAL_AUTH_OIDC_ENABLED_IDPS: >-
          {"forgejo":{"oidc_url":"https://\${SERVICE_PREFIX}forgejo.\${DOMAIN}","display_name":"Forgejo","display_icon":None,"auto_signup":True,"client_id":"$(OIDC_CLIENT_ID)","secret":"$(OIDC_CLIENT_SECRET)"}}
      persistence:
        enabled: true
        size: 10Gi
    postgresql:
      enabled: false
    externalPostgresql:
      host: "postgres-rw.postgres.svc.cluster.local"
      port: 5432
      database: "zulip"
      user: "zulip"
      password:
        valueFrom:
          secretKeyRef:
            name: zulip-db-credentials
            key: password
    rabbitmq:
      enabled: true
      auth:
        username: zulip
        password: "\${ZULIP_RABBITMQ_PASSWORD}"
      persistence:
        enabled: false
      resources:
        requests:
          memory: 128Mi
          cpu: 50m
        limits:
          memory: 512Mi
    memcached:
      enabled: true
      resources:
        requests:
          memory: 64Mi
          cpu: 25m
        limits:
          memory: 256Mi
    redis:
      enabled: true
      architecture: standalone
      auth:
        enabled: false
      master:
        resources:
          requests:
            memory: 64Mi
            cpu: 25m
          limits:
            memory: 256Mi
`;

const SERVICE_TEMPLATES: Record<string, string> = {
  jitsi: JITSI_TEMPLATE,
  zulip: ZULIP_TEMPLATE,
};

const NAMESPACE_YAML: Record<string, string> = {
  jitsi: `apiVersion: v1
kind: Namespace
metadata:
  name: jitsi
`,
  zulip: `apiVersion: v1
kind: Namespace
metadata:
  name: zulip
`,
};

// ---------------------------------------------------------------------------
// Config serialization (JSON — internal state file, not user-facing)
// ---------------------------------------------------------------------------

function defaultConfig(): PlatformConfig {
  return {
    domain: process.env.PLATFORM_DOMAIN || "localhost",
    servicePrefix: process.env.SERVICE_PREFIX || "",
    tls: {
      mode:
        (process.env.TLS_MODE as PlatformConfig["tls"]["mode"]) || "selfsigned",
    },
    network: { mode: "host" },
    services: {
      jitsi: { enabled: false },
      zulip: { enabled: false },
      mailpit: { enabled: true },
    },
  };
}

// ---------------------------------------------------------------------------
// Deep merge utility
// ---------------------------------------------------------------------------

function deepMerge(
  target: Record<string, any>,
  patch: Record<string, any>,
): Record<string, any> {
  const result = { ...target };
  for (const key of Object.keys(patch)) {
    const val = patch[key];
    if (
      val !== null &&
      val !== undefined &&
      typeof val === "object" &&
      !Array.isArray(val) &&
      typeof result[key] === "object" &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(result[key], val);
    } else if (val !== undefined) {
      result[key] = val;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class PlatformConfigService {
  private owner = "system";
  private repo = "open-platform";

  constructor(private token: string) {}

  // ---- Public API ---------------------------------------------------------

  async getConfig(): Promise<PlatformConfig> {
    const file = await this.getFileContent("config.json");
    if (file) {
      try {
        return JSON.parse(file.content) as PlatformConfig;
      } catch {
        // Corrupt file — fall through to defaults
      }
    }

    // Derive from env + probe repo for enabled services
    const config = defaultConfig();
    const [jitsiSha, zulipSha, mailpitSha] = await Promise.all([
      this.getFileSha("apps/jitsi.yaml"),
      this.getFileSha("apps/zulip.yaml"),
      this.getFileSha("apps/mailpit.yaml"),
    ]);
    config.services.jitsi.enabled = jitsiSha !== null;
    config.services.zulip.enabled = zulipSha !== null;
    config.services.mailpit.enabled = mailpitSha !== null;

    return config;
  }

  async updateConfig(
    patch: DeepPartial<PlatformConfig>,
  ): Promise<{ changes: string[] }> {
    const current = await this.getConfig();
    const updated = deepMerge(
      current as unknown as Record<string, any>,
      patch as unknown as Record<string, any>,
    ) as unknown as PlatformConfig;
    const changes: string[] = [];
    const fileOps: FileOp[] = [];

    // Service toggles (only services with templates are toggleable)
    const toggles: Array<"jitsi" | "zulip"> = ["jitsi", "zulip"];
    for (const svc of toggles) {
      const was = current.services[svc].enabled;
      const now = updated.services[svc].enabled;
      if (was !== now) {
        const ops = await this.toggleService(svc, now, updated);
        fileOps.push(...ops);
        changes.push(`${svc}: ${was ? "disabled" : "enabled"}`);
      }
    }

    // Track non-service config changes
    if (current.domain !== updated.domain) {
      changes.push(`domain: ${current.domain} -> ${updated.domain}`);
    }
    if (current.servicePrefix !== updated.servicePrefix) {
      changes.push(
        `servicePrefix: "${current.servicePrefix}" -> "${updated.servicePrefix}"`,
      );
    }
    if (current.tls.mode !== updated.tls.mode) {
      changes.push(`tls.mode: ${current.tls.mode} -> ${updated.tls.mode}`);
    }
    if (current.network.mode !== updated.network.mode) {
      changes.push(
        `network.mode: ${current.network.mode} -> ${updated.network.mode}`,
      );
    }

    if (changes.length === 0) {
      return { changes: [] };
    }

    // Persist config.json alongside other changes
    const configSha = await this.getFileSha("config.json");
    fileOps.push({
      operation: configSha ? "update" : "create",
      path: "config.json",
      content: JSON.stringify(updated, null, 2) + "\n",
      ...(configSha ? { sha: configSha } : {}),
    });

    const summary = changes.length > 0 ? changes.join(", ") : "update config";
    await this.commitFiles(`platform: ${summary}`, fileOps);

    return { changes };
  }

  // ---- Forgejo API helpers ------------------------------------------------

  private headers(): HeadersInit {
    return {
      Authorization: `token ${this.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  private async getFileContent(
    path: string,
  ): Promise<{ content: string; sha: string } | null> {
    try {
      const resp = await fetch(
        `${FORGEJO_URL}/api/v1/repos/${this.owner}/${this.repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`,
        { headers: this.headers() },
      );
      if (!resp.ok) return null;
      const data = (await resp.json()) as { content: string; sha: string };
      return {
        content: Buffer.from(data.content, "base64").toString("utf-8"),
        sha: data.sha,
      };
    } catch {
      return null;
    }
  }

  private async getFileSha(path: string): Promise<string | null> {
    try {
      const resp = await fetch(
        `${FORGEJO_URL}/api/v1/repos/${this.owner}/${this.repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`,
        { headers: this.headers() },
      );
      if (!resp.ok) return null;
      const data = (await resp.json()) as { sha: string };
      return data.sha || null;
    } catch {
      return null;
    }
  }

  private async commitFiles(message: string, files: FileOp[]): Promise<void> {
    const encoded = files.map((f) => ({
      operation: f.operation,
      path: f.path,
      content: f.content
        ? Buffer.from(f.content).toString("base64")
        : undefined,
      sha: f.sha,
    }));

    const resp = await fetch(
      `${FORGEJO_URL}/api/v1/repos/${this.owner}/${this.repo}/contents`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          message,
          branch: "main",
          files: encoded,
        }),
      },
    );

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(
        `Forgejo multi-file commit failed (${resp.status}): ${body}`,
      );
    }
  }

  // ---- Service toggle logic -----------------------------------------------

  private async toggleService(
    service: "jitsi" | "zulip" | "mailpit",
    enabled: boolean,
    config: PlatformConfig,
  ): Promise<FileOp[]> {
    const files: FileOp[] = [];
    const helmPath = `apps/${service}.yaml`;

    if (enabled) {
      const yaml = this.generateServiceYaml(service, config);
      if (yaml) {
        const existing = await this.getFileSha(helmPath);
        files.push({
          operation: existing ? "update" : "create",
          path: helmPath,
          content: yaml,
          ...(existing ? { sha: existing } : {}),
        });
      }

      const kustomOps = await this.addToKustomization(
        "apps/kustomization.yaml",
        `${service}.yaml`,
      );
      files.push(...kustomOps);

      const nsOps = await this.addNamespace(service);
      files.push(...nsOps);
    } else {
      const sha = await this.getFileSha(helmPath);
      if (sha) {
        files.push({ operation: "delete", path: helmPath, sha });
      }

      const kustomOps = await this.removeFromKustomization(
        "apps/kustomization.yaml",
        `${service}.yaml`,
      );
      files.push(...kustomOps);

      // Don't delete namespace — Flux prune handles resource cleanup
    }

    return files;
  }

  private generateServiceYaml(
    service: string,
    config: PlatformConfig,
  ): string | null {
    const template = SERVICE_TEMPLATES[service];
    if (!template) return null;

    const rabbitmqPassword = crypto.randomUUID().replace(/-/g, "");

    return template
      .replace(/\$\{DOMAIN\}/g, config.domain)
      .replace(/\$\{SERVICE_PREFIX\}/g, config.servicePrefix)
      .replace(/\$\{ADMIN_EMAIL\}/g, `admin@${config.domain}`)
      .replace(/\$\{SMTP_HOST\}/g, "mailpit-smtp.mailpit.svc.cluster.local")
      .replace(/\$\{SMTP_PORT\}/g, "25")
      .replace(/\$\{ZULIP_RABBITMQ_PASSWORD\}/g, rabbitmqPassword);
  }

  // ---- Kustomization management -------------------------------------------

  private async addToKustomization(
    kustomPath: string,
    resourceFile: string,
  ): Promise<FileOp[]> {
    const existing = await this.getFileContent(kustomPath);
    if (!existing) return [];
    if (existing.content.includes(`- ${resourceFile}`)) return [];

    const lines = existing.content.split("\n");
    const resourceIdx = lines.findIndex((l) => l.trim() === "resources:");
    if (resourceIdx === -1) return [];

    // Insert alphabetically among existing resources
    let insertIdx = resourceIdx + 1;
    while (insertIdx < lines.length && /^\s+-\s/.test(lines[insertIdx])) {
      const current = lines[insertIdx].replace(/^\s+-\s+/, "");
      if (current > resourceFile) break;
      insertIdx++;
    }
    lines.splice(insertIdx, 0, `  - ${resourceFile}`);

    return [
      {
        operation: "update" as const,
        path: kustomPath,
        content: lines.join("\n"),
        sha: existing.sha,
      },
    ];
  }

  private async removeFromKustomization(
    kustomPath: string,
    resourceFile: string,
  ): Promise<FileOp[]> {
    const existing = await this.getFileContent(kustomPath);
    if (!existing) return [];

    const lines = existing.content.split("\n");
    const filtered = lines.filter((l) => l.trim() !== `- ${resourceFile}`);
    if (filtered.length === lines.length) return [];

    return [
      {
        operation: "update" as const,
        path: kustomPath,
        content: filtered.join("\n"),
        sha: existing.sha,
      },
    ];
  }

  // ---- Namespace management -----------------------------------------------

  private async addNamespace(service: string): Promise<FileOp[]> {
    const nsYaml = NAMESPACE_YAML[service];
    if (!nsYaml) return [];

    const nsPath = `infrastructure/configs/namespaces.yaml`;
    const existing = await this.getFileContent(nsPath);

    if (!existing) {
      // File doesn't exist — create with just this namespace
      return [
        {
          operation: "create" as const,
          path: nsPath,
          content: nsYaml,
        },
      ];
    }

    // Already contains this namespace
    if (existing.content.includes(`name: ${service}`)) return [];

    // Append the new namespace document
    const separator = existing.content.endsWith("\n") ? "---\n" : "\n---\n";
    return [
      {
        operation: "update" as const,
        path: nsPath,
        content: existing.content + separator + nsYaml,
        sha: existing.sha,
      },
    ];
  }
}
