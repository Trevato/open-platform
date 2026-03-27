"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ClaudeCodeModal } from "./claude-code-modal";

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

export function AgentDetail({
  slug,
  platformDomain,
}: {
  slug: string;
  platformDomain?: string;
}) {
  const router = useRouter();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [showClaudeCode, setShowClaudeCode] = useState(false);
  const [showRunPrompt, setShowRunPrompt] = useState(false);
  const [runPrompt, setRunPrompt] = useState("");
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<
    Array<{
      id: string;
      trigger: string;
      status: string;
      prompt: string | null;
      error_message: string | null;
      started_at: string;
      completed_at: string | null;
      duration_ms: number | null;
    }>
  >([]);

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
    const interval = setInterval(() => {
      if (!error) fetchAgent();
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchAgent, error]);

  const fetchRuns = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/agents/${encodeURIComponent(slug)}/runs?limit=10`,
      );
      if (res.ok) {
        const data = await res.json();
        setRuns(data.runs || []);
      }
    } catch {
      // Non-critical
    }
  }, [slug]);

  useEffect(() => {
    fetchRuns();
    const interval = setInterval(fetchRuns, 10000);
    return () => clearInterval(interval);
  }, [fetchRuns]);

  async function handleActivate() {
    if (!runPrompt.trim()) return;
    setActivating(true);
    try {
      const res = await fetch(
        `/api/agents/${encodeURIComponent(slug)}/activate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: runPrompt }),
        },
      );
      if (res.ok) {
        setRunPrompt("");
        setShowRunPrompt(false);
        fetchRuns();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to activate");
      }
    } catch {
      setError("Network error");
    } finally {
      setActivating(false);
    }
  }

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

  const forgejoUrl = platformDomain
    ? `https://forgejo.${platformDomain}/${agent.forgejo_username}`
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
                <span
                  className="text-xs text-muted"
                  style={{ width: 120, flexShrink: 0 }}
                >
                  Tools
                </span>
                {agent.allowed_tools?.length ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {agent.allowed_tools.map((tool) => (
                      <span
                        key={tool}
                        className="text-xs"
                        style={{
                          background: "var(--surface)",
                          border: "1px solid var(--border)",
                          borderRadius: 4,
                          padding: "1px 6px",
                          fontFamily:
                            "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
                          fontSize: 11,
                        }}
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs">All tools</span>
                )}
              </div>
              {agent.schedule && (
                <div style={{ display: "flex", gap: 8 }}>
                  <span
                    className="text-xs text-muted"
                    style={{ width: 120, flexShrink: 0 }}
                  >
                    Schedule
                  </span>
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 2 }}
                  >
                    <span
                      className="text-xs"
                      style={{
                        fontFamily:
                          "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
                      }}
                    >
                      {agent.schedule}
                    </span>
                    <span
                      className="text-xs text-muted"
                      style={{ fontSize: 11 }}
                    >
                      Server-side (uses API credits). Use /loop in Claude Code
                      for subscription-based scheduling.
                    </span>
                  </div>
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

        {/* Recent Runs */}
        {runs.length > 0 && (
          <div className="card">
            <div className="card-body">
              <h3
                className="text-sm"
                style={{ fontWeight: 600, marginBottom: 12 }}
              >
                Recent Runs
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {runs.map((run) => (
                  <div
                    key={run.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 0",
                      borderBottom: "1px solid var(--border)",
                      fontSize: 12,
                    }}
                  >
                    <span
                      className={`status-dot ${
                        run.status === "running"
                          ? "status-dot-provisioning"
                          : run.status === "error"
                            ? "status-dot-failed"
                            : "status-dot-ready"
                      }`}
                    />
                    <span className="text-xs" style={{ minWidth: 50 }}>
                      {run.trigger}
                    </span>
                    <span className="text-xs text-muted" style={{ flex: 1 }}>
                      {run.prompt?.slice(0, 60)}
                      {run.prompt && run.prompt.length > 60 ? "..." : ""}
                    </span>
                    {run.duration_ms != null && (
                      <span className="text-xs text-muted">
                        {run.duration_ms < 60000
                          ? `${Math.round(run.duration_ms / 1000)}s`
                          : `${Math.round(run.duration_ms / 60000)}m`}
                      </span>
                    )}
                    <span className="text-xs text-muted">
                      {new Date(run.started_at).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
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
            onClick={() => setShowClaudeCode(true)}
          >
            Connect as {agent.name}
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => router.push(`/dashboard/agents/${agent.slug}/chat`)}
          >
            Chat
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => setShowRunPrompt(!showRunPrompt)}
          >
            Run Now
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => router.push(`/dashboard/agents/${agent.slug}/edit`)}
          >
            Edit
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

        {/* Run Now prompt */}
        {showRunPrompt && (
          <div className="card" style={{ marginTop: 8 }}>
            <div
              className="card-body"
              style={{ display: "flex", gap: 8, alignItems: "flex-start" }}
            >
              <textarea
                className="input"
                placeholder="Enter a prompt for the agent..."
                value={runPrompt}
                onChange={(e) => setRunPrompt(e.target.value)}
                rows={2}
                style={{
                  flex: 1,
                  resize: "vertical",
                  fontFamily:
                    "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
                  fontSize: 13,
                }}
              />
              <button
                className="btn btn-accent"
                disabled={activating || !runPrompt.trim()}
                onClick={handleActivate}
              >
                {activating ? "Running..." : "Run"}
              </button>
            </div>
          </div>
        )}
      </div>
      {showClaudeCode && agent && (
        <ClaudeCodeModal
          agentSlug={agent.slug}
          agentName={agent.name}
          onClose={() => setShowClaudeCode(false)}
          allowedTools={agent.allowed_tools}
          orgs={agent.orgs}
        />
      )}
    </>
  );
}
