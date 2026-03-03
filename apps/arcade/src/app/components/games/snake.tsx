"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameProps } from "./game-loader";

// --- Constants ---

const GRID = 20;
const BASE_SPEED = 150;
const MIN_SPEED = 80;
const SPEED_DECAY = 3;

const COLORS = {
  bg: "#12121a",
  grid: "#1a1a24",
  head: "#6c5ce7",
  tail: "#4a3fb0",
  food: "#ef4444",
  foodGlow: "rgba(239,68,68,0.35)",
  text: "#e2e2e8",
  muted: "#888",
  accent: "#a855f7",
  overlay: "rgba(15,15,19,0.85)",
  panel: "#1a1a24",
  border: "#2a2a3a",
};

type Dir = [number, number];
type Pt = { x: number; y: number };
type Phase = "idle" | "playing" | "gameover";

const DIR: Record<string, Dir> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

const OPPOSITE: Record<string, string> = {
  ArrowUp: "ArrowDown",
  ArrowDown: "ArrowUp",
  ArrowLeft: "ArrowRight",
  ArrowRight: "ArrowLeft",
};

// --- Helpers ---

function randomFood(snake: Pt[]): Pt {
  const occupied = new Set(snake.map((p) => `${p.x},${p.y}`));
  let pt: Pt;
  do {
    pt = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
  } while (occupied.has(`${pt.x},${pt.y}`));
  return pt;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function rgbStr(r: number, g: number, b: number): string {
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

function segmentColor(index: number, total: number): string {
  const headRgb = hexToRgb(COLORS.head);
  const tailRgb = hexToRgb(COLORS.tail);
  const t = total <= 1 ? 0 : index / (total - 1);
  return rgbStr(
    lerp(headRgb[0], tailRgb[0], t),
    lerp(headRgb[1], tailRgb[1], t),
    lerp(headRgb[2], tailRgb[2], t),
  );
}

// --- Component ---

export default function Snake({ slug, isLoggedIn, onScoreSubmitted }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState(480);

  // Game state kept in refs for the tick loop (avoids stale closures)
  const snakeRef = useRef<Pt[]>([]);
  const dirRef = useRef<Dir>([1, 0]);
  const nextDirRef = useRef<Dir>([1, 0]);
  const foodRef = useRef<Pt>({ x: 15, y: 10 });
  const scoreRef = useRef(0);
  const phaseRef = useRef<Phase>("idle");
  const tickRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number>(0);

  // Reactive state for UI overlays
  const [phase, setPhase] = useState<Phase>("idle");
  const [score, setScore] = useState(0);
  const [result, setResult] = useState<{ personalBest: number; rank: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // --- Responsive sizing ---

  useEffect(() => {
    function measure() {
      if (containerRef.current) {
        const w = containerRef.current.offsetWidth;
        setCanvasSize(Math.min(w, 480));
      }
    }
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // --- Drawing ---

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const size = canvasSize;
    const cell = size / GRID;

    // Ensure canvas backing matches
    if (canvas.width !== size * dpr || canvas.height !== size * dpr) {
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Background
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, size, size);

    // Grid lines
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 0.5;
    for (let i = 1; i < GRID; i++) {
      const pos = i * cell;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(size, pos);
      ctx.stroke();
    }

    const snake = snakeRef.current;
    const food = foodRef.current;

    // Food glow
    const fx = food.x * cell + cell / 2;
    const fy = food.y * cell + cell / 2;
    const pulse = 0.8 + 0.2 * Math.sin(Date.now() / 300);
    const glowRadius = cell * 1.8 * pulse;
    const glow = ctx.createRadialGradient(fx, fy, 0, fx, fy, glowRadius);
    glow.addColorStop(0, COLORS.foodGlow);
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.fillRect(fx - glowRadius, fy - glowRadius, glowRadius * 2, glowRadius * 2);

    // Food dot
    ctx.fillStyle = COLORS.food;
    ctx.beginPath();
    ctx.arc(fx, fy, cell * 0.38, 0, Math.PI * 2);
    ctx.fill();

    // Snake
    const total = snake.length;
    for (let i = total - 1; i >= 0; i--) {
      const seg = snake[i];
      const x = seg.x * cell;
      const y = seg.y * cell;
      const pad = i === 0 ? 1 : 1.5;
      const radius = i === 0 ? cell * 0.2 : cell * 0.15;
      ctx.fillStyle = segmentColor(i, total);
      ctx.beginPath();
      ctx.roundRect(x + pad, y + pad, cell - pad * 2, cell - pad * 2, radius);
      ctx.fill();
    }

    // Head eyes (only when snake is long enough to see)
    if (snake.length > 0) {
      const h = snake[0];
      const hx = h.x * cell + cell / 2;
      const hy = h.y * cell + cell / 2;
      const d = dirRef.current;
      const eyeOff = cell * 0.18;
      const eyeR = cell * 0.08;

      // Two eyes perpendicular to direction
      const perp: Dir = [-d[1], d[0]];
      for (const side of [-1, 1]) {
        const ex = hx + perp[0] * eyeOff * side + d[0] * eyeOff;
        const ey = hy + perp[1] * eyeOff * side + d[1] * eyeOff;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(ex, ey, eyeR, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Score overlay during play
    if (phaseRef.current === "playing") {
      ctx.fillStyle = "rgba(226,226,232,0.85)";
      ctx.font = `bold ${Math.round(cell * 0.7)}px system-ui, -apple-system, sans-serif`;
      ctx.textBaseline = "top";
      ctx.fillText(`${scoreRef.current}`, cell * 0.6, cell * 0.4);
    }
  }, [canvasSize]);

  // --- Render loop ---

  useEffect(() => {
    let running = true;
    function loop() {
      if (!running) return;
      draw();
      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [draw]);

  // --- Game logic ---

  const resetGame = useCallback(() => {
    const mid = Math.floor(GRID / 2);
    snakeRef.current = [
      { x: mid, y: mid },
      { x: mid - 1, y: mid },
      { x: mid - 2, y: mid },
    ];
    dirRef.current = [1, 0];
    nextDirRef.current = [1, 0];
    scoreRef.current = 0;
    foodRef.current = randomFood(snakeRef.current);
    setScore(0);
    setResult(null);
  }, []);

  const submitScore = useCallback(
    async (finalScore: number) => {
      if (!isLoggedIn || finalScore === 0) return;
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
        // Silent fail — score display still shows
      } finally {
        setSubmitting(false);
      }
    },
    [isLoggedIn, slug, onScoreSubmitted],
  );

  const endGame = useCallback(
    (finalScore: number) => {
      phaseRef.current = "gameover";
      setPhase("gameover");
      if (tickRef.current) clearTimeout(tickRef.current);
      submitScore(finalScore);
    },
    [submitScore],
  );

  const tick = useCallback(() => {
    if (phaseRef.current !== "playing") return;

    dirRef.current = nextDirRef.current;
    const snake = snakeRef.current;
    const head = snake[0];
    const d = dirRef.current;

    const nx = head.x + d[0];
    const ny = head.y + d[1];

    // Wall collision
    if (nx < 0 || nx >= GRID || ny < 0 || ny >= GRID) {
      endGame(scoreRef.current);
      return;
    }

    // Self collision (skip tail — it will move away)
    for (let i = 0; i < snake.length - 1; i++) {
      if (snake[i].x === nx && snake[i].y === ny) {
        endGame(scoreRef.current);
        return;
      }
    }

    const newSnake = [{ x: nx, y: ny }, ...snake];
    const food = foodRef.current;

    if (nx === food.x && ny === food.y) {
      // Ate food — grow
      scoreRef.current += 1;
      setScore(scoreRef.current);
      foodRef.current = randomFood(newSnake);
    } else {
      // Move — remove tail
      newSnake.pop();
    }

    snakeRef.current = newSnake;

    // Schedule next tick
    const speed = Math.max(MIN_SPEED, BASE_SPEED - scoreRef.current * SPEED_DECAY);
    tickRef.current = setTimeout(tick, speed);
  }, [endGame]);

  const startGame = useCallback(() => {
    resetGame();
    phaseRef.current = "playing";
    setPhase("playing");
    const speed = BASE_SPEED;
    tickRef.current = setTimeout(tick, speed);
  }, [resetGame, tick]);

  // --- Input ---

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!DIR[e.key]) return;

      // Always prevent scroll for arrow keys when game is in view
      e.preventDefault();

      if (phaseRef.current === "idle") {
        startGame();
        const d = DIR[e.key];
        nextDirRef.current = d;
        return;
      }

      if (phaseRef.current === "playing") {
        // Prevent reversing into yourself
        const currentKey = Object.entries(DIR).find(
          ([, v]) => v[0] === dirRef.current[0] && v[1] === dirRef.current[1],
        )?.[0];
        if (currentKey && OPPOSITE[currentKey] === e.key) return;
        nextDirRef.current = DIR[e.key];
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [startGame]);

  // Cleanup tick on unmount
  useEffect(() => {
    return () => {
      if (tickRef.current) clearTimeout(tickRef.current);
    };
  }, []);

  // --- Initial draw state ---

  useEffect(() => {
    resetGame();
  }, [resetGame]);

  // --- Render ---

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 480,
        margin: "0 auto",
        userSelect: "none",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          width: canvasSize,
          height: canvasSize,
          borderRadius: 12,
          border: `1px solid ${COLORS.border}`,
        }}
      />

      {/* Idle overlay */}
      {phase === "idle" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: COLORS.overlay,
            borderRadius: 12,
            gap: 12,
          }}
        >
          <div
            style={{
              fontSize: 48,
              lineHeight: 1,
              marginBottom: 4,
            }}
          >
            {/* Snake emoji via unicode */}
            {"\uD83D\uDC0D"}
          </div>
          <div
            style={{
              color: COLORS.text,
              fontSize: 18,
              fontWeight: 600,
            }}
          >
            Snake
          </div>
          <div
            style={{
              color: COLORS.muted,
              fontSize: 14,
            }}
          >
            Press an arrow key to start
          </div>
        </div>
      )}

      {/* Game Over overlay */}
      {phase === "gameover" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: COLORS.overlay,
            borderRadius: 12,
            gap: 8,
          }}
        >
          <div
            style={{
              color: COLORS.muted,
              fontSize: 13,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Game Over
          </div>
          <div
            style={{
              color: COLORS.text,
              fontSize: 48,
              fontWeight: 700,
              lineHeight: 1.1,
            }}
          >
            {score}
          </div>
          <div style={{ color: COLORS.muted, fontSize: 14, marginBottom: 8 }}>
            {score === 1 ? "1 point" : `${score} points`}
          </div>

          {/* Result row */}
          {isLoggedIn && result && (
            <div
              style={{
                display: "flex",
                gap: 24,
                marginBottom: 8,
                padding: "12px 20px",
                background: COLORS.panel,
                borderRadius: 10,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 2 }}>Rank</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.accent }}>
                  #{result.rank}
                </div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 2 }}>Best</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#22c55e" }}>
                  {result.personalBest}
                </div>
              </div>
            </div>
          )}

          {isLoggedIn && submitting && (
            <div style={{ color: COLORS.muted, fontSize: 13, marginBottom: 8 }}>
              Saving score...
            </div>
          )}

          {!isLoggedIn && score > 0 && (
            <div style={{ color: COLORS.muted, fontSize: 13, marginBottom: 8 }}>
              Sign in to save your score
            </div>
          )}

          <button
            onClick={() => {
              resetGame();
              phaseRef.current = "idle";
              setPhase("idle");
            }}
            style={{
              padding: "10px 28px",
              background: `linear-gradient(135deg, ${COLORS.head}, ${COLORS.accent})`,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              transition: "opacity 150ms",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            Play Again
          </button>
        </div>
      )}
    </div>
  );
}
