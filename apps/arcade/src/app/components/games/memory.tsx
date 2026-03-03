"use client";

import { useState, useCallback, useRef, useEffect } from "react";

const EMOJIS = ["🎮", "🎯", "🎲", "🎪", "🎨", "🎭", "🎵", "🎬"];
const GRID_SIZE = 16;
const REVEAL_DELAY = 800;

type GameState = "idle" | "playing" | "gameover";

interface Card {
  id: number;
  emoji: string;
  flipped: boolean;
  matched: boolean;
}

function shuffle<T>(array: T[]): T[] {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createDeck(): Card[] {
  const pairs = [...EMOJIS, ...EMOJIS];
  return shuffle(pairs).map((emoji, i) => ({
    id: i,
    emoji,
    flipped: false,
    matched: false,
  }));
}

function calcScore(seconds: number, moves: number): number {
  return Math.max(1000 - seconds * 10 - moves * 20, 100);
}

export default function MemoryGame({
  slug,
  isLoggedIn,
  onScoreSubmitted,
}: {
  slug: string;
  isLoggedIn: boolean;
  onScoreSubmitted: () => void;
}) {
  const [cards, setCards] = useState<Card[]>(createDeck);
  const [state, setState] = useState<GameState>("idle");
  const [selected, setSelected] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [pairs, setPairs] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [score, setScore] = useState(0);
  const [result, setResult] = useState<{
    personalBest: number;
    rank: number;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const lockRef = useRef(false);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 200);
  }, []);

  useEffect(() => {
    return () => stopTimer();
  }, [stopTimer]);

  const submitScore = useCallback(
    async (finalScore: number) => {
      if (!isLoggedIn) return;
      setSubmitting(true);
      try {
        const res = await fetch(`/api/games/${slug}/scores`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ score: finalScore }),
        });
        if (res.ok) {
          const data = await res.json();
          setResult({ personalBest: data.personalBest, rank: data.rank });
          onScoreSubmitted();
        }
      } catch {
        /* silent */
      } finally {
        setSubmitting(false);
      }
    },
    [slug, isLoggedIn, onScoreSubmitted]
  );

  const handleGameOver = useCallback(
    (finalElapsed: number, finalMoves: number) => {
      stopTimer();
      const finalScore = calcScore(finalElapsed, finalMoves);
      setScore(finalScore);
      setState("gameover");
      submitScore(finalScore);
    },
    [stopTimer, submitScore]
  );

  const handleCardClick = useCallback(
    (id: number) => {
      if (lockRef.current) return;

      setCards((prev) => {
        const card = prev[id];
        if (card.matched || card.flipped) return prev;

        if (state === "idle") {
          setState("playing");
          startTimer();
        }

        const next = prev.map((c) =>
          c.id === id ? { ...c, flipped: true } : c
        );

        const newSelected = [...selected, id];

        if (newSelected.length === 2) {
          lockRef.current = true;
          const [firstId, secondId] = newSelected;
          const first = next[firstId];
          const second = next[secondId];

          setMoves((m) => m + 1);

          if (first.emoji === second.emoji) {
            const matched = next.map((c) =>
              c.id === firstId || c.id === secondId
                ? { ...c, matched: true }
                : c
            );
            const newPairs = pairs + 1;
            setPairs(newPairs);
            setSelected([]);
            lockRef.current = false;

            if (newPairs === EMOJIS.length) {
              const finalElapsed = Math.floor(
                (Date.now() - startTimeRef.current) / 1000
              );
              setElapsed(finalElapsed);
              // Defer game over to next tick so state updates flush
              setTimeout(
                () => handleGameOver(finalElapsed, moves + 1),
                300
              );
            }

            return matched;
          } else {
            setTimeout(() => {
              setCards((c) =>
                c.map((card) =>
                  card.id === firstId || card.id === secondId
                    ? { ...card, flipped: false }
                    : card
                )
              );
              setSelected([]);
              lockRef.current = false;
            }, REVEAL_DELAY);
          }

          return next;
        }

        setSelected(newSelected);
        return next;
      });
    },
    [state, selected, pairs, moves, startTimer, handleGameOver]
  );

  const resetGame = useCallback(() => {
    stopTimer();
    setCards(createDeck());
    setState("idle");
    setSelected([]);
    setMoves(0);
    setPairs(0);
    setElapsed(0);
    setScore(0);
    setResult(null);
    lockRef.current = false;
  }, [stopTimer]);

  return (
    <div
      style={{
        background: "#12121a",
        borderRadius: 12,
        border: "1px solid #2a2a3a",
        padding: 24,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Stats Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 32,
          marginBottom: 20,
          flexWrap: "wrap",
        }}
      >
        <Stat label="Time" value={formatTime(elapsed)} />
        <Stat label="Moves" value={String(moves)} />
        <Stat
          label="Pairs"
          value={`${pairs} / ${EMOJIS.length}`}
          color="#a855f7"
        />
      </div>

      {/* Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 10,
          maxWidth: 400,
          margin: "0 auto",
        }}
      >
        {cards.map((card) => (
          <CardTile
            key={card.id}
            card={card}
            onClick={() => handleCardClick(card.id)}
          />
        ))}
      </div>

      {/* Idle hint */}
      {state === "idle" && (
        <p
          style={{
            textAlign: "center",
            color: "#666",
            fontSize: 14,
            marginTop: 16,
            marginBottom: 0,
          }}
        >
          Click a card to start
        </p>
      )}

      {/* Game Over Overlay */}
      {state === "gameover" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(15, 15, 19, 0.92)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backdropFilter: "blur(4px)",
            zIndex: 10,
          }}
        >
          <div style={{ textAlign: "center", padding: 32 }}>
            <h2
              style={{
                margin: "0 0 8px",
                fontSize: 28,
                fontWeight: 700,
                background: "linear-gradient(135deg, #6c5ce7, #a855f7)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Complete!
            </h2>
            <div
              style={{
                fontSize: 48,
                fontWeight: 800,
                color: "#e2e2e8",
                marginBottom: 16,
              }}
            >
              {score.toLocaleString()}
            </div>

            <div
              style={{
                display: "flex",
                gap: 24,
                justifyContent: "center",
                marginBottom: 24,
              }}
            >
              <MiniStat label="Time" value={formatTime(elapsed)} />
              <MiniStat label="Moves" value={String(moves)} />
            </div>

            {isLoggedIn && result && (
              <div
                style={{
                  display: "flex",
                  gap: 24,
                  justifyContent: "center",
                  marginBottom: 24,
                }}
              >
                <MiniStat
                  label="Rank"
                  value={`#${result.rank}`}
                  color="#a855f7"
                />
                <MiniStat
                  label="Best"
                  value={result.personalBest.toLocaleString()}
                  color="#22c55e"
                />
              </div>
            )}

            {isLoggedIn && submitting && (
              <p style={{ color: "#888", fontSize: 13, marginBottom: 16 }}>
                Saving score...
              </p>
            )}

            {!isLoggedIn && (
              <p style={{ color: "#888", fontSize: 13, marginBottom: 16 }}>
                Sign in to save your score
              </p>
            )}

            <button
              onClick={resetGame}
              style={{
                padding: "12px 32px",
                background: "linear-gradient(135deg, #6c5ce7, #a855f7)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer",
                transition: "transform 0.15s, box-shadow 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow =
                  "0 4px 16px rgba(168, 85, 247, 0.3)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              Play Again
            </button>
          </div>
        </div>
      )}

      <style>{`
        .memory-card-inner {
          position: relative;
          width: 100%;
          height: 100%;
          transition: transform 0.4s ease;
          transform-style: preserve-3d;
        }
        .memory-card-inner.flipped {
          transform: rotateY(180deg);
        }
        .memory-card-face {
          position: absolute;
          inset: 0;
          backface-visibility: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
        }
        .memory-card-front {
          background: #2a2a3a;
          color: #555;
          font-size: 24px;
          font-weight: 700;
        }
        .memory-card-back {
          background: #1a1a24;
          transform: rotateY(180deg);
          font-size: 36px;
        }
        .memory-card-container {
          perspective: 600px;
          aspect-ratio: 1;
          cursor: pointer;
          user-select: none;
        }
        .memory-card-container:hover .memory-card-front {
          background: #333348;
        }
        .memory-card-matched .memory-card-back {
          box-shadow: 0 0 12px rgba(34, 197, 94, 0.4);
          border: 1px solid rgba(34, 197, 94, 0.5);
        }
      `}</style>
    </div>
  );
}

function CardTile({
  card,
  onClick,
}: {
  card: Card;
  onClick: () => void;
}) {
  const isFlipped = card.flipped || card.matched;

  return (
    <div
      className={`memory-card-container${card.matched ? " memory-card-matched" : ""}`}
      onClick={onClick}
    >
      <div className={`memory-card-inner${isFlipped ? " flipped" : ""}`}>
        <div className="memory-card-face memory-card-front">?</div>
        <div className="memory-card-face memory-card-back">{card.emoji}</div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  color = "#e2e2e8",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          fontSize: 11,
          color: "#666",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 700,
          color,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  color = "#e2e2e8",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 11, color: "#666", marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
