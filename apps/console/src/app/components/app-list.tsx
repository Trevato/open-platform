"use client";

import { useState, useEffect, useCallback } from "react";

interface AppInfo {
  name: string;
  namespace: string;
  org: string;
  repo: string;
  ready: boolean;
  replicas: number;
  readyReplicas: number;
  url: string;
  createdAt: string | null;
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

function AppCard({ app }: { app: AppInfo }) {
  return (
    <div className="card">
      <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>
              {app.name}
            </h3>
            <p className="text-sm text-muted">{app.namespace}</p>
          </div>
          <span className={`badge ${app.ready ? "badge-ready" : "badge-failed"}`}>
            <span
              className={`status-dot ${app.ready ? "status-dot-ready" : "status-dot-failed"}`}
              aria-hidden="true"
            />
            {app.ready ? "Ready" : "Not Ready"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span className="text-xs text-muted">
            {app.readyReplicas}/{app.replicas} replica{app.replicas !== 1 ? "s" : ""}
          </span>
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
        </div>
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
        body: JSON.stringify({ org, name, description: description || undefined }),
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
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="form-group">
            <label className="form-label" htmlFor="app-org">Organization</label>
            <select
              id="app-org"
              className="input"
              value={org}
              onChange={(e) => setOrg(e.target.value)}
              required
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.name}>{o.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="app-name">Name</label>
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
            <span className="form-hint">Lowercase, starts with a letter, 3-32 characters</span>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="app-desc">Description</label>
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
            <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn btn-accent btn-sm" disabled={submitting}>
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
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const fetchApps = useCallback(async () => {
    try {
      const res = await fetch("/api/platform/apps");
      if (!res.ok) return;
      const data = await res.json();
      setApps(data.apps);
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

  if (apps.length === 0 && !showCreate) {
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
        <p>Create an app from the template to get started with your first deployment.</p>
        <button className="btn btn-accent" onClick={() => setShowCreate(true)}>
          <PlusIcon />
          Create App
        </button>
      </div>
    );
  }

  return (
    <>
      {showCreate && (
        <CreateAppForm
          orgs={orgs}
          onCreated={handleCreated}
          onCancel={() => setShowCreate(false)}
        />
      )}
      <div className="grid-2">
        {apps.map((app) => (
          <AppCard key={app.namespace} app={app} />
        ))}
      </div>
    </>
  );
}
