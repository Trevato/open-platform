"use client";

interface Props {
  initialConfig: { domain: string; servicePrefix: string } | null;
}

export function SettingsEditor({ initialConfig }: Props) {
  if (!initialConfig) {
    return (
      <div className="section">
        <div className="card">
          <div
            className="card-body"
            style={{ padding: "24px", textAlign: "center" }}
          >
            <p className="text-muted">Platform config API not available.</p>
            <p className="text-sm text-muted" style={{ marginTop: 8 }}>
              The config API requires op-api to be deployed and running.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="section">
      <div className="section-header">Platform</div>
      <div className="card">
        <div
          className="card-body"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            padding: "16px 20px",
          }}
        >
          <InfoRow label="Domain" value={initialConfig.domain} />
          <InfoRow
            label="Service Prefix"
            value={initialConfig.servicePrefix || "none"}
            muted={!initialConfig.servicePrefix}
          />
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
        padding: "8px 0",
      }}
    >
      <span className="text-sm text-muted" style={{ flexShrink: 0 }}>
        {label}
      </span>
      <code
        style={{
          fontFamily:
            "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
          fontSize: 13,
          color: muted ? "var(--text-muted)" : "var(--text-primary)",
        }}
      >
        {value}
      </code>
    </div>
  );
}
