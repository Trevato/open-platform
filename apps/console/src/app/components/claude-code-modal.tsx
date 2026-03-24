"use client";

import { useState, useEffect, useCallback } from "react";

interface ClaudeCodeModalProps {
  agentSlug: string;
  agentName: string;
  onClose: () => void;
}

interface ConnectionInfo {
  mcp_url: string;
  token: string;
  agent_slug: string;
  instructions: string | null;
}

const monoFont = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace";

const codeBlockStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: 12,
  fontFamily: monoFont,
  fontSize: 12,
  lineHeight: 1.6,
  overflowX: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: silent fail
    }
  }

  return (
    <button
      className="btn btn-ghost btn-sm"
      onClick={handleCopy}
      style={{ fontSize: 11, padding: "2px 8px" }}
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

export function ClaudeCodeModal({
  agentSlug,
  agentName,
  onClose,
}: ClaudeCodeModalProps) {
  const [connection, setConnection] = useState<ConnectionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);

  const fetchConnection = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/agents/${encodeURIComponent(agentSlug)}/connection`,
      );
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to load connection info");
        return;
      }
      const data = await res.json();
      setConnection(data);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [agentSlug]);

  useEffect(() => {
    fetchConnection();
  }, [fetchConnection]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  const mcpCommand = connection
    ? `claude mcp add --transport http --scope user op-${connection.agent_slug} ${connection.mcp_url} --header "Authorization: Bearer ${connection.token}"`
    : "";

  return (
    <div
      onClick={handleBackdropClick}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 24,
      }}
    >
      <div
        style={{
          background: "var(--bg-card)",
          borderRadius: 12,
          border: "1px solid var(--border)",
          maxWidth: 560,
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          padding: 24,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
            Connect {agentName} to Claude Code
          </h2>
          <button
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            style={{ fontSize: 16, padding: "2px 8px", lineHeight: 1 }}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {loading && (
          <div className="flex justify-center" style={{ padding: 32 }}>
            <div className="spinner" />
          </div>
        )}

        {error && (
          <div
            className="card"
            style={{
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

        {connection && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Step 1 */}
            <div>
              <h3
                className="text-sm"
                style={{ fontWeight: 600, marginBottom: 8 }}
              >
                1. Add MCP Server
              </h3>
              <div style={{ position: "relative" }}>
                <div style={codeBlockStyle}>{mcpCommand}</div>
                <div
                  style={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                  }}
                >
                  <CopyButton text={mcpCommand} />
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div>
              <h3
                className="text-sm"
                style={{ fontWeight: 600, marginBottom: 8 }}
              >
                2. Verify
              </h3>
              <div style={{ ...codeBlockStyle, fontSize: 12 }}>
                claude mcp list
              </div>
            </div>

            {/* Step 3 */}
            <div>
              <h3
                className="text-sm"
                style={{ fontWeight: 600, marginBottom: 8 }}
              >
                3. Start using
              </h3>
              <p className="text-sm" style={{ lineHeight: 1.6 }}>
                Open Claude Code in any project directory. The platform{"'"}s
                MCP tools will be available under the{" "}
                <code
                  style={{
                    fontFamily: monoFont,
                    fontSize: 12,
                    background: "var(--surface)",
                    padding: "1px 5px",
                    borderRadius: 3,
                  }}
                >
                  op-{connection.agent_slug}
                </code>{" "}
                server.
              </p>
            </div>

            {/* Instructions (collapsible) */}
            {connection.instructions && (
              <div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowInstructions(!showInstructions)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 0",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      transform: showInstructions
                        ? "rotate(90deg)"
                        : "rotate(0deg)",
                      transition: "transform 0.15s ease",
                      fontSize: 10,
                    }}
                  >
                    &#9654;
                  </span>
                  Agent Instructions
                </button>
                {showInstructions && (
                  <pre
                    style={{
                      ...codeBlockStyle,
                      marginTop: 8,
                      maxHeight: 200,
                      overflowY: "auto",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {connection.instructions}
                  </pre>
                )}
              </div>
            )}

            {/* Security note */}
            <p
              className="text-xs text-muted"
              style={{ lineHeight: 1.5, marginTop: 4 }}
            >
              This command contains the agent{"'"}s access token. It will be
              stored in your Claude Code config (~/.claude.json).
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
