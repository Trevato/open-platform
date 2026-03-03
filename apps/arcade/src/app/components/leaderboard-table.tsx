import Link from "next/link";

interface ScoreEntry {
  rank: number;
  player_name: string;
  player_id: string;
  score: number;
  created_at: string;
  game_name?: string;
  game_slug?: string;
  game_icon?: string;
}

function rankStyle(rank: number): React.CSSProperties {
  if (rank === 1) return { color: "#fbbf24", fontWeight: 700 };
  if (rank === 2) return { color: "#94a3b8", fontWeight: 700 };
  if (rank === 3) return { color: "#cd7f32", fontWeight: 700 };
  return { color: "#888" };
}

function rankLabel(rank: number): string {
  if (rank === 1) return "1st";
  if (rank === 2) return "2nd";
  if (rank === 3) return "3rd";
  return `#${rank}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const cellStyle: React.CSSProperties = {
  padding: "12px 16px",
  borderBottom: "1px solid #1e1e2e",
  fontSize: 14,
};

export function LeaderboardTable({
  scores,
  showGame = false,
}: {
  scores: ScoreEntry[];
  showGame?: boolean;
}) {
  if (scores.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "48px 0",
          color: "#555",
          fontSize: 14,
        }}
      >
        No scores yet. Be the first to play!
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          background: "#1a1a24",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <thead>
          <tr style={{ borderBottom: "1px solid #2a2a3a" }}>
            <th
              style={{
                ...cellStyle,
                textAlign: "left",
                color: "#666",
                fontWeight: 500,
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                width: 60,
              }}
            >
              Rank
            </th>
            <th
              style={{
                ...cellStyle,
                textAlign: "left",
                color: "#666",
                fontWeight: 500,
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Player
            </th>
            {showGame && (
              <th
                style={{
                  ...cellStyle,
                  textAlign: "left",
                  color: "#666",
                  fontWeight: 500,
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Game
              </th>
            )}
            <th
              style={{
                ...cellStyle,
                textAlign: "right",
                color: "#666",
                fontWeight: 500,
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Score
            </th>
            <th
              style={{
                ...cellStyle,
                textAlign: "right",
                color: "#666",
                fontWeight: 500,
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              When
            </th>
          </tr>
        </thead>
        <tbody>
          {scores.map((entry, i) => (
            <tr
              key={`${entry.player_id}-${entry.created_at}-${i}`}
              style={{
                transition: "background 0.1s",
              }}
            >
              <td style={{ ...cellStyle, ...rankStyle(entry.rank) }}>
                {rankLabel(entry.rank)}
              </td>
              <td style={cellStyle}>
                <Link
                  href={`/players/${entry.player_name}`}
                  style={{
                    color: "#e2e2e8",
                    textDecoration: "none",
                    fontWeight: 500,
                  }}
                >
                  {entry.player_name}
                </Link>
              </td>
              {showGame && (
                <td style={cellStyle}>
                  <Link
                    href={`/games/${entry.game_slug}`}
                    style={{
                      color: "#888",
                      textDecoration: "none",
                      fontSize: 13,
                    }}
                  >
                    {entry.game_icon} {entry.game_name}
                  </Link>
                </td>
              )}
              <td
                style={{
                  ...cellStyle,
                  textAlign: "right",
                  fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                  color: "#e2e2e8",
                }}
              >
                {entry.score.toLocaleString()}
              </td>
              <td
                style={{
                  ...cellStyle,
                  textAlign: "right",
                  color: "#666",
                  fontSize: 13,
                }}
              >
                {formatDate(entry.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
