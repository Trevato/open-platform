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
  forgejo_username: string;
  schedule: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  last_activity_at: string | null;
}

const PLATFORM_DOMAIN =
  typeof window !== "undefined"
    ? (document
        .querySelector('meta[name="platform-domain"]')
        ?.getAttribute("content") ?? "")
    : (process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "");

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

export function AgentDetail({ slug }: { slug: string }) {
  const router = useRouter();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAgent = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(slug)}`);
      if (!res.ok) {
        setError("Agent not found");
        return;
      }
      const data = await res.json();
      setAgent(data.agent);
    } catch {
      setError("Failed to load agent");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchAgent();
    const interval = setInterval(fetchAgent, 10000);
    return () => clearInterval(interval);
  }, [fetchAgent]);

  async function handleDelete() {
    if (
      !confirm(
        `Delete agent "${agent?.name}"? This will also delete the Forgejo user.`,
      )
    )
      return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(slug)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.push("/dashboard/agents");
      } else {
        const data = await res.json();
        setError(data.error || "Failed to delete");
      }
    } catch {
      setError("Network error");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center" style={{ padding: 48 }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="empty-state">
        <h2>Agent not found</h2>
        <p>{error || "The requested agent does not exist."}</p>
        <button
          className="btn btn-accent"
          onClick={() => router.push("/dashboard/agents")}
        >
          Back to Agents
        </button>
      </div>
    );
  }

  const forgejoUrl = PLATFORM_DOMAIN
    ? `https://forgejo.${PLATFORM_DOMAIN}/${agent.forgejo_username}`
    : null;

  return (
    <>
      <div className="dashboard-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1>{agent.name}</h1>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              color: "var(--text-muted)",
            }}
          >
            <span className={`status-dot ${statusDotClass(agent.status)}`} />
            {agent.status}
          </span>
        </div>
      </div>

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

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Identity */}
        <div className="card">
          <div className="card-body">
            <h3
              className="text-sm"
              style={{ fontWeight: 600, marginBottom: 12 }}
            >
              Identity
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <span className="text-xs text-muted" style={{ width: 120 }}>
                  Forgejo User
                </span>
                {forgejoUrl ? (
                  <a
                    href={forgejoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs"
                    style={{ color: "var(--accent)" }}
                  >
                    {agent.forgejo_username}
                  </a>
                ) : (
                  <span className="text-xs">{agent.forgejo_username}</span>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <span className="text-xs text-muted" style={{ width: 120 }}>
                  Organizations
                </span>
                <span className="text-xs">
                  {agent.orgs?.length > 0 ? agent.orgs.join(", ") : "None"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Configuration */}
        <div className="card">
          <div className="card-body">
            <h3
              className="text-sm"
              style={{ fontWeight: 600, marginBottom: 12 }}
            >
              Configuration
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <span className="text-xs text-muted" style={{ width: 120 }}>
                  Model
                </span>
                <span className="text-xs">{agent.model}</span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <span className="text-xs text-muted" style={{ width: 120 }}>
                  Max Steps
                </span>
                <span className="text-xs">{agent.max_steps}</span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <span className="text-xs text-muted" style={{ width: 120 }}>
                  Tools
                </span>
                <span className="text-xs">
                  {agent.allowed_tools?.length
                    ? `${agent.allowed_tools.length} allowed`
                    : "All tools"}
                </span>
              </div>
              {agent.schedule && (
                <div style={{ display: "flex", gap: 8 }}>
                  <span className="text-xs text-muted" style={{ width: 120 }}>
                    Schedule
                  </span>
                  <span
                    className="text-xs"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {agent.schedule}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Instructions */}
        {agent.instructions && (
          <div className="card">
            <div className="card-body">
              <h3
                className="text-sm"
                style={{ fontWeight: 600, marginBottom: 12 }}
              >
                Instructions
              </h3>
              <pre
                style={{
                  fontSize: 12,
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  color: "var(--text-secondary)",
                  fontFamily:
                    "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
                }}
              >
                {agent.instructions}
              </pre>
            </div>
          </div>
        )}

        {/* Actions */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 4,
          }}
        >
          <button
            className="btn btn-accent"
            onClick={() => router.push(`/dashboard/agents/${agent.slug}/chat`)}
          >
            Chat
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => router.push("/dashboard/agents")}
          >
            Back
          </button>
          <button
            className="btn btn-ghost"
            onClick={handleDelete}
            disabled={deleting}
            style={{ color: "var(--status-failed)", marginLeft: "auto" }}
          >
            {deleting ? "Deleting..." : "Delete Agent"}
          </button>
        </div>
      </div>
    </>
  );
}
