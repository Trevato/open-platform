"use client";

import { useState, useCallback } from "react";

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
}

interface NodeInfo {
  name: string;
  status: "Ready" | "NotReady";
  role: string;
  schedulable: boolean;
  labels: Record<string, string>;
  capacity: { cpu: string; memory: string };
  allocatable: { cpu: string; memory: string };
  podCount: number;
  internalIp: string;
  kubeletVersion: string;
}

interface Props {
  initialConfig: PlatformConfig | null;
  initialNodes: NodeInfo[] | null;
}

function formatMemory(ki: string): string {
  const num = parseInt(ki.replace(/Ki$/, ""));
  if (isNaN(num)) return "—";
  const bytes = num * 1024;
  const gb = bytes / 1024 ** 3;
  return gb >= 1
    ? `${gb.toFixed(1)} GB`
    : `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

export function SettingsEditor({ initialConfig, initialNodes }: Props) {
  const [config, setConfig] = useState<PlatformConfig | null>(initialConfig);
  const [saving, setSaving] = useState<string | null>(null);
  const [lastChange, setLastChange] = useState<string | null>(null);

  // Node state
  const [nodes, setNodes] = useState<NodeInfo[] | null>(initialNodes);
  const [showJoinInfo, setShowJoinInfo] = useState(false);

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

  const refreshNodes = useCallback(async () => {
    const res = await fetch("/api/platform/nodes");
    if (res.ok) {
      const data = await res.json();
      setNodes(data.nodes);
    }
  }, []);

  const handleRoleChange = useCallback(
    async (nodeName: string, newRole: string) => {
      setSaving(`role-${nodeName}`);
      try {
        const res = await fetch(
          `/api/platform/nodes/${encodeURIComponent(nodeName)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              labels: { "open-platform.sh/node-role": newRole },
            }),
          },
        );
        if (res.ok) await refreshNodes();
      } finally {
        setSaving(null);
      }
    },
    [refreshNodes],
  );

  const handleScheduleToggle = useCallback(
    async (nodeName: string, currentlySchedulable: boolean) => {
      const action = currentlySchedulable ? "cordon" : "uncordon";
      setSaving(`schedule-${nodeName}`);
      try {
        const res = await fetch(
          `/api/platform/nodes/${encodeURIComponent(nodeName)}/${action}`,
          { method: "POST" },
        );
        if (res.ok) await refreshNodes();
      } finally {
        setSaving(null);
      }
    },
    [refreshNodes],
  );

  const handleRemoveNode = useCallback(
    async (nodeName: string) => {
      if (
        !confirm(
          `Remove node "${nodeName}" from the cluster? The node will need to be re-joined to rejoin.`,
        )
      )
        return;
      setSaving(`remove-${nodeName}`);
      try {
        const res = await fetch(
          `/api/platform/nodes/${encodeURIComponent(nodeName)}`,
          { method: "DELETE" },
        );
        if (res.ok) await refreshNodes();
      } finally {
        setSaving(null);
      }
    },
    [refreshNodes],
  );

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

      {/* Nodes */}
      {nodes && (
        <div className="section">
          <div className="section-header">Nodes</div>

          {/* MetalLB warning */}
          {nodes.length >= 2 && networkMode === "host" && (
            <div
              style={{
                padding: "10px 14px",
                marginBottom: 12,
                borderRadius: "var(--radius-input)",
                background: "var(--bg-inset)",
                border: "1px solid var(--border)",
                fontSize: 13,
                color: "var(--text-secondary)",
              }}
            >
              Multiple nodes detected with Host Network mode. Consider switching
              to Load Balancer (MetalLB) below for production reliability.
            </div>
          )}

          <div className="card">
            <div
              className="card-body"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 0,
                padding: 0,
              }}
            >
              {nodes.map((node, i) => (
                <div
                  key={node.name}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    padding: "14px 20px",
                    borderTop: i > 0 ? "1px solid var(--border)" : undefined,
                  }}
                >
                  {/* Row 1: Name + status, role select, schedulable toggle */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background:
                            node.status === "Ready" ? "#22c55e" : "#ef4444",
                          flexShrink: 0,
                        }}
                      />
                      <code
                        style={{
                          fontFamily:
                            "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
                          fontSize: 13,
                          fontWeight: 500,
                          color: "var(--text-primary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {node.name}
                      </code>
                    </div>

                    <select
                      value={node.role}
                      onChange={(e) =>
                        handleRoleChange(node.name, e.target.value)
                      }
                      disabled={saving === `role-${node.name}`}
                      style={{
                        fontSize: 12,
                        padding: "4px 8px",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-input)",
                        background: "var(--bg-inset)",
                        color: "var(--text-primary)",
                        cursor: "pointer",
                      }}
                    >
                      <option value="infra">infra</option>
                      <option value="worker">worker</option>
                    </select>

                    <button
                      onClick={() =>
                        handleScheduleToggle(node.name, node.schedulable)
                      }
                      disabled={saving === `schedule-${node.name}`}
                      title={
                        node.schedulable
                          ? "Schedulable — click to cordon"
                          : "Cordoned — click to uncordon"
                      }
                      style={{
                        fontSize: 12,
                        padding: "4px 10px",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-input)",
                        background: node.schedulable
                          ? "var(--bg-inset)"
                          : "var(--bg-inset)",
                        color: node.schedulable
                          ? "var(--text-primary)"
                          : "var(--text-muted)",
                        cursor: "pointer",
                        opacity: node.schedulable ? 1 : 0.7,
                      }}
                    >
                      {node.schedulable ? "Schedulable" : "Cordoned"}
                    </button>

                    {nodes.length >= 2 && (
                      <button
                        onClick={() => handleRemoveNode(node.name)}
                        disabled={saving === `remove-${node.name}`}
                        style={{
                          fontSize: 12,
                          padding: "4px 10px",
                          border: "1px solid var(--border)",
                          borderRadius: "var(--radius-input)",
                          background: "transparent",
                          color: "#ef4444",
                          cursor: "pointer",
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  {/* Row 2: Details */}
                  <div
                    style={{
                      display: "flex",
                      gap: 16,
                      flexWrap: "wrap",
                      paddingLeft: 16,
                    }}
                  >
                    <DetailItem label="IP" value={node.internalIp} />
                    <DetailItem label="Pods" value={String(node.podCount)} />
                    <DetailItem
                      label="CPU"
                      value={`${node.allocatable.cpu} / ${node.capacity.cpu}`}
                    />
                    <DetailItem
                      label="Memory"
                      value={`${formatMemory(node.allocatable.memory)} / ${formatMemory(node.capacity.memory)}`}
                    />
                    <DetailItem label="Kubelet" value={node.kubeletVersion} />
                  </div>
                </div>
              ))}

              {nodes.length === 0 && (
                <div
                  style={{
                    padding: "20px",
                    textAlign: "center",
                    fontSize: 13,
                    color: "var(--text-muted)",
                  }}
                >
                  No nodes found.
                </div>
              )}
            </div>
          </div>

          {/* Join instructions */}
          <div style={{ marginTop: 8 }}>
            <button
              onClick={() => setShowJoinInfo(!showJoinInfo)}
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "4px 0",
                textDecoration: "underline",
                textUnderlineOffset: "2px",
              }}
            >
              {showJoinInfo ? "Hide join instructions" : "Join a node"}
            </button>
            {showJoinInfo && (
              <div
                style={{
                  marginTop: 8,
                  padding: "12px 16px",
                  borderRadius: "var(--radius-input)",
                  background: "var(--bg-inset)",
                  border: "1px solid var(--border)",
                }}
              >
                <code
                  style={{
                    fontFamily:
                      "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    display: "block",
                    whiteSpace: "pre",
                    lineHeight: 1.6,
                  }}
                >
                  {`make node-join          # join all agents from open-platform.yaml\nmake colima-agent       # join Mac as test agent`}
                </code>
              </div>
            )}
          </div>
        </div>
      )}

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

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span className="text-xs text-muted" style={{ flexShrink: 0 }}>
        {label}
      </span>
      <code
        style={{
          fontFamily:
            "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
          fontSize: 12,
          color: "var(--text-secondary)",
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
