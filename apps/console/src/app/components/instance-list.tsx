"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { InstanceCard, type Instance } from "./instance-card";

const ACTIVE_STATUSES = ["pending", "provisioning", "terminating"];
const STATUS_OPTIONS = ["all", "ready", "pending", "provisioning", "stopped", "terminating"] as const;
const TIER_OPTIONS = ["all", "free", "pro", "team"] as const;
const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "name", label: "Name A-Z" },
] as const;

export function InstanceList({
  initialInstances,
  isAdmin = false,
}: {
  initialInstances: Instance[];
  isAdmin?: boolean;
}) {
  const [instances, setInstances] = useState(initialInstances);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [sort, setSort] = useState<string>("newest");

  const hasActive = instances.some((i) => ACTIVE_STATUSES.includes(i.status));

  const poll = useCallback(async () => {
    try {
      const url = isAdmin ? "/api/instances?all=true" : "/api/instances";
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      setInstances(data.instances);
    } catch {
      // silent
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!hasActive) return;
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, [hasActive, poll]);

  const filtered = useMemo(() => {
    let result = instances;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (i) =>
          i.display_name.toLowerCase().includes(q) ||
          i.slug.toLowerCase().includes(q) ||
          (i.owner_name && i.owner_name.toLowerCase().includes(q))
      );
    }

    if (statusFilter !== "all") {
      result = result.filter((i) => i.status === statusFilter);
    }

    if (tierFilter !== "all") {
      result = result.filter((i) => (i.tier || "free") === tierFilter);
    }

    result = [...result].sort((a, b) => {
      switch (sort) {
        case "oldest":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "name":
          return a.display_name.localeCompare(b.display_name);
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

    return result;
  }, [instances, search, statusFilter, tierFilter, sort]);

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        <input
          type="text"
          className="input"
          placeholder={isAdmin ? "Search by name, slug, or owner..." : "Search instances..."}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: "1 1 200px", minWidth: 200, maxWidth: 320, height: 34, fontSize: 13 }}
        />
        <select
          className="input"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ width: "auto", height: 34, fontSize: 13, paddingRight: 28 }}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All statuses" : s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value)}
          style={{ width: "auto", height: 34, fontSize: 13, paddingRight: 28 }}
        >
          {TIER_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t === "all" ? "All tiers" : t.charAt(0).toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          style={{ width: "auto", height: 34, fontSize: 13, paddingRight: 28 }}
        >
          {SORT_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted" style={{ padding: "24px 0", textAlign: "center" }}>
          {search || statusFilter !== "all" || tierFilter !== "all"
            ? "No instances match your filters."
            : "No instances yet."}
        </p>
      ) : (
        <div className="grid-2">
          {filtered.map((instance) => (
            <InstanceCard key={instance.id} instance={instance} showOwner={isAdmin} />
          ))}
        </div>
      )}
    </div>
  );
}
