"use client";

import { useState, useEffect, useCallback } from "react";

export interface Server {
  id: string;
  name: string;
  game_mode: string;
  difficulty: string;
  max_players: number;
  version: string;
  motd: string;
  icon_url: string | null;
  status: "running" | "starting" | "stopping" | "stopped" | "error";
  port: number | null;
  created_at: string;
  updated_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  running: "#22c55e",
  starting: "#eab308",
  stopping: "#eab308",
  error: "#ef4444",
  stopped: "#6b7280",
};

const STATUS_LABELS: Record<string, string> = {
  running: "RUNNING",
  starting: "STARTING",
  stopping: "STOPPING",
  error: "ERROR",
  stopped: "STOPPED",
};

export function ServerCard({ server: initialServer }: { server: Server }) {
  const [server, setServer] = useState(initialServer);
  const [loading, setLoading] = useState(false);

  const color = STATUS_COLORS[server.status] ?? "#6b7280";
  const isTransitioning =
    server.status === "starting" || server.status === "stopping";

  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/servers/${server.id}/status`);
      if (!res.ok) return;
      const data = await res.json();
      setServer((prev) => ({
        ...prev,
        status: data.status,
        port: data.port ?? prev.port,
      }));
    } catch {
      // Silently ignore poll failures
    }
  }, [server.id]);

  useEffect(() => {
    if (!isTransitioning) return;
    const interval = setInterval(pollStatus, 5000);
    return () => clearInterval(interval);
  }, [isTransitioning, pollStatus]);

  async function handleStart() {
    setLoading(true);
    setServer((prev) => ({ ...prev, status: "starting" }));
    try {
      const res = await fetch(`/api/servers/${server.id}/start`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setServer((prev) => ({
          ...prev,
          status: "starting",
          port: data.port ?? prev.port,
        }));
      }
    } catch {
      // Revert on network failure
      setServer((prev) => ({ ...prev, status: "error" }));
    } finally {
      setLoading(false);
    }
  }

  async function handleStop() {
    setLoading(true);
    setServer((prev) => ({ ...prev, status: "stopping" }));
    try {
      await fetch(`/api/servers/${server.id}/stop`, { method: "POST" });
    } catch {
      // Poll will correct the state
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${server.name}"? This cannot be undone.`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/servers/${server.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        window.location.reload();
      }
    } catch {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        background: "#1a1a24",
        border: "1px solid #2a2a3a",
        borderRadius: 12,
        padding: "18px 20px",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: color,
              boxShadow:
                server.status === "running"
                  ? `0 0 8px ${color}`
                  : "none",
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontWeight: 600,
              fontSize: 16,
              color: "#e8e8f0",
            }}
          >
            {server.name}
          </span>
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.05em",
            color: color,
            textTransform: "uppercase",
          }}
        >
          {STATUS_LABELS[server.status] ?? server.status}
        </span>
      </div>

      {/* Info Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "10px 24px",
          marginBottom: 16,
        }}
      >
        <InfoItem label="Version" value={server.version} />
        <InfoItem label="Mode" value={server.game_mode} />
        <InfoItem label="Difficulty" value={server.difficulty} />
        <InfoItem label="Max Players" value={String(server.max_players)} />
      </div>

      {/* Connection Info */}
      {server.status === "running" && server.port && (
        <div
          style={{
            background: "#0f0f13",
            border: "1px solid #1a2e1a",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 16,
          }}
        >
          <span
            style={{
              fontFamily: "ui-monospace, 'SF Mono', monospace",
              fontSize: 13,
              color: "#22c55e",
            }}
          >
            localhost:{server.port}
          </span>
        </div>
      )}

      {/* Controls */}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
        }}
      >
        {(server.status === "stopped" || server.status === "error") && (
          <button
            onClick={handleStart}
            disabled={loading}
            style={{
              padding: "7px 16px",
              background: loading ? "#4a4a6a" : "#6366f1",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            Start
          </button>
        )}

        {server.status === "running" && (
          <button
            onClick={handleStop}
            disabled={loading}
            style={{
              padding: "7px 16px",
              background: "none",
              color: loading ? "#6b7280" : "#ef4444",
              border: `1px solid ${loading ? "#3a3a4a" : "#ef4444"}`,
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            Stop
          </button>
        )}

        {isTransitioning && (
          <button
            disabled
            style={{
              padding: "7px 16px",
              background: "#2a2a3a",
              color: "#8888a0",
              border: "1px solid #2a2a3a",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: "not-allowed",
            }}
          >
            {server.status === "starting" ? "Starting..." : "Stopping..."}
          </button>
        )}

        <div style={{ flex: 1 }} />

        <button
          onClick={handleDelete}
          disabled={loading || isTransitioning}
          style={{
            padding: "7px 16px",
            background: "none",
            color: loading || isTransitioning ? "#3a3a4a" : "#6b7280",
            border: `1px solid ${loading || isTransitioning ? "#222233" : "#2a2a3a"}`,
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            cursor: loading || isTransitioning ? "not-allowed" : "pointer",
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: "#8888a0",
          marginBottom: 2,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 14, color: "#c8c8d8" }}>{value}</div>
    </div>
  );
}
