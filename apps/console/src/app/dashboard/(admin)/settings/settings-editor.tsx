"use client";

import { useState, useCallback } from "react";
import { ServiceToggle } from "@/app/components/service-toggle";

interface PlatformConfig {
  domain: string;
  servicePrefix: string;
  tls: { mode: string };
  network: {
    mode: string;
    traefikIp?: string;
    addressPool?: string;
    interface?: string;
  };
  services: {
    jitsi: { enabled: boolean };
    zulip: { enabled: boolean };
    mailpit: { enabled: boolean };
    pgadmin: { enabled: boolean };
  };
}

interface Props {
  initialConfig: PlatformConfig | null;
  domain: string;
  prefix: string;
}

export function SettingsEditor({ initialConfig, domain, prefix }: Props) {
  const [config, setConfig] = useState<PlatformConfig | null>(initialConfig);
  const [saving, setSaving] = useState<string | null>(null);
  const [lastChange, setLastChange] = useState<string | null>(null);

  // Network state
  const [networkMode, setNetworkMode] = useState(
    config?.network.mode ?? "host",
  );
  const [traefikIp, setTraefikIp] = useState(config?.network.traefikIp ?? "");
  const [addressPool, setAddressPool] = useState(
    config?.network.addressPool ?? "",
  );
  const [networkInterface, setNetworkInterface] = useState(
    config?.network.interface ?? "",
  );

  // TLS state
  const [tlsMode, setTlsMode] = useState(config?.tls.mode ?? "selfsigned");

  const patchConfig = useCallback(async (patch: Record<string, unknown>) => {
    const res = await fetch("/api/platform/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(err);
    }
    const data = await res.json();
    // Refresh config and sync local state
    const configRes = await fetch("/api/platform/config");
    if (configRes.ok) {
      const configData = await configRes.json();
      const c = configData.config;
      setConfig(c);
      setNetworkMode(c.network.mode);
      setTraefikIp(c.network.traefikIp ?? "");
      setAddressPool(c.network.addressPool ?? "");
      setNetworkInterface(c.network.interface ?? "");
      setTlsMode(c.tls.mode);
    }
    return data;
  }, []);

  const handleServiceToggle = useCallback(
    async (service: string, enabled: boolean) => {
      setSaving(service);
      try {
        const result = await patchConfig({
          services: { [service]: { enabled } },
        });
        setLastChange(
          result.changes?.[0] ||
            `${service} ${enabled ? "enabled" : "disabled"}`,
        );
      } finally {
        setSaving(null);
      }
    },
    [patchConfig],
  );

  const handleNetworkApply = useCallback(async () => {
    setSaving("network");
    try {
      const patch: Record<string, unknown> = { network: { mode: networkMode } };
      if (networkMode === "loadbalancer") {
        (patch.network as Record<string, unknown>).traefikIp = traefikIp;
        (patch.network as Record<string, unknown>).addressPool = addressPool;
        (patch.network as Record<string, unknown>).interface = networkInterface;
      }
      const result = await patchConfig(patch);
      setLastChange(result.changes?.[0] || "Network updated");
    } finally {
      setSaving(null);
    }
  }, [patchConfig, networkMode, traefikIp, addressPool, networkInterface]);

  const handleTlsApply = useCallback(async () => {
    setSaving("tls");
    try {
      const result = await patchConfig({ tls: { mode: tlsMode } });
      setLastChange(result.changes?.[0] || "TLS updated");
    } finally {
      setSaving(null);
    }
  }, [patchConfig, tlsMode]);

  if (!config) {
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
    <>
      {/* Status banner */}
      {lastChange && (
        <div
          style={{
            padding: "10px 14px",
            marginBottom: 24,
            borderRadius: "var(--radius-input)",
            background: "var(--bg-inset)",
            border: "1px solid var(--border)",
            fontSize: 13,
            color: "var(--text-secondary)",
          }}
        >
          Applied: {lastChange}. Flux will reconcile within ~1 minute.
        </div>
      )}

      {/* Platform Info */}
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
            <InfoRow label="Domain" value={config.domain} />
            <InfoRow
              label="Service Prefix"
              value={config.servicePrefix || "none"}
              muted={!config.servicePrefix}
            />
          </div>
        </div>
      </div>

      {/* Networking */}
      <div className="section">
        <div className="section-header">Networking</div>
        <div className="card">
          <div
            className="card-body"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
              padding: "16px 20px",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <RadioOption
                name="network"
                value="host"
                checked={networkMode === "host"}
                onChange={() => setNetworkMode("host")}
                label="Host Network"
                description="Traefik binds directly to node ports 80/443. Simplest setup."
              />
              <RadioOption
                name="network"
                value="loadbalancer"
                checked={networkMode === "loadbalancer"}
                onChange={() => setNetworkMode("loadbalancer")}
                label="Load Balancer"
                description="MetalLB assigns a dedicated IP. Required for multi-node clusters."
              />
            </div>

            {networkMode === "loadbalancer" && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  paddingLeft: 28,
                }}
              >
                <InputField
                  label="Traefik IP"
                  value={traefikIp}
                  onChange={setTraefikIp}
                  placeholder="10.0.16.10"
                />
                <InputField
                  label="Address Pool"
                  value={addressPool}
                  onChange={setAddressPool}
                  placeholder="10.0.16.0/24"
                />
                <InputField
                  label="Interface"
                  value={networkInterface}
                  onChange={setNetworkInterface}
                  placeholder="eno3"
                />
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                className="btn btn-primary"
                onClick={handleNetworkApply}
                disabled={saving === "network"}
                style={{ fontSize: 13, padding: "6px 16px" }}
              >
                {saving === "network" ? "Applying..." : "Apply Changes"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* TLS */}
      <div className="section">
        <div className="section-header">TLS</div>
        <div className="card">
          <div
            className="card-body"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
              padding: "16px 20px",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <RadioOption
                name="tls"
                value="selfsigned"
                checked={tlsMode === "selfsigned"}
                onChange={() => setTlsMode("selfsigned")}
                label="Self-Signed"
                description="Auto-generated CA. Browsers will show a warning."
              />
              <RadioOption
                name="tls"
                value="letsencrypt"
                checked={tlsMode === "letsencrypt"}
                onChange={() => setTlsMode("letsencrypt")}
                label="Let's Encrypt"
                description="Real certificates via cert-manager. Requires public DNS."
              />
              <RadioOption
                name="tls"
                value="cloudflare"
                checked={tlsMode === "cloudflare"}
                onChange={() => setTlsMode("cloudflare")}
                label="Cloudflare Tunnel"
                description="TLS at Cloudflare edge. Self-signed in-cluster."
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                className="btn btn-primary"
                onClick={handleTlsApply}
                disabled={saving === "tls"}
                style={{ fontSize: 13, padding: "6px 16px" }}
              >
                {saving === "tls" ? "Applying..." : "Apply Changes"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Services */}
      <div className="section">
        <div className="section-header">Services</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <ServiceToggle
            name="Jitsi Meet"
            description="Video conferencing"
            enabled={config.services.jitsi.enabled}
            onToggle={(enabled) => handleServiceToggle("jitsi", enabled)}
          />
          <ServiceToggle
            name="Zulip"
            description="Team messaging"
            enabled={config.services.zulip.enabled}
            onToggle={(enabled) => handleServiceToggle("zulip", enabled)}
          />
          <ServiceToggle
            name="pgAdmin"
            description="Database management"
            enabled={config.services.pgadmin.enabled}
            onToggle={(enabled) => handleServiceToggle("pgadmin", enabled)}
          />
        </div>
      </div>

      {/* Service URLs */}
      <div className="section">
        <div className="section-header">Service URLs</div>
        <div className="card">
          <div
            className="card-body"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              padding: "16px 20px",
            }}
          >
            <UrlRow name="Console" url={`${prefix}console.${domain}`} />
            <UrlRow name="Forgejo" url={`${prefix}forgejo.${domain}`} />
            <UrlRow name="CI/CD" url={`${prefix}ci.${domain}`} />
            <UrlRow name="Dashboard" url={`${prefix}headlamp.${domain}`} />
            <UrlRow name="Storage" url={`${prefix}minio.${domain}`} />
            {config.services.jitsi.enabled && (
              <UrlRow name="Meet" url={`${prefix}meet.${domain}`} />
            )}
            {config.services.zulip.enabled && (
              <UrlRow name="Chat" url={`${prefix}chat.${domain}`} />
            )}
            {config.services.mailpit.enabled && (
              <UrlRow name="Mail" url={`${prefix}mail.${domain}`} />
            )}
            {config.services.pgadmin.enabled && (
              <UrlRow name="Database" url={`${prefix}db.${domain}`} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// Helper components

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

function RadioOption({
  name,
  value,
  checked,
  onChange,
  label,
  description,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  description: string;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        cursor: "pointer",
      }}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        style={{ marginTop: 3, accentColor: "var(--accent)" }}
      />
      <div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
        <div className="text-xs text-muted">{description}</div>
      </div>
    </label>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <label
        className="text-xs text-muted"
        style={{ minWidth: 90, flexShrink: 0 }}
      >
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          flex: 1,
          fontSize: 13,
          padding: "6px 10px",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-input)",
          background: "var(--bg-inset)",
          color: "var(--text-primary)",
          fontFamily:
            "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
        }}
      />
    </div>
  );
}

function UrlRow({ name, url }: { name: string; url: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "6px 0",
      }}
    >
      <span className="text-sm" style={{ fontWeight: 500, flexShrink: 0 }}>
        {name}
      </span>
      <a
        href={`https://${url}`}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          fontSize: 12,
          color: "var(--accent)",
          fontFamily:
            "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
        }}
      >
        {url}
      </a>
    </div>
  );
}
