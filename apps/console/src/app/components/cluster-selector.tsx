"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";

interface Instance {
  slug: string;
  display_name: string;
  status: string;
}

function statusColor(status: string): string {
  switch (status) {
    case "ready":
      return "var(--status-ready)";
    case "provisioning":
    case "pending":
      return "var(--status-pending)";
    case "failed":
    case "error":
      return "var(--danger)";
    default:
      return "var(--text-muted)";
  }
}

export function ClusterSelector({ isAdmin }: { isAdmin: boolean }) {
  const params = useParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [instances, setInstances] = useState<Instance[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const slug = typeof params.slug === "string" ? params.slug : undefined;

  const fetchInstances = useCallback(async () => {
    try {
      const url = isAdmin ? "/api/instances?all=true" : "/api/instances";
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      setInstances(data.instances || []);
    } catch {
      // silent
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const current = instances.find((i) => i.slug === slug);
  const label = current ? current.display_name : "Instances";

  return (
    <div className="cluster-selector" ref={ref}>
      <span className="cluster-selector-sep">/</span>
      <button
        className="cluster-selector-trigger"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {label}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`cluster-selector-chevron${open ? " open" : ""}`}
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="cluster-selector-dropdown" role="listbox">
          {instances.length === 0 && (
            <div
              className="cluster-option"
              style={{ color: "var(--text-muted)", cursor: "default" }}
            >
              No instances
            </div>
          )}
          {instances.map((instance) => (
            <button
              key={instance.slug}
              className={`cluster-option${instance.slug === slug ? " active" : ""}`}
              role="option"
              aria-selected={instance.slug === slug}
              onClick={() => {
                router.push(`/dashboard/${instance.slug}`);
                setOpen(false);
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: statusColor(instance.status),
                  flexShrink: 0,
                }}
                aria-hidden="true"
              />
              {instance.display_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
