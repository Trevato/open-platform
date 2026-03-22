"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface Agent {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  model: string;
  status: string;
  instructions: string | null;
  orgs: string[];
  allowed_tools: string[] | null;
  max_steps: number;
  forgejo_username: string | null;
  created_at: string;
  updated_at: string;
}

function statusDotClass(status: string): string {
  switch (status) {
    case "running":
      return "status-dot-provisioning";
    case "error":
      return "status-dot-failed";
    case "idle":
    default:
      return "status-dot-terminated";
  }
}

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function modelLabel(model: string): string {
  if (model.includes("opus")) return "Opus";
  if (model.includes("haiku")) return "Haiku";
  return "Sonnet";
}

function AgentCard({
  agent,
  onDelete,
  deleting,
}: {
  agent: Agent;
  onDelete: (slug: string) => void;
  deleting: string | null;
}) {
  const router = useRouter();
  const isDeleting = deleting === agent.slug;
  const toolCount = agent.allowed_tools?.length;

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div
        className="card-body"
        style={{ display: "flex", flexDirection: "column", gap: 12 }}
      >
        {/* Header: name + status */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              style={{ color: "var(--accent)", flexShrink: 0 }}
            >
              <rect x="3" y="4" width="18" height="14" rx="2" />
              <circle cx="9" cy="11" r="1.5" />
              <circle cx="15" cy="11" r="1.5" />
              <line x1="12" y1="1" x2="12" y2="4" />
            </svg>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{agent.name}</span>
          </div>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
              color: "var(--text-muted)",
            }}
          >
            <span className={`status-dot ${statusDotClass(agent.status)}`} />
            {statusLabel(agent.status)}
          </span>
        </div>

        {/* Model badge */}
        <div>
          <span className="badge badge-provisioning" style={{ fontSize: 10 }}>
            {modelLabel(agent.model)}
          </span>
        </div>

        {/* Description */}
        {agent.description && (
          <p className="text-sm text-secondary" style={{ lineHeight: 1.5 }}>
            {agent.description}
          </p>
        )}

        {/* Meta: orgs + tools */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {agent.orgs?.length > 0 && (
            <p className="text-xs text-muted">Orgs: {agent.orgs.join(", ")}</p>
          )}
          <p className="text-xs text-muted">
            {toolCount ? `${toolCount} tools allowed` : "All tools"}
          </p>
        </div>

        {/* Actions */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginTop: 4,
            borderTop: "1px solid var(--border)",
            paddingTop: 12,
          }}
        >
          <button
            className="btn btn-accent btn-sm"
            onClick={() => router.push(`/dashboard/agents/${agent.slug}/chat`)}
          >
            Chat
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => router.push(`/dashboard/agents/${agent.slug}`)}
          >
            Details
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => onDelete(agent.slug)}
            disabled={isDeleting}
            style={{ color: "var(--status-failed)", marginLeft: "auto" }}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AgentList() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/agents");
      if (!res.ok) return;
      const data = await res.json();
      setAgents(data.agents || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
    const interval = setInterval(fetchAgents, 10000);
    return () => clearInterval(interval);
  }, [fetchAgents]);

  async function handleDelete(slug: string) {
    setDeleting(slug);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(slug)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to delete agent");
        return;
      }
      fetchAgents();
    } catch {
      setError("Network error");
    } finally {
      setDeleting(null);
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
            <p style={{ fontSize: 14, color: "var(--status-failed)" }}>
              {error}
            </p>
          </div>
        </div>
      )}
      {agents.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              style={{ color: "var(--accent)" }}
            >
              <rect x="3" y="4" width="18" height="14" rx="2" />
              <circle cx="9" cy="11" r="1.5" />
              <circle cx="15" cy="11" r="1.5" />
              <line x1="12" y1="1" x2="12" y2="4" />
            </svg>
          </div>
          <h2>No agents yet</h2>
          <p>
            Create an AI agent with a dedicated Forgejo identity to work through
            issues and pull requests on your behalf.
          </p>
          <button
            className="btn btn-accent"
            onClick={() => router.push("/dashboard/agents/new")}
          >
            Create Agent
          </button>
        </div>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginBottom: 12,
            }}
          >
            <button
              className="btn btn-accent btn-sm"
              onClick={() => router.push("/dashboard/agents/new")}
            >
              New Agent
            </button>
          </div>
          <div className="grid-2">
            {agents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onDelete={handleDelete}
                deleting={deleting}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}
