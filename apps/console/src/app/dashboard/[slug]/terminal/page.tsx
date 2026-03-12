import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getInstanceAccess } from "@/lib/instance-access";
import { TerminalView } from "./terminal-view";

const TIER_COLORS: Record<string, { bg: string; text: string }> = {
  free: { bg: "rgba(255,255,255,0.06)", text: "var(--text-muted)" },
  pro: { bg: "rgba(99,179,237,0.12)", text: "#63b3ed" },
  team: { bg: "rgba(183,148,244,0.12)", text: "#b794f4" },
};

export default async function TerminalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const access = await getInstanceAccess(slug);

  if (!access) {
    notFound();
  }

  const instance = access.instance;

  if (instance.status !== "ready") {
    redirect(`/dashboard/${slug}`);
  }

  const tier = instance.tier || "free";
  const tierColor = TIER_COLORS[tier] || TIER_COLORS.free;

  return (
    <div className="terminal-page">
      <div className="terminal-header">
        <Link
          href={`/dashboard/${slug}`}
          className="text-sm text-muted"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            transition: "color 0.15s",
          }}
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
            aria-hidden="true"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {instance.display_name}
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="terminal-slug">{slug}</span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              padding: "1px 6px",
              borderRadius: 3,
              background: tierColor.bg,
              color: tierColor.text,
              textTransform: "capitalize",
            }}
          >
            {tier}
          </span>
        </div>
      </div>
      <TerminalView slug={slug} />
    </div>
  );
}
