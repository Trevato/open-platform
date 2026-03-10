"use client";

import { useState, useEffect, useCallback } from "react";
import { InstanceCard } from "./instance-card";

interface Instance {
  id: string;
  slug: string;
  display_name: string;
  status: string;
  created_at: string;
}

const ACTIVE_STATUSES = ["pending", "provisioning", "terminating"];

export function InstanceList({
  initialInstances,
}: {
  initialInstances: Instance[];
}) {
  const [instances, setInstances] = useState(initialInstances);

  const hasActive = instances.some((i) => ACTIVE_STATUSES.includes(i.status));

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/instances");
      if (!res.ok) return;
      const data = await res.json();
      setInstances(data.instances);
    } catch {
      // silent — retry on next interval
    }
  }, []);

  useEffect(() => {
    if (!hasActive) return;
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, [hasActive, poll]);

  return (
    <div className="grid-2">
      {instances.map((instance) => (
        <InstanceCard key={instance.id} instance={instance} />
      ))}
    </div>
  );
}
