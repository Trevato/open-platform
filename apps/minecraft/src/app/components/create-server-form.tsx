"use client";

import { useState } from "react";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  background: "#0f0f13",
  border: "1px solid #2a2a3a",
  borderRadius: 8,
  color: "#e8e8f0",
  fontSize: 14,
  fontFamily: "system-ui, -apple-system, sans-serif",
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  color: "#8888a0",
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

export function CreateServerForm() {
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [version, setVersion] = useState("1.21.4");
  const [gameMode, setGameMode] = useState("survival");
  const [difficulty, setDifficulty] = useState("normal");
  const [maxPlayers, setMaxPlayers] = useState(20);
  const [motd, setMotd] = useState("");

  function reset() {
    setName("");
    setVersion("1.21.4");
    setGameMode("survival");
    setDifficulty("normal");
    setMaxPlayers(20);
    setMotd("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          version,
          game_mode: gameMode,
          difficulty,
          max_players: maxPlayers,
          motd: motd || "A Minecraft Server",
        }),
      });

      if (res.ok) {
        reset();
        setExpanded(false);
        window.location.reload();
      }
    } catch {
      // Silently ignore — user can retry
    } finally {
      setSubmitting(false);
    }
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "10px 20px",
          background: "#6366f1",
          color: "#fff",
          border: "none",
          borderRadius: 10,
          fontSize: 14,
          fontWeight: 500,
          cursor: "pointer",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <span style={{ fontSize: 18, lineHeight: 1, fontWeight: 300 }}>+</span>
        New Server
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: "#1a1a24",
        border: "1px solid #2a2a3a",
        borderRadius: 12,
        padding: 20,
      }}
    >
      {/* Name — full width */}
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Name</label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Server"
          style={inputStyle}
          onFocus={(e) =>
            (e.currentTarget.style.borderColor = "#6366f1")
          }
          onBlur={(e) =>
            (e.currentTarget.style.borderColor = "#2a2a3a")
          }
        />
      </div>

      {/* Grid: 2 columns */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "16px 16px",
          marginBottom: 16,
        }}
      >
        <div>
          <label style={labelStyle}>Version</label>
          <select
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            style={inputStyle}
            onFocus={(e) =>
              (e.currentTarget.style.borderColor = "#6366f1")
            }
            onBlur={(e) =>
              (e.currentTarget.style.borderColor = "#2a2a3a")
            }
          >
            <option value="1.21.4">1.21.4</option>
            <option value="1.20.4">1.20.4</option>
            <option value="1.19.4">1.19.4</option>
            <option value="1.18.2">1.18.2</option>
          </select>
        </div>

        <div>
          <label style={labelStyle}>Game Mode</label>
          <select
            value={gameMode}
            onChange={(e) => setGameMode(e.target.value)}
            style={inputStyle}
            onFocus={(e) =>
              (e.currentTarget.style.borderColor = "#6366f1")
            }
            onBlur={(e) =>
              (e.currentTarget.style.borderColor = "#2a2a3a")
            }
          >
            <option value="survival">Survival</option>
            <option value="creative">Creative</option>
            <option value="adventure">Adventure</option>
            <option value="spectator">Spectator</option>
          </select>
        </div>

        <div>
          <label style={labelStyle}>Difficulty</label>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            style={inputStyle}
            onFocus={(e) =>
              (e.currentTarget.style.borderColor = "#6366f1")
            }
            onBlur={(e) =>
              (e.currentTarget.style.borderColor = "#2a2a3a")
            }
          >
            <option value="peaceful">Peaceful</option>
            <option value="easy">Easy</option>
            <option value="normal">Normal</option>
            <option value="hard">Hard</option>
          </select>
        </div>

        <div>
          <label style={labelStyle}>Max Players</label>
          <input
            type="number"
            value={maxPlayers}
            onChange={(e) => setMaxPlayers(Number(e.target.value))}
            min={1}
            max={100}
            style={inputStyle}
            onFocus={(e) =>
              (e.currentTarget.style.borderColor = "#6366f1")
            }
            onBlur={(e) =>
              (e.currentTarget.style.borderColor = "#2a2a3a")
            }
          />
        </div>
      </div>

      {/* MOTD — full width */}
      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle}>MOTD</label>
        <input
          type="text"
          value={motd}
          onChange={(e) => setMotd(e.target.value)}
          placeholder="A Minecraft Server"
          style={inputStyle}
          onFocus={(e) =>
            (e.currentTarget.style.borderColor = "#6366f1")
          }
          onBlur={(e) =>
            (e.currentTarget.style.borderColor = "#2a2a3a")
          }
        />
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={() => {
            reset();
            setExpanded(false);
          }}
          style={{
            padding: "9px 18px",
            background: "none",
            color: "#8888a0",
            border: "1px solid #2a2a3a",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting || !name.trim()}
          style={{
            padding: "9px 18px",
            background:
              submitting || !name.trim() ? "#4a4a6a" : "#6366f1",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            cursor:
              submitting || !name.trim() ? "not-allowed" : "pointer",
            opacity: submitting || !name.trim() ? 0.6 : 1,
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          {submitting ? "Creating..." : "Create"}
        </button>
      </div>
    </form>
  );
}
