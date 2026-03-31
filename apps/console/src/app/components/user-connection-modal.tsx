"use client";

import { useState, useEffect, useCallback } from "react";

interface UserConnectionModalProps {
  onClose: () => void;
}

interface ConnectionInfo {
  mcp_url: string;
  token: string;
  username: string;
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

export function UserConnectionModal({ onClose }: UserConnectionModalProps) {
  const [connection, setConnection] = useState<ConnectionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConnection = useCallback(async () => {
    try {
      const res = await fetch("/api/users/me/connection");
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
  }, []);

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
    ? `claude mcp add --transport http --scope user op-${connection.username} ${connection.mcp_url}`
    : "";

  const mcpCommandWithToken = connection
    ? `claude mcp add --transport http --scope user op-${connection.username} ${connection.mcp_url} --header "Authorization: Bearer ${connection.token}"`
    : "";

  const [showFallback, setShowFallback] = useState(false);

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
            Connect to Claude Code
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
              <p
                className="text-xs text-muted"
                style={{ lineHeight: 1.5, marginBottom: 8 }}
              >
                A browser window will open for authentication.
              </p>
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
                The platform{"'"}s MCP tools will be available under the{" "}
                <code
                  style={{
                    fontFamily: monoFont,
                    fontSize: 12,
                    background: "var(--surface)",
                    padding: "1px 5px",
                    borderRadius: 3,
                  }}
                >
                  op-{connection.username}
                </code>{" "}
                server. Tokens refresh automatically.
              </p>
            </div>

            {/* Fallback */}
            <div>
              <button
                className="btn btn-ghost btn-sm text-xs text-muted"
                onClick={() => setShowFallback(!showFallback)}
                style={{ padding: "2px 0" }}
              >
                {showFallback ? "Hide" : "Show"} token-based fallback
              </button>
              {showFallback && (
                <div style={{ marginTop: 8 }}>
                  <p
                    className="text-xs text-muted"
                    style={{ lineHeight: 1.5, marginBottom: 8 }}
                  >
                    If OAuth isn{"'"}t working, use this command with an
                    embedded token (expires in ~1 hour):
                  </p>
                  <div style={{ position: "relative" }}>
                    <div style={codeBlockStyle}>{mcpCommandWithToken}</div>
                    <div
                      style={{
                        position: "absolute",
                        top: 6,
                        right: 6,
                      }}
                    >
                      <CopyButton text={mcpCommandWithToken} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
