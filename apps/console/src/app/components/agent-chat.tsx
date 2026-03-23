"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  isToolUIPart,
  getToolName,
  type UIMessage,
} from "ai";
import { Markdown } from "./markdown";
import { AutoResizeTextarea } from "./auto-resize-textarea";
import { ConversationList } from "./conversation-list";
import { useStickToBottom } from "@/hooks/use-stick-to-bottom";

interface Agent {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  model: string;
  instructions: string | null;
  status: string;
}

interface AgentChatProps {
  slug: string;
  conversationId?: string;
  initialMessages?: UIMessage[];
}

function modelLabel(model: string): string {
  if (model.includes("opus")) return "Opus";
  if (model.includes("haiku")) return "Haiku";
  return "Sonnet";
}

export function AgentChat({
  slug,
  conversationId: initialConversationId,
  initialMessages,
}: AgentChatProps) {
  const router = useRouter();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | undefined>(
    initialConversationId,
  );
  const [sidebarKey, setSidebarKey] = useState(0);
  const messagesRef = useRef<HTMLDivElement>(null);
  const { isAtBottom, scrollToBottom } = useStickToBottom(messagesRef);

  const fetchAgent = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(slug)}`);
      if (!res.ok) {
        setLoadError("Agent not found");
        return;
      }
      const data = await res.json();
      setAgent(data.agent);
    } catch {
      setLoadError("Failed to load agent");
    }
  }, [slug]);

  useEffect(() => {
    fetchAgent();
  }, [fetchAgent]);

  const [input, setInput] = useState("");

  const transportRef = useRef(
    new DefaultChatTransport({
      api: `/api/agents/${encodeURIComponent(slug)}/chat`,
      ...(initialConversationId
        ? { body: { chatId: initialConversationId } }
        : {}),
    }),
  );

  const { messages, sendMessage, status, error, stop } = useChat({
    id: conversationId,
    ...(initialMessages?.length ? { messages: initialMessages } : {}),
    transport: transportRef.current,
  });

  // Auto-scroll when at bottom and new content arrives
  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom();
    }
  }, [messages, isAtBottom, scrollToBottom]);

  // Auth error recovery
  useEffect(() => {
    if (
      error?.message?.includes("Unauthorized") ||
      error?.message?.includes("401")
    ) {
      window.location.href = "/api/auth/signin/forgejo";
    }
  }, [error]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");

    // Create conversation on first message if none exists
    if (!conversationId) {
      try {
        const res = await fetch(
          `/api/agents/${encodeURIComponent(slug)}/conversations`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: text.slice(0, 80) }),
          },
        );
        if (res.ok) {
          const data = await res.json();
          const newId = data.conversation.id;
          setConversationId(newId);
          // Update transport to include chatId
          transportRef.current = new DefaultChatTransport({
            api: `/api/agents/${encodeURIComponent(slug)}/chat`,
            body: { chatId: newId },
          });
          // Update URL without full navigation
          window.history.replaceState(
            null,
            "",
            `/dashboard/agents/${slug}/chat/${newId}`,
          );
          setSidebarKey((k) => k + 1);
        }
      } catch {
        // Continue without persistence if conversation creation fails
      }
    }

    sendMessage({ text });
  }, [input, conversationId, slug, sendMessage]);

  if (loadError) {
    return (
      <div className="empty-state">
        <h2>Agent not found</h2>
        <p>{loadError}</p>
        <button
          className="btn btn-accent"
          onClick={() => router.push("/dashboard/agents")}
        >
          Back to Agents
        </button>
      </div>
    );
  }

  const isStreaming = status === "streaming";
  const isSubmitting = status === "submitted";
  const isBusy = isStreaming || isSubmitting;

  return (
    <>
      <div className="dashboard-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1>{agent?.name ?? "Agent"} Chat</h1>
          {agent && (
            <span className="badge badge-provisioning" style={{ fontSize: 10 }}>
              {modelLabel(agent.model)}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => router.push(`/dashboard/agents/${slug}`)}
          >
            Details
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => router.push("/dashboard/agents")}
          >
            All Agents
          </button>
        </div>
      </div>

      {error && !error.message?.includes("401") && (
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
              {error.message || "An error occurred"}
            </p>
          </div>
        </div>
      )}

      <div
        className="card"
        style={{
          display: "flex",
          flexDirection: "row",
          height: "calc(100vh - 200px)",
          minHeight: 400,
          overflow: "hidden",
        }}
      >
        {/* Conversation sidebar */}
        <ConversationList
          key={sidebarKey}
          slug={slug}
          activeConversationId={conversationId}
        />

        {/* Chat area */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
          }}
        >
          {/* Messages */}
          <div
            ref={messagesRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              position: "relative",
            }}
          >
            {messages.length === 0 && (
              <EmptyState
                agent={agent}
                onSuggest={(text) => {
                  setInput(text);
                }}
              />
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: msg.role === "user" ? "flex-end" : "flex-start",
                  gap: 4,
                }}
              >
                <span
                  className="text-xs text-muted"
                  style={{ fontWeight: 500 }}
                >
                  {msg.role === "user" ? "You" : (agent?.name ?? "Agent")}
                </span>

                <div
                  style={{
                    maxWidth: msg.role === "user" ? "80%" : "100%",
                    padding: msg.role === "user" ? "8px 12px" : "8px 0",
                    borderRadius: 8,
                    fontSize: 14,
                    lineHeight: 1.6,
                    ...(msg.role === "user"
                      ? {
                          background: "var(--accent)",
                          color: "var(--bg-primary)",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                        }
                      : {}),
                  }}
                >
                  {msg.parts.map((part, i) => {
                    if (part.type === "text") {
                      return msg.role === "user" ? (
                        <span key={i}>{part.text}</span>
                      ) : (
                        <Markdown key={i} content={part.text} />
                      );
                    }
                    if (isToolUIPart(part)) {
                      return (
                        <ToolCall
                          key={i}
                          name={getToolName(part)}
                          state={part.state}
                          result={
                            part.state === "output-available"
                              ? part.output
                              : part.state === "output-error"
                                ? part.output
                                : undefined
                          }
                          isError={part.state === "output-error"}
                        />
                      );
                    }
                    return null;
                  })}
                </div>
              </div>
            ))}

            {isBusy && messages[messages.length - 1]?.role === "user" && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  color: "var(--text-muted)",
                  fontSize: 13,
                }}
              >
                <div className="spinner" style={{ width: 14, height: 14 }} />
                Thinking...
              </div>
            )}
          </div>

          {/* Scroll to bottom */}
          {!isAtBottom && messages.length > 0 && (
            <button className="scroll-to-bottom" onClick={scrollToBottom}>
              ↓ Scroll to bottom
            </button>
          )}

          {/* Input */}
          <div
            style={{
              borderTop: "1px solid var(--border)",
              padding: 12,
              display: "flex",
              gap: 8,
              alignItems: "flex-end",
            }}
          >
            <AutoResizeTextarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onSubmit={handleSend}
              placeholder={`Message ${agent?.name ?? "agent"}...`}
              disabled={isBusy}
              autoFocus
            />
            {isBusy ? (
              <button
                className="btn"
                onClick={stop}
                style={{
                  color: "var(--status-failed)",
                  borderColor: "var(--status-failed)",
                }}
              >
                Stop
              </button>
            ) : (
              <button
                className="btn btn-accent"
                onClick={handleSend}
                disabled={!input.trim()}
              >
                Send
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── Empty State ─── */

function EmptyState({
  agent,
  onSuggest,
}: {
  agent: Agent | null;
  onSuggest: (text: string) => void;
}) {
  const suggestions = [
    "What repos do you have access to?",
    "List open issues across all repos",
    "Show me the platform status",
  ];

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 24,
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          background: "var(--accent-bg)",
          border: "1px solid var(--accent-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 20,
          fontWeight: 600,
          color: "var(--accent)",
        }}
      >
        {agent?.name?.charAt(0)?.toUpperCase() ?? "A"}
      </div>

      <div style={{ textAlign: "center" }}>
        <h3 style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>
          {agent?.name ?? "Agent"}
        </h3>
        {agent?.description && (
          <p
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              maxWidth: 400,
            }}
          >
            {agent.description}
          </p>
        )}
        {agent?.model && (
          <span
            className="badge badge-provisioning"
            style={{ fontSize: 10, marginTop: 8 }}
          >
            {modelLabel(agent.model)}
          </span>
        )}
      </div>

      {/* Suggestions */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          justifyContent: "center",
          marginTop: 8,
        }}
      >
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onSuggest(s)}
            style={{
              background: "var(--bg-inset)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "8px 14px",
              fontSize: 13,
              color: "var(--text-secondary)",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--accent-border)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.color = "var(--text-secondary)";
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── Tool Call ─── */

function ToolCall({
  name,
  state,
  result,
  isError,
}: {
  name: string;
  state: string;
  result?: unknown;
  isError?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasResult = result != null;
  const resultText = hasResult
    ? typeof result === "string"
      ? result
      : JSON.stringify(result, null, 2)
    : null;
  const isDone = state === "output-available" || state === "output-error";

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (resultText) {
      navigator.clipboard.writeText(resultText);
    }
  };

  return (
    <div
      className={!isDone ? "tool-call-running" : ""}
      style={{
        marginTop: 4,
        marginBottom: 4,
        padding: "6px 8px",
        borderRadius: 6,
        border: `1px solid ${isError ? "var(--status-failed)" : "var(--border)"}`,
        background: "var(--bg-inset)",
        fontSize: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          cursor: hasResult ? "pointer" : "default",
        }}
        onClick={() => hasResult && setExpanded(!expanded)}
      >
        {isError ? (
          <span style={{ color: "var(--status-failed)" }}>✕</span>
        ) : isDone ? (
          <span style={{ color: "var(--status-ready)" }}>✓</span>
        ) : (
          <div className="spinner" style={{ width: 12, height: 12 }} />
        )}
        <span
          style={{
            fontFamily: '"FiraCode Nerd Font Mono", monospace',
            color: "var(--accent)",
          }}
        >
          {name}
        </span>
        {!isDone && (
          <span className="text-muted" style={{ fontSize: 11 }}>
            running...
          </span>
        )}
        {hasResult && (
          <span
            className="text-muted"
            style={{ fontSize: 11, marginLeft: "auto" }}
          >
            {expanded ? "▾" : "▸"}
          </span>
        )}
      </div>
      {expanded && resultText != null && (
        <div style={{ position: "relative" }}>
          <pre
            style={{
              marginTop: 6,
              padding: 8,
              borderRadius: 4,
              background: "var(--bg-primary)",
              fontSize: 11,
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: 200,
              overflowY: "auto",
              color: isError ? "var(--status-failed)" : "var(--text-primary)",
            }}
          >
            {resultText}
          </pre>
          <button
            onClick={handleCopy}
            style={{
              position: "absolute",
              top: 10,
              right: 4,
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "2px 6px",
              fontSize: 10,
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            Copy
          </button>
        </div>
      )}
    </div>
  );
}
