"use client";

import { useState, useEffect, useCallback } from "react";

interface AppInfo {
  name: string;
  namespace: string;
  org: string;
  repo: string;
  ready: boolean;
  replicas: { ready: number; total: number };
  url: string;
  createdAt: string | null;
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

function AppCard({ app }: { app: AppInfo }) {
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
              {app.name}
            </h3>
            <p className="text-sm text-muted">{app.namespace}</p>
          </div>
          <span
            className={`badge ${app.ready ? "badge-ready" : "badge-failed"}`}
          >
            <span
              className={`status-dot ${app.ready ? "status-dot-ready" : "status-dot-failed"}`}
              aria-hidden="true"
            />
            {app.ready ? "Ready" : "Not Ready"}
          </span>
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
          >
            {app.url.replace(/^https?:\/\//, "")}
            <ExternalLinkIcon />
          </a>
        </div>
      </div>
    </div>
  );
}

export function InstanceAppList({ slug }: { slug: string }) {
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchApps = useCallback(async () => {
    try {
      const res = await fetch(`/api/instances/${slug}/apps`);
      if (!res.ok) return;
      const data = await res.json();
      setApps(data.apps || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [slug]);

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

  if (apps.length === 0) {
    return (
      <div className="empty-state">
        <h2>No apps deployed</h2>
        <p>
          Apps will appear here once they are deployed to this instance.
        </p>
      </div>
    );
  }

  return (
    <div className="grid-2">
      {apps.map((app) => (
        <AppCard key={app.namespace} app={app} />
      ))}
    </div>
  );
}
