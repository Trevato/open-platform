import { redirect } from "next/navigation";
import { getSessionWithRole } from "@/lib/session-role";
import { CopyButton } from "@/app/components/copy-button";

function ExternalLinkIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 17l9.2-9.2M17 17V7H7" />
    </svg>
  );
}

function getServiceUrls(domain: string, prefix: string) {
  return [
    { name: "Forgejo", label: "Git & identity", url: `${prefix}forgejo.${domain}` },
    { name: "CI/CD", label: "Woodpecker", url: `${prefix}ci.${domain}` },
    { name: "Dashboard", label: "Headlamp", url: `${prefix}headlamp.${domain}` },
    { name: "Storage", label: "MinIO console", url: `${prefix}minio.${domain}` },
    { name: "S3 API", label: "MinIO S3", url: `${prefix}s3.${domain}` },
    { name: "Console", label: "This app", url: `${prefix}console.${domain}` },
  ];
}

const commands = [
  { label: "Switch kubectl context", command: "kubectl config use-context default" },
  { label: "Deploy platform", command: "make deploy" },
  { label: "Check status", command: "make status" },
  { label: "Preview changes", command: "make diff" },
  { label: "Show all URLs", command: "make urls" },
];

export default async function PlatformSettingsPage() {
  const result = await getSessionWithRole();
  if (!result || result.role !== "admin") redirect("/dashboard");

  const domain = process.env.PLATFORM_DOMAIN ?? "localhost";
  const prefix = process.env.SERVICE_PREFIX ?? "";
  const forgejoUrl = process.env.AUTH_FORGEJO_URL ?? "";
  const services = getServiceUrls(domain, prefix);

  return (
    <div className="container" style={{ maxWidth: 640 }}>
      <h1
        style={{
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          marginBottom: 32,
        }}
      >
        Platform Settings
      </h1>

      {/* Platform Info */}
      <div className="section">
        <div className="section-header">Platform Info</div>
        <div className="card">
          <div className="settings-section">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <InfoRow label="Domain" value={domain} />
              <InfoRow label="Service prefix" value={prefix || "none"} muted={!prefix} />
              <InfoRow label="Forgejo" value={forgejoUrl.replace(/^https?:\/\//, "")} />
              <InfoRow label="Mode" value="Self-hosted" />
            </div>
          </div>
        </div>
      </div>

      {/* Service URLs */}
      <div className="section">
        <div className="section-header">Service URLs</div>
        <div className="card">
          <div className="settings-section">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {services.map((service) => (
                <div
                  key={service.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "10px 14px",
                    background: "var(--bg-inset)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-input)",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>
                      {service.name}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {service.label}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                    <code
                      style={{
                        fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
                        fontSize: 12,
                        color: "var(--text-secondary)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {service.url}
                    </code>
                    <CopyButton text={`https://${service.url}`} title={`Copy ${service.name} URL`} />
                    <a
                      href={`https://${service.url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-icon"
                      title={`Open ${service.name}`}
                      style={{ color: "var(--text-muted)" }}
                    >
                      <ExternalLinkIcon />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Commands */}
      <div className="section">
        <div className="section-header">Quick Commands</div>
        <div className="card">
          <div className="settings-section">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {commands.map((cmd) => (
                <div
                  key={cmd.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    background: "var(--bg-inset)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-input)",
                    padding: "8px 12px",
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--text-muted)",
                      flexShrink: 0,
                      minWidth: 120,
                    }}
                  >
                    {cmd.label}
                  </span>
                  <code
                    style={{
                      flex: 1,
                      fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
                      fontSize: 13,
                      color: "var(--text-primary)",
                      overflowX: "auto",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {cmd.command}
                  </code>
                  <CopyButton text={cmd.command} title={`Copy: ${cmd.command}`} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 14px",
        background: "var(--bg-inset)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-input)",
      }}
    >
      <span
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: "var(--text-muted)",
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <code
        style={{
          fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
          fontSize: 13,
          color: muted ? "var(--text-muted)" : "var(--text-primary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </code>
    </div>
  );
}
