"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface Conversation {
  id: string;
  title: string | null;
  updated_at: string;
  message_count: number;
}

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ConversationList({
  slug,
  activeConversationId,
}: {
  slug: string;
  activeConversationId?: string;
}) {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/agents/${encodeURIComponent(slug)}/conversations`,
      );
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchConversations();
    const interval = setInterval(fetchConversations, 30000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  const handleNewChat = () => {
    router.push(`/dashboard/agents/${slug}/chat`);
  };

  const handleSelect = (id: string) => {
    router.push(`/dashboard/agents/${slug}/chat/${id}`);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm("Delete this conversation?")) return;
    const res = await fetch(
      `/api/agents/${encodeURIComponent(slug)}/conversations/${id}`,
      { method: "DELETE" },
    );
    if (!res.ok) return;
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (id === activeConversationId) {
      router.push(`/dashboard/agents/${slug}/chat`);
    }
  };

  return (
    <div
      style={{
        width: 220,
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "12px 12px 8px" }}>
        <button
          className="btn btn-accent btn-sm"
          onClick={handleNewChat}
          style={{ width: "100%" }}
        >
          + New Chat
        </button>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "0 4px",
        }}
      >
        {loading && (
          <div
            style={{
              padding: 12,
              color: "var(--text-muted)",
              fontSize: 12,
              textAlign: "center",
            }}
          >
            Loading...
          </div>
        )}

        {!loading && conversations.length === 0 && (
          <div
            style={{
              padding: 12,
              color: "var(--text-muted)",
              fontSize: 12,
              textAlign: "center",
            }}
          >
            No conversations yet
          </div>
        )}

        {conversations.map((conv) => (
          <div
            key={conv.id}
            onClick={() => handleSelect(conv.id)}
            style={{
              padding: "8px 10px",
              margin: "2px 0",
              borderRadius: 6,
              cursor: "pointer",
              background:
                conv.id === activeConversationId
                  ? "var(--accent-bg)"
                  : "transparent",
              border:
                conv.id === activeConversationId
                  ? "1px solid var(--accent-border)"
                  : "1px solid transparent",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => {
              if (conv.id !== activeConversationId) {
                e.currentTarget.style.background = "var(--bg-card-hover)";
              }
            }}
            onMouseLeave={(e) => {
              if (conv.id !== activeConversationId) {
                e.currentTarget.style.background = "transparent";
              }
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: conv.id === activeConversationId ? 500 : 400,
                color: "var(--text-primary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {conv.title || "New conversation"}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 2,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                }}
              >
                {timeAgo(conv.updated_at)}
              </span>
              <button
                onClick={(e) => handleDelete(e, conv.id)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: 11,
                  padding: "0 2px",
                  opacity: 0.5,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = "1";
                  e.currentTarget.style.color = "var(--danger)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = "0.5";
                  e.currentTarget.style.color = "var(--text-muted)";
                }}
                title="Delete conversation"
              >
                x
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
