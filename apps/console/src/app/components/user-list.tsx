"use client";

import { useState, useEffect, useCallback } from "react";

interface ForgejoUser {
  id: number;
  login: string;
  email: string;
  full_name: string;
  avatar_url: string;
  is_admin: boolean;
  created: string;
}

function PlusIcon() {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function UserAvatar({ user }: { user: ForgejoUser }) {
  const initial = (user.login || "?").charAt(0).toUpperCase();

  if (user.avatar_url) {
    return (
      <img
        src={user.avatar_url}
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

function PasswordNotice({
  username,
  password,
  onDismiss,
}: {
  username: string;
  password: string;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className="card"
      style={{
        marginBottom: 24,
        borderColor: "var(--status-ready)",
        background: "var(--status-ready-bg)",
      }}
    >
      <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <p style={{ fontSize: 14, fontWeight: 500 }}>
            User <strong>{username}</strong> created. Initial password:
          </p>
          <button
            className="btn-icon"
            onClick={onDismiss}
            aria-label="Dismiss"
            style={{ marginTop: -4, marginRight: -4 }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="checklist-code">
          <code>{password}</code>
          <button className="btn-icon" onClick={handleCopy} aria-label="Copy password">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {copied ? (
                <path d="M20 6L9 17l-5-5" />
              ) : (
                <>
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </>
              )}
            </svg>
          </button>
        </div>
        <p className="text-sm text-muted">
          They will be prompted to change it on first login.
        </p>
      </div>
    </div>
  );
}

function InviteUserForm({
  onCreated,
  onCancel,
}: {
  onCreated: (username: string, password: string) => void;
  onCancel: () => void;
}) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/platform/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create user");
        return;
      }

      const data = await res.json();
      onCreated(data.user.login, data.initialPassword);
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div className="card-body">
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>
          Invite User
        </h3>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="form-group">
            <label className="form-label" htmlFor="user-username">Username</label>
            <input
              id="user-username"
              className="input"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="johndoe"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="user-email">Email</label>
            <input
              id="user-email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="john@example.com"
              required
            />
          </div>
          {error && <p className="form-error">{error}</p>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn btn-accent btn-sm" disabled={submitting}>
              {submitting ? "Creating..." : "Create User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UserRow({ user }: { user: ForgejoUser }) {
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
      <UserAvatar user={user} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{user.login}</span>
          {user.is_admin && (
            <span
              className="badge"
              style={{
                background: "var(--accent-bg)",
                color: "var(--accent)",
                fontSize: 10,
                padding: "1px 6px",
              }}
            >
              Admin
            </span>
          )}
        </div>
        <p className="text-sm text-muted">{user.email}</p>
      </div>
      <span className="text-xs text-muted" style={{ flexShrink: 0 }}>
        {formatDate(user.created)}
      </span>
    </div>
  );
}

export function UserList() {
  const [users, setUsers] = useState<ForgejoUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [notice, setNotice] = useState<{ username: string; password: string } | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/platform/users");
      if (!res.ok) return;
      const data = await res.json();
      setUsers(data.users);
    } catch {
      // silent retry
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  if (loading) {
    return (
      <div className="flex justify-center" style={{ padding: 48 }}>
        <div className="spinner" />
      </div>
    );
  }

  function handleCreated(username: string, password: string) {
    setShowInvite(false);
    setNotice({ username, password });
    fetchUsers();
  }

  return (
    <>
      {notice && (
        <PasswordNotice
          username={notice.username}
          password={notice.password}
          onDismiss={() => setNotice(null)}
        />
      )}
      {showInvite && (
        <InviteUserForm
          onCreated={handleCreated}
          onCancel={() => setShowInvite(false)}
        />
      )}
      {users.length === 0 ? (
        <div className="empty-state">
          <h2>No users yet</h2>
          <p>Invite users to give them access to the platform.</p>
          <button className="btn btn-accent" onClick={() => setShowInvite(true)}>
            <PlusIcon />
            Invite User
          </button>
        </div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          {users.map((user) => (
            <UserRow key={user.id} user={user} />
          ))}
        </div>
      )}
    </>
  );
}
