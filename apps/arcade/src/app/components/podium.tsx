import Link from "next/link";

interface PodiumEntry {
  rank: number;
  player_name: string;
  score: number;
}

const podiumColors: Record<number, { bg: string; border: string; text: string }> = {
  1: { bg: "#2a2200", border: "#fbbf24", text: "#fbbf24" },
  2: { bg: "#1a1a24", border: "#94a3b8", text: "#94a3b8" },
  3: { bg: "#1f1510", border: "#cd7f32", text: "#cd7f32" },
};

const podiumHeights: Record<number, number> = {
  1: 160,
  2: 120,
  3: 100,
};

export function Podium({ entries }: { entries: PodiumEntry[] }) {
  if (entries.length < 3) return null;

  // Display order: 2nd, 1st, 3rd
  const displayOrder = [entries[1], entries[0], entries[2]];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        gap: 12,
        padding: "24px 0",
      }}
    >
      {displayOrder.map((entry) => {
        const colors = podiumColors[entry.rank];
        const height = podiumHeights[entry.rank];
        return (
          <div
            key={entry.rank}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Link
              href={`/players/${entry.player_name}`}
              style={{
                color: "#e2e2e8",
                textDecoration: "none",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {entry.player_name}
            </Link>
            <div
              style={{
                width: 100,
                height,
                background: colors.bg,
                border: `2px solid ${colors.border}`,
                borderRadius: "12px 12px 0 0",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
              }}
            >
              <span
                style={{
                  fontSize: entry.rank === 1 ? 28 : 22,
                  fontWeight: 700,
                  color: colors.text,
                }}
              >
                #{entry.rank}
              </span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#e2e2e8",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {entry.score.toLocaleString()}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
