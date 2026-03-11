"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface DevPod {
  id: string;
  user_id: string;
  forgejo_username: string;
  status: string;
  pod_name: string;
  cpu_limit: string;
  memory_limit: string;
  storage_size: string;
  error_message: string | null;
  user_name: string;
  user_email: string;
  user_image: string | null;
  created_at: string;
  updated_at: string;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusDotClass(status: string): string {
  switch (status) {
    case "running":
      return "status-dot-ready";
    case "starting":
    case "stopping":
      return "status-dot-provisioning";
    case "stopped":
      return "status-dot-stopped";
    case "error":
      return "status-dot-failed";
    default:
      return "status-dot-stopped";
  }
}

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function PodAvatar({
  name,
  image,
}: {
  name: string;
  image: string | null;
}) {
  const initial = (name || "?").charAt(0).toUpperCase();

  if (image) {
    return (
      <img
        src={image}
        alt=""
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          objectFit: "cover",
          background: "var(--bg-inset)",
          border: "1px solid var(--border)",
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <span
      style={{
        width: 32,
        height: 32,
        borderRadius: "50%",
        background: "var(--accent-bg)",
        border: "1px solid var(--accent-border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 13,
        fontWeight: 600,
        color: "var(--accent)",
        flexShrink: 0,
      }}
    >
      {initial}
    </span>
  );
}

function PodRow({
  pod,
  onAction,
  acting,
}: {
  pod: DevPod;
  onAction: (username: string, action: string) => void;
  acting: string | null;
}) {
  const router = useRouter();
  const isActing = acting === pod.forgejo_username;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 20px",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <PodAvatar name={pod.user_name || pod.forgejo_username} image={pod.user_image} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>
            {pod.forgejo_username}
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
              color: "var(--text-muted)",
            }}
          >
            <span className={`status-dot ${statusDotClass(pod.status)}`} />
            {statusLabel(pod.status)}
          </span>
        </div>
        <p className="text-sm text-muted">
          {pod.cpu_limit} CPU, {pod.memory_limit} RAM, {pod.storage_size} disk
          {pod.error_message && (
            <span style={{ color: "var(--status-failed)" }}>
              {" "}&mdash; {pod.error_message}
            </span>
          )}
        </p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {pod.status === "running" && (
          <button
            className="btn btn-accent btn-sm"
            onClick={() => router.push(`/dashboard/dev-pods/${pod.forgejo_username}`)}
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
          >
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
              <polyline points="4 17 10 11 4 5" />
              <line x1="12" y1="19" x2="20" y2="19" />
            </svg>
            Terminal
          </button>
        )}
        {pod.status === "running" && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => onAction(pod.forgejo_username, "stop")}
            disabled={isActing}
          >
            {isActing ? "Stopping..." : "Stop"}
          </button>
        )}
        {pod.status === "stopped" && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => onAction(pod.forgejo_username, "start")}
            disabled={isActing}
          >
            {isActing ? "Starting..." : "Start"}
          </button>
        )}
        {(pod.status === "stopped" || pod.status === "error") && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => onAction(pod.forgejo_username, "delete")}
            disabled={isActing}
            style={{ color: "var(--status-failed)" }}
          >
            Delete
          </button>
        )}
        <span className="text-xs text-muted" style={{ marginLeft: 4 }}>
          {formatDate(pod.created_at)}
        </span>
      </div>
    </div>
  );
}

export function DevPodList() {
  const [pods, setPods] = useState<DevPod[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchPods = useCallback(async () => {
    try {
      const res = await fetch("/api/dev-pods");
      if (!res.ok) return;
      const data = await res.json();
      setPods(data.pods);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPods();
    const interval = setInterval(fetchPods, 5000);
    return () => clearInterval(interval);
  }, [fetchPods]);

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/dev-pods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create dev pod");
        return;
      }
      fetchPods();
    } catch {
      setError("Network error");
    } finally {
      setCreating(false);
    }
  }

  async function handleAction(username: string, action: string) {
    setActing(username);
    setError(null);
    try {
      if (action === "delete") {
        const res = await fetch(`/api/dev-pods/${username}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Failed to delete");
        }
      } else {
        const res = await fetch(`/api/dev-pods/${username}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || `Failed to ${action}`);
        }
      }
      fetchPods();
    } catch {
      setError("Network error");
    } finally {
      setActing(null);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center" style={{ padding: 48 }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <>
      {error && (
        <div
          className="card"
          style={{
            marginBottom: 16,
            borderColor: "var(--status-failed)",
            background: "var(--status-failed-bg)",
          }}
        >
          <div className="card-body">
            <p style={{ fontSize: 14, color: "var(--status-failed)" }}>{error}</p>
          </div>
        </div>
      )}
      {pods.length === 0 ? (
        <div className="empty-state">
          <h2>No dev pods</h2>
          <p>Create a dev pod to get a full development environment with Claude Code, Neovim, and all the tools you need.</p>
          <button
            className="btn btn-accent"
            onClick={handleCreate}
            disabled={creating}
          >
            {creating ? "Creating..." : "Create Dev Pod"}
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button
              className="btn btn-accent btn-sm"
              onClick={handleCreate}
              disabled={creating}
            >
              {creating ? "Creating..." : "Create Dev Pod"}
            </button>
          </div>
          <div className="card" style={{ overflow: "hidden" }}>
            {pods.map((pod) => (
              <PodRow
                key={pod.id}
                pod={pod}
                onAction={handleAction}
                acting={acting}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}
