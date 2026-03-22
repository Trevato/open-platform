"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart, getToolName } from "ai";

interface Agent {
  id: string;
  slug: string;
  name: string;
  model: string;
  status: string;
}

export function AgentChat({ slug }: { slug: string }) {
  const router = useRouter();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: `/api/agents/${encodeURIComponent(slug)}/chat`,
    }),
  });

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  return (
    <>
      <div className="dashboard-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1>{agent?.name ?? "Agent"} Chat</h1>
          {agent && (
            <span className="badge badge-provisioning" style={{ fontSize: 10 }}>
              {agent.model.includes("opus")
                ? "Opus"
                : agent.model.includes("haiku")
                  ? "Haiku"
                  : "Sonnet"}
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
              {error.message || "An error occurred"}
            </p>
          </div>
        </div>
      )}

      <div
        className="card"
        style={{
          display: "flex",
          flexDirection: "column",
          height: "calc(100vh - 200px)",
          minHeight: 400,
        }}
      >
        {/* Messages */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {messages.length === 0 && (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-muted)",
                fontSize: 14,
              }}
            >
              Send a message to start chatting with {agent?.name ?? "the agent"}
            </div>
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
              <span className="text-xs text-muted" style={{ fontWeight: 500 }}>
                {msg.role === "user" ? "You" : (agent?.name ?? "Agent")}
              </span>

              <div
                style={{
                  maxWidth: "80%",
                  padding: "8px 12px",
                  borderRadius: 8,
                  fontSize: 14,
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  background:
                    msg.role === "user"
                      ? "var(--accent)"
                      : "var(--bg-secondary)",
                  color:
                    msg.role === "user"
                      ? "var(--bg-primary)"
                      : "var(--text-primary)",
                }}
              >
                {msg.parts.map((part, i) => {
                  if (part.type === "text") {
                    return <span key={i}>{part.text}</span>;
                  }
                  if (isToolUIPart(part)) {
                    const toolName = getToolName(part);
                    const output =
                      part.state === "output-available"
                        ? part.output
                        : undefined;
                    return (
                      <ToolCall
                        key={i}
                        name={toolName}
                        state={part.state}
                        result={output}
                      />
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          ))}

          {(isStreaming || isSubmitting) &&
            messages[messages.length - 1]?.role === "user" && (
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

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const text = input.trim();
            if (!text) return;
            setInput("");
            sendMessage({ text });
          }}
          style={{
            borderTop: "1px solid var(--border)",
            padding: 12,
            display: "flex",
            gap: 8,
          }}
        >
          <input
            className="input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Message ${agent?.name ?? "agent"}...`}
            disabled={isStreaming || isSubmitting}
            autoFocus
            style={{ flex: 1 }}
          />
          <button
            type="submit"
            className="btn btn-accent"
            disabled={isStreaming || isSubmitting || !input.trim()}
          >
            Send
          </button>
        </form>
      </div>
    </>
  );
}

function ToolCall({
  name,
  state,
  result,
}: {
  name: string;
  state: string;
  result?: unknown;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasResult = result != null;
  const resultText = hasResult
    ? typeof result === "string"
      ? result
      : JSON.stringify(result, null, 2)
    : null;
  const isDone = state === "output-available" || state === "output-error";

  return (
    <div
      style={{
        marginTop: 4,
        marginBottom: 4,
        padding: "6px 8px",
        borderRadius: 6,
        border: "1px solid var(--border)",
        background: "var(--bg-primary)",
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
        {isDone ? (
          <span style={{ color: "var(--status-running)" }}>&#10003;</span>
        ) : (
          <div className="spinner" style={{ width: 12, height: 12 }} />
        )}
        <span
          style={{ fontFamily: "var(--font-mono)", color: "var(--accent)" }}
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
            {expanded ? "collapse" : "expand"}
          </span>
        )}
      </div>
      {expanded && resultText != null && (
        <pre
          style={{
            marginTop: 6,
            padding: 8,
            borderRadius: 4,
            background: "var(--bg-tertiary)",
            fontSize: 11,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            maxHeight: 200,
            overflowY: "auto",
          }}
        >
          {resultText}
        </pre>
      )}
    </div>
  );
}
