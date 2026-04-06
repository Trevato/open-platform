"use client";

import { useState, useEffect, useCallback } from "react";
import { CopyButton } from "@/app/components/copy-button";

interface Tool {
  name: string;
  description?: string;
}

interface ToolCategory {
  name: string;
  tools: Tool[];
}

const TABS = [
  "Claude Code",
  "Cursor",
  "VS Code",
  "Continue",
  "Windsurf",
] as const;
type Tab = (typeof TABS)[number];
type AuthMode = "oauth" | "token";

function getConfig(
  tab: Tab,
  apiUrl: string,
  authMode: AuthMode,
): { filename: string; content: string; isCommand?: boolean } {
  if (authMode === "oauth") {
    switch (tab) {
      case "Claude Code":
        return {
          filename: "Terminal",
          content: `claude mcp add --transport http open-platform ${apiUrl}/mcp`,
          isCommand: true,
        };
      case "Cursor":
        return {
          filename: ".cursor/mcp.json",
          content: JSON.stringify(
            {
              mcpServers: {
                "open-platform": {
                  url: `${apiUrl}/mcp`,
                },
              },
            },
            null,
            2,
          ),
        };
      case "VS Code":
        return {
          filename: ".vscode/mcp.json",
          content: JSON.stringify(
            {
              servers: {
                "open-platform": {
                  type: "http",
                  url: `${apiUrl}/mcp`,
                },
              },
            },
            null,
            2,
          ),
        };
      case "Continue":
        return {
          filename: ".continue/mcpServers/open-platform.yaml",
          content: [
            "name: open-platform",
            "type: streamable-http",
            `url: ${apiUrl}/mcp`,
          ].join("\n"),
        };
      case "Windsurf":
        return {
          filename: "~/.codeium/windsurf/mcp_config.json",
          content: JSON.stringify(
            {
              mcpServers: {
                "open-platform": {
                  serverUrl: `${apiUrl}/mcp`,
                },
              },
            },
            null,
            2,
          ),
        };
    }
  }

  switch (tab) {
    case "Claude Code":
      return {
        filename: ".mcp.json",
        content: JSON.stringify(
          {
            mcpServers: {
              "open-platform": {
                type: "http",
                url: `${apiUrl}/mcp`,
                headers: { Authorization: "Bearer ${OP_TOKEN}" },
              },
            },
          },
          null,
          2,
        ),
      };
    case "Cursor":
      return {
        filename: ".cursor/mcp.json",
        content: JSON.stringify(
          {
            mcpServers: {
              "open-platform": {
                url: `${apiUrl}/mcp`,
                headers: { Authorization: "Bearer ${env:OP_TOKEN}" },
              },
            },
          },
          null,
          2,
        ),
      };
    case "VS Code":
      return {
        filename: ".vscode/mcp.json",
        content: JSON.stringify(
          {
            servers: {
              "open-platform": {
                type: "http",
                url: `${apiUrl}/mcp`,
                headers: { Authorization: "Bearer ${input:op-token}" },
              },
            },
            inputs: [
              {
                type: "promptString",
                id: "op-token",
                description: "Open Platform API token (Forgejo PAT)",
                password: true,
              },
            ],
          },
          null,
          2,
        ),
      };
    case "Continue":
      return {
        filename: ".continue/mcpServers/open-platform.yaml",
        content: [
          "name: open-platform",
          "type: streamable-http",
          `url: ${apiUrl}/mcp`,
          "requestOptions:",
          "  headers:",
          '    Authorization: "Bearer ${{ secrets.OP_TOKEN }}"',
        ].join("\n"),
      };
    case "Windsurf":
      return {
        filename: "~/.codeium/windsurf/mcp_config.json",
        content: JSON.stringify(
          {
            mcpServers: {
              "open-platform": {
                serverUrl: `${apiUrl}/mcp`,
                headers: { Authorization: "Bearer ${env:OP_TOKEN}" },
              },
            },
          },
          null,
          2,
        ),
      };
  }
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transform: open ? "rotate(90deg)" : "rotate(0deg)",
        transition: "transform 0.15s ease",
      }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function ToolBrowser() {
  const [categories, setCategories] = useState<ToolCategory[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/mcp/tools")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch tools");
        return r.json();
      })
      .then((data) => {
        const cats: ToolCategory[] = data.categories ?? [];
        setCategories(cats);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  const toggle = useCallback((name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  if (loading) {
    return (
      <p className="text-sm text-muted" style={{ padding: "16px 0" }}>
        Loading tools...
      </p>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-muted" style={{ padding: "16px 0" }}>
        Could not load tools. Is the platform API running?
      </p>
    );
  }

  if (categories.length === 0) {
    return (
      <p className="text-sm text-muted" style={{ padding: "16px 0" }}>
        No tools available.
      </p>
    );
  }

  const totalTools = categories.reduce((sum, c) => sum + c.tools.length, 0);

  return (
    <div>
      <p className="text-sm text-muted" style={{ marginBottom: 12 }}>
        {totalTools} tools across {categories.length} categories
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {categories.map((cat) => (
          <div key={cat.name}>
            <button
              onClick={() => toggle(cat.name)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "8px 4px",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--text)",
                textAlign: "left",
              }}
            >
              <ChevronIcon open={expanded.has(cat.name)} />
              <span style={{ textTransform: "capitalize" }}>{cat.name}</span>
              <span className="text-muted" style={{ fontWeight: 400 }}>
                ({cat.tools.length})
              </span>
            </button>
            {expanded.has(cat.name) && (
              <div style={{ paddingLeft: 26, paddingBottom: 8 }}>
                {cat.tools.map((tool) => (
                  <div
                    key={tool.name}
                    style={{ padding: "4px 0", fontSize: 13 }}
                  >
                    <code style={{ fontSize: 12 }}>{tool.name}</code>
                    {tool.description && (
                      <p
                        className="text-muted"
                        style={{ margin: "2px 0 0", fontSize: 12 }}
                      >
                        {tool.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AuthModeToggle({
  authMode,
  onChange,
}: {
  authMode: AuthMode;
  onChange: (mode: AuthMode) => void;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        borderRadius: 6,
        border: "1px solid var(--border)",
        overflow: "hidden",
      }}
    >
      {(["oauth", "token"] as const).map((mode) => (
        <button
          key={mode}
          onClick={() => onChange(mode)}
          style={{
            padding: "6px 14px",
            fontSize: 13,
            fontWeight: authMode === mode ? 500 : 400,
            color: authMode === mode ? "var(--bg)" : "var(--text-muted)",
            background: authMode === mode ? "var(--accent)" : "transparent",
            border: "none",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          {mode === "oauth" ? "OAuth" : "Token"}
        </button>
      ))}
    </div>
  );
}

export function McpConnector({
  domain,
  prefix,
}: {
  domain: string;
  prefix: string;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("Claude Code");
  const [authMode, setAuthMode] = useState<AuthMode>("oauth");
  const [tokenNoteOpen, setTokenNoteOpen] = useState(false);

  const apiUrl = `https://${prefix}api.${domain}`;
  const forgejoUrl = `https://${prefix}forgejo.${domain}`;
  const mcpCommand = `claude mcp add --transport http open-platform ${apiUrl}/mcp`;
  const config = getConfig(activeTab, apiUrl, authMode);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      {/* Quick Start */}
      <section className="section">
        <div className="section-header">
          <h2>Quick Start</h2>
        </div>
        <div
          className="card"
          style={{
            padding: "20px 20px",
            borderLeft: "3px solid var(--accent)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              background:
                "var(--bg-subtle, var(--bg-secondary, rgba(0,0,0,0.15)))",
              borderRadius: 6,
              padding: "10px 14px",
              fontFamily: "var(--font-mono, monospace)",
              fontSize: 13,
            }}
          >
            <code style={{ fontSize: 13, wordBreak: "break-all" }}>
              {mcpCommand}
            </code>
            <CopyButton text={mcpCommand} title="Copy command" />
          </div>
          <p
            className="text-muted"
            style={{ margin: "12px 0 0", fontSize: 13 }}
          >
            Connects via Forgejo SSO — authenticates in your browser
          </p>
        </div>
      </section>

      {/* Configuration */}
      <section className="section">
        <div
          className="section-header"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h2>Configuration</h2>
          <AuthModeToggle authMode={authMode} onChange={setAuthMode} />
        </div>
        <div
          style={{
            display: "flex",
            gap: 0,
            borderBottom: "1px solid var(--border)",
            marginBottom: 0,
          }}
        >
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: activeTab === tab ? 500 : 400,
                color: activeTab === tab ? "var(--text)" : "var(--text-muted)",
                background: "none",
                border: "none",
                borderBottom:
                  activeTab === tab
                    ? "2px solid var(--accent)"
                    : "2px solid transparent",
                cursor: "pointer",
                transition: "color 0.15s ease, border-color 0.15s ease",
              }}
            >
              {tab}
            </button>
          ))}
        </div>
        <div
          className="card"
          style={{ borderRadius: "0 0 8px 8px", padding: 0 }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 12px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <span className="text-muted" style={{ fontSize: 12 }}>
              {config.filename}
            </span>
            <CopyButton text={config.content} title="Copy config" />
          </div>
          <pre
            style={{
              margin: 0,
              padding: "12px 16px",
              fontSize: 12,
              lineHeight: 1.6,
              overflow: "auto",
              fontFamily: "var(--font-mono, monospace)",
            }}
          >
            {config.content}
          </pre>
        </div>

        {authMode === "token" && (
          <div style={{ marginTop: 12 }}>
            <button
              onClick={() => setTokenNoteOpen((v) => !v)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                color: "var(--text-muted)",
                padding: 0,
              }}
            >
              <ChevronIcon open={tokenNoteOpen} />
              Create a token
            </button>
            {tokenNoteOpen && (
              <div
                className="card"
                style={{
                  marginTop: 8,
                  padding: "12px 16px",
                  fontSize: 13,
                  lineHeight: 1.7,
                }}
              >
                <p style={{ margin: 0 }}>
                  Create a Personal Access Token at{" "}
                  <a
                    href={`${forgejoUrl}/user/settings/applications`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {prefix}forgejo.{domain}/user/settings/applications
                  </a>
                </p>
                <p style={{ margin: "8px 0 0" }}>Required scopes:</p>
                <ul
                  style={{
                    margin: "4px 0 0",
                    paddingLeft: 20,
                    fontSize: 12,
                    lineHeight: 1.8,
                  }}
                >
                  <li>
                    <code>read:user</code>
                  </li>
                  <li>
                    <code>read:organization</code>
                  </li>
                  <li>
                    <code>read:repository</code>, <code>write:repository</code>
                  </li>
                  <li>
                    <code>read:issue</code>, <code>write:issue</code>
                  </li>
                </ul>
                <p
                  className="text-muted"
                  style={{ margin: "8px 0 0", fontSize: 12 }}
                >
                  Set the token as <code>OP_TOKEN</code> in your environment.
                </p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Endpoint */}
      <section className="section">
        <div className="section-header">
          <h2>Endpoint</h2>
        </div>
        <div
          className="card"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            fontFamily: "var(--font-mono, monospace)",
            fontSize: 13,
          }}
        >
          <span>{apiUrl}/mcp</span>
          <CopyButton text={`${apiUrl}/mcp`} title="Copy MCP endpoint" />
        </div>
      </section>

      {/* Tool browser */}
      <section className="section">
        <div className="section-header">
          <h2>Available Tools</h2>
        </div>
        <div className="card" style={{ padding: "12px 16px" }}>
          <ToolBrowser />
        </div>
      </section>
    </div>
  );
}
