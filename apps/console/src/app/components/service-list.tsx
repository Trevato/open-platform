"use client";

import { useState, useEffect, useCallback } from "react";

interface ServiceStatus {
  name: string;
  namespace: string;
  ready: boolean;
  replicas: number;
  readyReplicas: number;
  url: string;
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

function ServiceCard({ service }: { service: ServiceStatus }) {
  const isExternal = service.url.startsWith("https://");

  return (
    <div className="card">
      <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>
              {service.name}
            </h3>
            <p className="text-sm text-muted">{service.namespace}</p>
          </div>
          <span className={`badge ${service.ready ? "badge-ready" : "badge-failed"}`}>
            <span
              className={`status-dot ${service.ready ? "status-dot-ready" : "status-dot-failed"}`}
              aria-hidden="true"
            />
            {service.ready ? "Ready" : "Not Ready"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span className="text-sm text-muted">
            {service.readyReplicas}/{service.replicas} ready
          </span>
          {isExternal ? (
            <a
              href={service.url}
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
              {service.url.replace(/^https?:\/\//, "")}
              <ExternalLinkIcon />
            </a>
          ) : (
            <span className="text-xs text-muted" style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>
              {service.url}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function ServiceList() {
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchServices = useCallback(async () => {
    try {
      const res = await fetch("/api/platform/services");
      if (!res.ok) return;
      const data = await res.json();
      setServices(data.services);
    } catch {
      // silent retry
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServices();
    const id = setInterval(fetchServices, 10_000);
    return () => clearInterval(id);
  }, [fetchServices]);

  if (loading) {
    return (
      <div className="flex justify-center" style={{ padding: 48 }}>
        <div className="spinner" />
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <div className="empty-state">
        <h2>No services found</h2>
        <p>Platform services will appear here once they are deployed.</p>
      </div>
    );
  }

  return (
    <div className="grid-2">
      {services.map((service) => (
        <ServiceCard key={`${service.namespace}-${service.name}`} service={service} />
      ))}
    </div>
  );
}
