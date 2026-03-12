import Link from "next/link";
import { StatusBadge } from "./status-badge";

export const TIER_RESOURCES = {
  free: { cpu: "500m", memory: "2Gi", storage: "10Gi", label: "Free" },
  pro: { cpu: "2", memory: "8Gi", storage: "50Gi", label: "Pro" },
  team: { cpu: "4", memory: "16Gi", storage: "100Gi", label: "Team" },
} as const;

const TIER_COLORS: Record<string, { bg: string; text: string }> = {
  free: { bg: "rgba(255,255,255,0.06)", text: "var(--text-muted)" },
  pro: { bg: "rgba(99,179,237,0.12)", text: "#63b3ed" },
  team: { bg: "rgba(183,148,244,0.12)", text: "#b794f4" },
};

export interface Instance {
  id: string;
  slug: string;
  display_name: string;
  status: string;
  tier?: string;
  created_at: string;
  owner_name?: string;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function TierBadge({ tier }: { tier: string }) {
  const colors = TIER_COLORS[tier] || TIER_COLORS.free;
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 500,
        padding: "2px 8px",
        borderRadius: 4,
        background: colors.bg,
        color: colors.text,
        textTransform: "capitalize",
      }}
    >
      {tier}
    </span>
  );
}

function ResourceStats({ tier }: { tier: string }) {
  const resources = TIER_RESOURCES[tier as keyof typeof TIER_RESOURCES] || TIER_RESOURCES.free;
  return (
    <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--text-muted)" }}>
      <span>{resources.cpu} CPU</span>
      <span>{resources.memory} RAM</span>
      <span>{resources.storage} disk</span>
    </div>
  );
}

export function InstanceCard({ instance, showOwner }: { instance: Instance; showOwner?: boolean }) {
  const tier = instance.tier || "free";

  return (
    <Link href={`/dashboard/${instance.slug}`}>
      <div className="card card-interactive">
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>
                {instance.display_name}
              </h3>
              <p className="text-sm text-muted" style={{ marginBottom: 0 }}>{instance.slug}</p>
              {showOwner && instance.owner_name && (
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, marginBottom: 0, opacity: 0.7 }}>
                  {instance.owner_name}
                </p>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
              <StatusBadge status={instance.status} />
              <TierBadge tier={tier} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span className="text-xs text-muted">
              Created {formatDate(instance.created_at)}
            </span>
            <ResourceStats tier={tier} />
          </div>
        </div>
      </div>
    </Link>
  );
}
