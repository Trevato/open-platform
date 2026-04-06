"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface AppInfo {
  namespace: string;
  org: string;
  repo: string;
  ready: boolean;
  status: "running" | "degraded" | "stopped" | "pending" | "deploying";
  replicas: { ready: number; total: number };
  url: string;
  archived_at?: string;
}

interface ArchivedAppInfo {
  org: string;
  repo: string;
  namespace: string;
  archived_at: string;
  status: "running" | "degraded" | "stopped";
  ready: boolean;
  replicas: { ready: number; desired: number; total: number };
  url: string;
}

interface Org {
  id: number;
  name: string;
  full_name: string;
}

function ExternalLinkIcon() {
  return (
    <svg
      className="icon-sm"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 17l9.2-9.2M17 17V7H7" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg
      className="icon-sm"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg
      className="icon-sm"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="21 8 21 21 3 21 3 8" />
      <rect x="1" y="3" width="22" height="5" />
      <line x1="10" y1="12" x2="14" y2="12" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      className="icon-sm"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg
      className="icon-sm"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg
      className="icon-sm"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg
      className="icon-sm"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </svg>
  );
}

function getForgejoUrl(org: string, repo: string): string {
  const hostname =
    typeof window !== "undefined" ? window.location.hostname : "";
  const domain = hostname.replace(/^[^.]+\./, "");
  return `https://forgejo.${domain}/${org}/${repo}`;
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

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function StatusBadge({ status }: { status: AppInfo["status"] }) {
  const config = {
    running: {
      className: "badge badge-ready",
      dotClassName: "status-dot status-dot-ready",
      label: "Running",
      style: undefined as React.CSSProperties | undefined,
      dotStyle: undefined as React.CSSProperties | undefined,
    },
    stopped: {
      className: "badge badge-failed",
      dotClassName: "status-dot status-dot-failed",
      label: "Stopped",
      style: undefined as React.CSSProperties | undefined,
      dotStyle: undefined as React.CSSProperties | undefined,
    },
    deploying: {
      className: "badge",
      dotClassName: "status-dot",
      label: "Deploying",
      style: {
        background: "rgba(234, 179, 8, 0.15)",
        color: "rgb(234, 179, 8)",
      } as React.CSSProperties,
      dotStyle: {
        background: "rgb(234, 179, 8)",
        animation: "pulse 1.5s ease-in-out infinite",
      } as React.CSSProperties,
    },
    pending: {
      className: "badge",
      dotClassName: "status-dot",
      label: "Pending",
      style: {
        background: "rgba(148, 163, 184, 0.15)",
        color: "rgb(148, 163, 184)",
      } as React.CSSProperties,
      dotStyle: {
        background: "rgb(148, 163, 184)",
      } as React.CSSProperties,
    },
    degraded: {
      className: "badge",
      dotClassName: "status-dot",
      label: "Degraded",
      style: {
        background: "rgba(249, 115, 22, 0.15)",
        color: "rgb(249, 115, 22)",
      } as React.CSSProperties,
      dotStyle: {
        background: "rgb(249, 115, 22)",
      } as React.CSSProperties,
    },
  };

  const c = config[status];

  return (
    <span className={c.className} style={c.style}>
      <span className={c.dotClassName} style={c.dotStyle} aria-hidden="true" />
      {c.label}
    </span>
  );
}

function AppCard({ app, onRefresh }: { app: AppInfo; onRefresh: () => void }) {
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState("");

  async function handleArchive() {
    if (
      !confirm(
        `Archive ${app.org}/${app.repo}? The code will become read-only. The deployment will keep running.`,
      )
    ) {
      return;
    }
    setArchiving(true);
    setError("");
    try {
      const res = await fetch("/api/platform/apps", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org: app.org, repo: app.repo }),
      });
      if (res.ok) {
        onRefresh();
      } else {
        setError("Failed to archive");
      }
    } catch {
      setError("Network error");
    } finally {
      setArchiving(false);
    }
  }

  return (
    <div className="card">
      <div
        className="card-body"
        style={{ display: "flex", flexDirection: "column", gap: 12 }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>
              {app.repo}
            </h3>
            <p className="text-sm text-muted">{app.namespace}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <StatusBadge status={app.status} />
            <button
              onClick={handleArchive}
              disabled={archiving}
              title="Archive app"
              style={{
                background: "none",
                border: "none",
                cursor: archiving ? "wait" : "pointer",
                color: "var(--text-muted)",
                padding: 4,
                borderRadius: 4,
                display: "inline-flex",
                alignItems: "center",
                opacity: archiving ? 0.5 : 0.6,
                transition: "opacity 0.15s",
              }}
              onMouseEnter={(e) => {
                if (!archiving)
                  (e.currentTarget as HTMLButtonElement).style.opacity = "1";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.opacity = "0.6";
              }}
            >
              <ArchiveIcon />
            </button>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span className="text-xs text-muted">
            {app.replicas.ready}/{app.replicas.total} replica
            {app.replicas.total !== 1 ? "s" : ""}
          </span>
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            <a
              href={getForgejoUrl(app.org, app.repo)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm"
              style={{
                color: "var(--text-muted)",
                display: "inline-flex",
                alignItems: "center",
                gap: 2,
              }}
              onClick={(e) => e.stopPropagation()}
              title="View source"
            >
              <CodeIcon />
            </a>
            {app.url && (
              <a
                href={app.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm"
                style={{
                  color: "var(--accent)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {app.url.replace(/^https?:\/\//, "")}
                <ExternalLinkIcon />
              </a>
            )}
          </span>
        </div>
        {error && (
          <p
            className="text-xs"
            style={{ color: "rgb(239, 68, 68)", margin: 0 }}
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function ArchivedAppCard({
  app,
  onRefresh,
}: {
  app: ArchivedAppInfo;
  onRefresh: () => void;
}) {
  const [restoring, setRestoring] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState("");

  const timeAgo = getTimeAgo(app.archived_at);
  const isRunning = app.status === "running" || app.status === "degraded";

  async function handleRestore() {
    setRestoring(true);
    setError("");
    try {
      const res = await fetch(
        `/api/platform/apps/${app.org}/${app.repo}/restore`,
        { method: "POST" },
      );
      if (res.ok) onRefresh();
      else setError("Failed to restore");
    } catch {
      setError("Network error");
    } finally {
      setRestoring(false);
    }
  }

  async function handleToggle() {
    setToggling(true);
    setError("");
    const action = isRunning ? "stop" : "start";
    try {
      const res = await fetch(
        `/api/platform/apps/${app.org}/${app.repo}/${action}`,
        { method: "POST" },
      );
      if (res.ok) onRefresh();
      else setError(`Failed to ${action}`);
    } catch {
      setError("Network error");
    } finally {
      setToggling(false);
    }
  }

  async function handleDelete() {
    if (confirmText !== app.repo) return;
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/platform/apps/${app.org}/${app.repo}`, {
        method: "DELETE",
      });
      if (res.ok) onRefresh();
      else setError("Failed to delete");
    } catch {
      setError("Network error");
    } finally {
      setDeleting(false);
    }
  }

  const busy = restoring || deleting || toggling;

  return (
    <div className="card" style={{ opacity: 0.75, borderStyle: "dashed" }}>
      <div
        className="card-body"
        style={{ display: "flex", flexDirection: "column", gap: 12 }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
            }}
          >
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>
                {app.repo}
              </h3>
              <p className="text-sm text-muted">
                {app.org} &middot; archived {timeAgo}
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <StatusBadge status={app.status} />
              <span
                className="badge"
                style={{
                  background: "rgba(148, 163, 184, 0.15)",
                  color: "rgb(148, 163, 184)",
                }}
              >
                Archived
              </span>
            </div>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleToggle}
              disabled={busy}
              title={isRunning ? "Stop app" : "Start app"}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 12,
                color: isRunning ? "rgb(234, 179, 8)" : "var(--accent)",
              }}
            >
              {isRunning ? <PauseIcon /> : <PlayIcon />}
              {toggling
                ? isRunning
                  ? "Stopping..."
                  : "Starting..."
                : isRunning
                  ? "Stop"
                  : "Start"}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleRestore}
              disabled={busy}
              style={{
                color: "var(--accent)",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 12,
              }}
            >
              <RestoreIcon />
              {restoring ? "Restoring..." : "Restore"}
            </button>
            {!confirmDelete ? (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
                style={{
                  color: "rgb(239, 68, 68)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 12,
                }}
              >
                <TrashIcon />
                Delete
              </button>
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  flex: 1,
                }}
              >
                <input
                  className="input"
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={`Type "${app.repo}" to confirm`}
                  style={{ fontSize: 12, padding: "4px 8px", flex: 1 }}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setConfirmDelete(false);
                      setConfirmText("");
                    }
                    if (e.key === "Enter") handleDelete();
                  }}
                />
                <button
                  className="btn btn-sm"
                  onClick={handleDelete}
                  disabled={confirmText !== app.repo || deleting}
                  style={{
                    background: "rgba(239, 68, 68, 0.1)",
                    color: "rgb(239, 68, 68)",
                    border: "1px solid rgba(239, 68, 68, 0.2)",
                    fontSize: 12,
                  }}
                >
                  {deleting ? "Deleting..." : "Confirm"}
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setConfirmDelete(false);
                    setConfirmText("");
                  }}
                  style={{ fontSize: 12 }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
          {isRunning && app.url && (
            <a
              href={app.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm"
              style={{
                color: "var(--accent)",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {app.url.replace(/^https?:\/\//, "")}
              <ExternalLinkIcon />
            </a>
          )}
        </div>
        {error && (
          <p
            className="text-xs"
            style={{ color: "rgb(239, 68, 68)", margin: 0 }}
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function CreateAppForm({
  orgs,
  onCreated,
  onCancel,
}: {
  orgs: Org[];
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [org, setOrg] = useState(orgs[0]?.name || "");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/platform/apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org,
          name,
          description: description || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create app");
        return;
      }

      onCreated();
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
          Create App
        </h3>
        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: 16 }}
        >
          <div className="form-group">
            <label className="form-label" htmlFor="app-org">
              Organization
            </label>
            <select
              id="app-org"
              className="input"
              value={org}
              onChange={(e) => setOrg(e.target.value)}
              required
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.name}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="app-name">
              Name
            </label>
            <input
              id="app-name"
              className="input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-app"
              pattern="^[a-z][a-z0-9-]{1,30}[a-z0-9]$"
              required
            />
            <span className="form-hint">
              Lowercase, starts with a letter, 3-32 characters
            </span>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="app-desc">
              Description
            </label>
            <input
              id="app-desc"
              className="input"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
            />
          </div>
          {error && <p className="form-error">{error}</p>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-accent btn-sm"
              disabled={submitting}
            >
              {submitting ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function AppList() {
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [archivedApps, setArchivedApps] = useState<ArchivedAppInfo[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchApps = useCallback(async () => {
    try {
      const res = await fetch("/api/platform/apps");
      if (!res.ok) return;
      const data = await res.json();
      setApps(data.apps);
      setArchivedApps(data.archivedApps || []);
      setOrgs(data.orgs);
    } catch {
      // silent retry
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApps();
  }, [fetchApps]);

  // Adaptive polling: fast when deploying/pending/scaling, slow otherwise
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const hasTransient =
      apps.some((a) => a.status === "deploying" || a.status === "pending") ||
      archivedApps.some((a) => a.status === "degraded");
    const pollMs = hasTransient ? 5000 : 30000;

    intervalRef.current = setInterval(fetchApps, pollMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [apps, archivedApps, fetchApps]);

  if (loading) {
    return (
      <div className="flex justify-center" style={{ padding: 48 }}>
        <div className="spinner" />
      </div>
    );
  }

  function handleCreated() {
    setShowCreate(false);
    fetchApps();
  }

  if (apps.length === 0 && archivedApps.length === 0 && !showCreate) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">
          <svg
            className="icon-lg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={{ color: "var(--accent)" }}
          >
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
          </svg>
        </div>
        <h2>No apps deployed</h2>
        <p>
          Create an app from the template to get started with your first
          deployment.
        </p>
        <button className="btn btn-accent" onClick={() => setShowCreate(true)}>
          <PlusIcon />
          Create App
        </button>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: 16,
        }}
      >
        {!showCreate && (
          <button
            className="btn btn-accent btn-sm"
            onClick={() => setShowCreate(true)}
          >
            <PlusIcon />
            Create App
          </button>
        )}
      </div>
      {showCreate && (
        <CreateAppForm
          orgs={orgs}
          onCreated={handleCreated}
          onCancel={() => setShowCreate(false)}
        />
      )}
      <div className="grid-2">
        {apps.map((app) => (
          <AppCard key={app.namespace} app={app} onRefresh={fetchApps} />
        ))}
      </div>
      {archivedApps.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <button
            onClick={() => setShowArchived(!showArchived)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 0",
            }}
          >
            <span
              style={{
                transform: showArchived ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 0.15s",
                display: "inline-block",
              }}
            >
              &#9654;
            </span>
            Archived ({archivedApps.length})
          </button>
          {showArchived && (
            <div className="grid-2" style={{ marginTop: 12 }}>
              {archivedApps.map((app) => (
                <ArchivedAppCard
                  key={app.namespace}
                  app={app}
                  onRefresh={fetchApps}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
