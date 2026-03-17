"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface ServiceStatus {
  name: string;
  namespace: string;
  ready: boolean;
  replicas: { ready: number; total: number };
  url: string;
}

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

const SERVICE_ICONS: Record<
  string,
  { className: string; svg: React.ReactNode }
> = {
  Forgejo: {
    className: "service-icon-git",
    svg: (
      <>
        <circle cx="18" cy="18" r="3" />
        <circle cx="6" cy="6" r="3" />
        <path d="M6 21V9a9 9 0 0 0 9 9" />
      </>
    ),
  },
  Woodpecker: {
    className: "service-icon-ci",
    svg: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
  },
  Headlamp: {
    className: "service-icon-dashboard",
    svg: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18" />
        <path d="M9 21V9" />
      </>
    ),
  },
  MinIO: {
    className: "service-icon-storage",
    svg: (
      <>
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </>
    ),
  },
  PostgreSQL: {
    className: "service-icon-db",
    svg: (
      <>
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M3 5v14a9 3 0 0 0 18 0V5" />
        <path d="M3 12a9 3 0 0 0 18 0" />
      </>
    ),
  },
};

function ServiceIcon({ name }: { name: string }) {
  const icon = SERVICE_ICONS[name];
  if (!icon) return null;

  return (
    <div className={`service-icon ${icon.className}`}>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {icon.svg}
      </svg>
    </div>
  );
}

function StatusDot({ ready }: { ready: boolean }) {
  return (
    <span
      className={`status-dot ${ready ? "status-dot-ready" : "status-dot-failed"}`}
      aria-hidden="true"
    />
  );
}

function formatUrl(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

function AppIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}

export function PlatformDashboard() {
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [servicesRes, appsRes] = await Promise.all([
        fetch("/api/platform/services"),
        fetch("/api/platform/apps"),
      ]);

      if (servicesRes.ok) {
        const data = await servicesRes.json();
        setServices(data.services);
      }

      if (appsRes.ok) {
        const data = await appsRes.json();
        setApps(data.apps);
      }
    } catch {
      // silent — retry on next interval
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 10000);
    return () => clearInterval(id);
  }, [fetchData]);

  const allHealthy = services.length > 0 && services.every((s) => s.ready);
  const healthyCount = services.filter((s) => s.ready).length;

  return (
    <>
      <div className="section">
        <div className="section-header">
          Platform Services
          {!loading && services.length > 0 && (
            <span
              style={{
                float: "right",
                fontWeight: 400,
                textTransform: "none",
                letterSpacing: "normal",
              }}
            >
              <StatusDot ready={allHealthy} />{" "}
              <span style={{ marginLeft: 4 }}>
                {healthyCount}/{services.length} healthy
              </span>
            </span>
          )}
        </div>

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
            <div className="spinner" />
          </div>
        ) : (
          <div className="grid-3">
            {services.map((service) => {
              const isExternal = service.url.startsWith("https://");
              const CardTag = isExternal ? "a" : "div";
              const linkProps = isExternal
                ? {
                    href: service.url,
                    target: "_blank" as const,
                    rel: "noopener noreferrer",
                  }
                : {};

              return (
                <CardTag
                  key={service.name}
                  className="card service-card"
                  {...linkProps}
                >
                  <div className="service-card-header">
                    <ServiceIcon name={service.name} />
                    <h3>{service.name}</h3>
                    <span
                      className={`badge ${service.ready ? "badge-ready" : "badge-failed"}`}
                      style={{ marginLeft: "auto" }}
                    >
                      <StatusDot ready={service.ready} />
                      {service.ready ? "Ready" : "Down"}
                    </span>
                  </div>
                  {isExternal ? (
                    <span className="service-card-url">
                      {formatUrl(service.url)}
                    </span>
                  ) : (
                    <span
                      className="text-xs text-muted"
                      style={{ fontFamily: "monospace" }}
                    >
                      {service.url}
                    </span>
                  )}
                  <span className="text-xs text-muted">
                    {service.replicas.ready}/{service.replicas.total} replica
                    {service.replicas.total !== 1 ? "s" : ""}
                  </span>
                </CardTag>
              );
            })}
          </div>
        )}
      </div>

      <div className="section">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <span className="section-header" style={{ marginBottom: 0 }}>
            Deployed Apps
          </span>
          <Link href="/dashboard/apps" className="btn btn-ghost btn-sm">
            View All
          </Link>
        </div>

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
            <div className="spinner" />
          </div>
        ) : apps.length === 0 ? (
          <div className="card">
            <div
              style={{
                padding: "40px 20px",
                textAlign: "center",
              }}
            >
              <p className="text-sm text-muted">
                No apps deployed yet. Create one from the template to get
                started.
              </p>
              <Link
                href="/dashboard/apps"
                className="btn btn-accent btn-sm"
                style={{ marginTop: 16 }}
              >
                Deploy App
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid-2">
            {apps.map((app) => (
              <a
                key={app.namespace}
                href={app.url}
                target="_blank"
                rel="noopener noreferrer"
                className="card service-card"
              >
                <div className="service-card-header">
                  <div className="service-icon" style={{ background: "var(--accent-bg)", color: "var(--accent)" }}>
                    <AppIcon />
                  </div>
                  <h3>{app.name}</h3>
                  <span
                    className={`badge ${app.ready ? "badge-ready" : "badge-failed"}`}
                    style={{ marginLeft: "auto" }}
                  >
                    <StatusDot ready={app.ready} />
                    {app.ready ? "Ready" : "Down"}
                  </span>
                </div>
                <span className="service-card-url">{formatUrl(app.url)}</span>
                <span className="text-xs text-muted">
                  {app.org}/{app.repo}
                </span>
              </a>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
