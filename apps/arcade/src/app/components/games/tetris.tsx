"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface GameProps {
  slug: string;
  isLoggedIn: boolean;
  onScoreSubmitted: () => void;
}

type GameState = "idle" | "playing" | "gameover";

interface Position {
  x: number;
  y: number;
}

interface Piece {
  shape: number[][];
  color: string;
  pos: Position;
}

interface ScoreResult {
  personalBest: number;
  rank: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const COLS = 10;
const ROWS = 20;
const CELL_SIZE = 28;
const LINE_WIDTH = 1;
const BOARD_WIDTH = COLS * CELL_SIZE;
const BOARD_HEIGHT = ROWS * CELL_SIZE;
const PANEL_WIDTH = 140;
const PANEL_GAP = 20;
const TOTAL_WIDTH = BOARD_WIDTH + PANEL_GAP + PANEL_WIDTH;

const BG = "#12121a";
const GRID_LINE = "#1a1a24";
const CARD_BG = "#1a1a24";
const BORDER = "#2a2a3a";
const TEXT = "#e2e2e8";
const TEXT_DIM = "#888";
const ACCENT = "#6c5ce7";

const TETROMINOES: { shape: number[][]; color: string }[] = [
  { shape: [[1, 1, 1, 1]], color: "#22d3ee" },                       // I
  { shape: [[1, 1], [1, 1]], color: "#fbbf24" },                     // O
  { shape: [[0, 1, 0], [1, 1, 1]], color: "#a855f7" },               // T
  { shape: [[0, 1, 1], [1, 1, 0]], color: "#22c55e" },               // S
  { shape: [[1, 1, 0], [0, 1, 1]], color: "#ef4444" },               // Z
  { shape: [[1, 0, 0], [1, 1, 1]], color: "#3b82f6" },               // J
  { shape: [[0, 0, 1], [1, 1, 1]], color: "#f97316" },               // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function createBoard(): (string | null)[][] {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function randomPiece(): Piece {
  const t = TETROMINOES[Math.floor(Math.random() * TETROMINOES.length)];
  return {
    shape: t.shape.map((r) => [...r]),
    color: t.color,
    pos: { x: Math.floor((COLS - t.shape[0].length) / 2), y: 0 },
  };
}

function rotate(shape: number[][]): number[][] {
  const rows = shape.length;
  const cols = shape[0].length;
  const rotated: number[][] = Array.from({ length: cols }, () =>
    Array(rows).fill(0)
  );
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      rotated[c][rows - 1 - r] = shape[r][c];
    }
  }
  return rotated;
}

function collides(
  board: (string | null)[][],
  shape: number[][],
  pos: Position
): boolean {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = pos.x + c;
      const ny = pos.y + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function ghostY(
  board: (string | null)[][],
  shape: number[][],
  pos: Position
): number {
  let gy = pos.y;
  while (!collides(board, shape, { x: pos.x, y: gy + 1 })) {
    gy++;
  }
  return gy;
}

function lockPiece(board: (string | null)[][], piece: Piece): void {
  const { shape, color, pos } = piece;
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const ny = pos.y + r;
      const nx = pos.x + c;
      if (ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS) {
        board[ny][nx] = color;
      }
    }
  }
}

function clearLines(board: (string | null)[][]): {
  cleared: number;
  clearedRows: number[];
} {
  const clearedRows: number[] = [];
  for (let r = 0; r < ROWS; r++) {
    if (board[r].every((cell) => cell !== null)) {
      clearedRows.push(r);
    }
  }
  return { cleared: clearedRows.length, clearedRows };
}

function removeClearedRows(
  board: (string | null)[][],
  clearedRows: number[]
): (string | null)[][] {
  const newBoard = board.filter((_, i) => !clearedRows.includes(i));
  while (newBoard.length < ROWS) {
    newBoard.unshift(Array(COLS).fill(null));
  }
  return newBoard;
}

function dropInterval(level: number): number {
  return Math.max(100, 800 - (level - 1) * 50);
}

/* ------------------------------------------------------------------ */
/*  Canvas Drawing                                                    */
/* ------------------------------------------------------------------ */

function drawCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  alpha: number = 1,
  dpr: number = 1
) {
  const px = x * CELL_SIZE;
  const py = y * CELL_SIZE;
  const inset = 1;

  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  roundRect(ctx, px + inset, py + inset, CELL_SIZE - inset * 2, CELL_SIZE - inset * 2, 3 * dpr / dpr);
  ctx.fill();

  // Subtle highlight on top-left
  ctx.globalAlpha = alpha * 0.25;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(px + inset + 1, py + inset + 1, CELL_SIZE - inset * 2 - 2, 2);
  ctx.fillRect(px + inset + 1, py + inset + 1, 2, CELL_SIZE - inset * 2 - 2);

  // Subtle shadow on bottom-right
  ctx.globalAlpha = alpha * 0.15;
  ctx.fillStyle = "#000000";
  ctx.fillRect(px + inset + 1, py + CELL_SIZE - inset - 3, CELL_SIZE - inset * 2 - 2, 2);
  ctx.fillRect(px + CELL_SIZE - inset - 3, py + inset + 1, 2, CELL_SIZE - inset * 2 - 2);

  ctx.globalAlpha = 1;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawBoard(
  ctx: CanvasRenderingContext2D,
  board: (string | null)[][],
  dpr: number,
  flashRows: Set<number>,
  flashOn: boolean
) {
  // Background
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

  // Grid lines
  ctx.strokeStyle = GRID_LINE;
  ctx.lineWidth = LINE_WIDTH;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * CELL_SIZE, 0);
    ctx.lineTo(c * CELL_SIZE, BOARD_HEIGHT);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * CELL_SIZE);
    ctx.lineTo(BOARD_WIDTH, r * CELL_SIZE);
    ctx.stroke();
  }

  // Locked cells
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const color = board[r][c];
      if (color) {
        if (flashRows.has(r)) {
          if (flashOn) {
            drawCell(ctx, c, r, "#ffffff", 0.9, dpr);
          }
        } else {
          drawCell(ctx, c, r, color, 1, dpr);
        }
      }
    }
  }
}

function drawPiece(
  ctx: CanvasRenderingContext2D,
  piece: Piece,
  alpha: number = 1,
  dpr: number = 1
) {
  const { shape, color, pos } = piece;
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const ny = pos.y + r;
      if (ny < 0) continue;
      drawCell(ctx, pos.x + c, ny, color, alpha, dpr);
    }
  }
}

function drawGhost(
  ctx: CanvasRenderingContext2D,
  piece: Piece,
  board: (string | null)[][],
  dpr: number
) {
  const gy = ghostY(board, piece.shape, piece.pos);
  if (gy === piece.pos.y) return;
  const ghost: Piece = { ...piece, pos: { x: piece.pos.x, y: gy } };
  drawPiece(ctx, ghost, 0.2, dpr);
}

/* ------------------------------------------------------------------ */
/*  Preview Canvas Drawing                                            */
/* ------------------------------------------------------------------ */

function drawPreview(
  canvas: HTMLCanvasElement,
  piece: { shape: number[][]; color: string } | null
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const previewSize = 100;
  canvas.width = previewSize * dpr;
  canvas.height = previewSize * dpr;
  canvas.style.width = `${previewSize}px`;
  canvas.style.height = `${previewSize}px`;
  ctx.scale(dpr, dpr);

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, previewSize, previewSize);

  if (!piece) return;

  const cellSize = 18;
  const cols = piece.shape[0].length;
  const rows = piece.shape.length;
  const offsetX = (previewSize - cols * cellSize) / 2;
  const offsetY = (previewSize - rows * cellSize) / 2;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!piece.shape[r][c]) continue;
      const px = offsetX + c * cellSize;
      const py = offsetY + r * cellSize;
      const inset = 1;

      ctx.fillStyle = piece.color;
      ctx.beginPath();
      roundRect(ctx, px + inset, py + inset, cellSize - inset * 2, cellSize - inset * 2, 2);
      ctx.fill();

      ctx.globalAlpha = 0.25;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(px + inset + 1, py + inset + 1, cellSize - inset * 2 - 2, 2);
      ctx.globalAlpha = 1;
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function Tetris({ slug, isLoggedIn, onScoreSubmitted }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const boardRef = useRef(createBoard());
  const currentRef = useRef<Piece | null>(null);
  const nextRef = useRef<Piece | null>(null);
  const stateRef = useRef<GameState>("idle");
  const scoreRef = useRef(0);
  const levelRef = useRef(1);
  const linesRef = useRef(0);
  const dropTimerRef = useRef(0);
  const rafRef = useRef(0);
  const lastDropRef = useRef(0);
  const flashRowsRef = useRef<Set<number>>(new Set());
  const flashPhaseRef = useRef(0);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [gameState, setGameState] = useState<GameState>("idle");
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [lines, setLines] = useState(0);
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /* ---- score submission ---- */

  const submitScore = useCallback(
    async (finalScore: number) => {
      if (!isLoggedIn || finalScore <= 0) return;
      setSubmitting(true);
      try {
        const res = await fetch(`/api/games/${slug}/scores`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ score: finalScore }),
        });
        if (res.ok) {
          const data = await res.json();
          setScoreResult({ personalBest: data.personalBest, rank: data.rank });
          onScoreSubmitted();
        }
      } catch {
        // Silently fail — score display still shows
      } finally {
        setSubmitting(false);
      }
    },
    [slug, isLoggedIn, onScoreSubmitted]
  );

  /* ---- spawning ---- */

  const spawnPiece = useCallback(() => {
    const next = nextRef.current ?? randomPiece();
    currentRef.current = next;
    nextRef.current = randomPiece();

    // Check game over
    if (collides(boardRef.current, next.shape, next.pos)) {
      stateRef.current = "gameover";
      setGameState("gameover");
      submitScore(scoreRef.current);
      return false;
    }
    return true;
  }, [submitScore]);

  /* ---- line clear with flash effect ---- */

  const handleLineClear = useCallback(
    (callback: () => void) => {
      const { cleared, clearedRows } = clearLines(boardRef.current);
      if (cleared === 0) {
        callback();
        return;
      }

      flashRowsRef.current = new Set(clearedRows);
      flashPhaseRef.current = 0;

      const flashSequence = () => {
        flashPhaseRef.current++;
        if (flashPhaseRef.current > 6) {
          // Done flashing — remove rows
          flashRowsRef.current = new Set();
          boardRef.current = removeClearedRows(boardRef.current, clearedRows);

          const newLines = linesRef.current + cleared;
          const newLevel = Math.floor(newLines / 10) + 1;
          const points = LINE_SCORES[cleared] * levelRef.current;

          scoreRef.current += points;
          linesRef.current = newLines;
          levelRef.current = newLevel;

          setScore(scoreRef.current);
          setLines(newLines);
          setLevel(newLevel);

          callback();
          return;
        }
        flashTimerRef.current = setTimeout(flashSequence, 50);
      };

      flashTimerRef.current = setTimeout(flashSequence, 50);
    },
    []
  );

  /* ---- move / rotate ---- */

  const movePiece = useCallback(
    (dx: number, dy: number): boolean => {
      const piece = currentRef.current;
      if (!piece) return false;
      const newPos = { x: piece.pos.x + dx, y: piece.pos.y + dy };
      if (collides(boardRef.current, piece.shape, newPos)) return false;
      piece.pos = newPos;
      return true;
    },
    []
  );

  const rotatePiece = useCallback(() => {
    const piece = currentRef.current;
    if (!piece) return;
    const rotated = rotate(piece.shape);
    if (!collides(boardRef.current, rotated, piece.pos)) {
      piece.shape = rotated;
    }
  }, []);

  const hardDrop = useCallback(() => {
    const piece = currentRef.current;
    if (!piece) return;
    const gy = ghostY(boardRef.current, piece.shape, piece.pos);
    const dropDistance = gy - piece.pos.y;
    piece.pos.y = gy;
    scoreRef.current += dropDistance * 2;
    setScore(scoreRef.current);

    lockPiece(boardRef.current, piece);
    currentRef.current = null;
    handleLineClear(() => {
      spawnPiece();
    });
  }, [handleLineClear, spawnPiece]);

  /* ---- game start ---- */

  const startGame = useCallback(() => {
    boardRef.current = createBoard();
    scoreRef.current = 0;
    levelRef.current = 1;
    linesRef.current = 0;
    flashRowsRef.current = new Set();
    currentRef.current = null;
    nextRef.current = null;
    lastDropRef.current = performance.now();

    setScore(0);
    setLevel(1);
    setLines(0);
    setScoreResult(null);

    stateRef.current = "playing";
    setGameState("playing");
    spawnPiece();
  }, [spawnPiece]);

  /* ---- game loop (render + gravity) ---- */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = BOARD_WIDTH * dpr;
    canvas.height = BOARD_HEIGHT * dpr;
    canvas.style.width = `${BOARD_WIDTH}px`;
    canvas.style.height = `${BOARD_HEIGHT}px`;
    ctx.scale(dpr, dpr);

    let running = true;

    const loop = (now: number) => {
      if (!running) return;

      // Gravity
      if (stateRef.current === "playing" && currentRef.current) {
        const interval = dropInterval(levelRef.current);
        if (now - lastDropRef.current >= interval) {
          lastDropRef.current = now;
          if (!movePiece(0, 1)) {
            // Piece landed
            lockPiece(boardRef.current, currentRef.current);
            currentRef.current = null;
            handleLineClear(() => {
              if (stateRef.current === "playing") {
                spawnPiece();
              }
            });
          }
        }
      }

      // Draw
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const flashOn = flashPhaseRef.current % 2 === 0;
      drawBoard(ctx, boardRef.current, dpr, flashRowsRef.current, flashOn);

      if (currentRef.current && stateRef.current === "playing") {
        drawGhost(ctx, currentRef.current, boardRef.current, dpr);
        drawPiece(ctx, currentRef.current, 1, dpr);
      }

      // Preview
      if (previewCanvasRef.current) {
        const nextPiece = nextRef.current;
        drawPreview(
          previewCanvasRef.current,
          nextPiece ? { shape: nextPiece.shape, color: nextPiece.color } : null
        );
      }

      // Idle overlay
      if (stateRef.current === "idle") {
        ctx.fillStyle = "rgba(15, 15, 19, 0.7)";
        ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

        ctx.fillStyle = TEXT;
        ctx.font = "bold 16px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Press any key to start", BOARD_WIDTH / 2, BOARD_HEIGHT / 2);
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [movePiece, handleLineClear, spawnPiece]);

  /* ---- keyboard input ---- */

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Prevent page scroll for arrow keys and space during gameplay
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key) &&
        stateRef.current !== "idle"
      ) {
        e.preventDefault();
      }

      if (stateRef.current === "idle") {
        startGame();
        return;
      }

      if (stateRef.current !== "playing") return;

      switch (e.key) {
        case "ArrowLeft":
          movePiece(-1, 0);
          break;
        case "ArrowRight":
          movePiece(1, 0);
          break;
        case "ArrowDown":
          e.preventDefault();
          if (movePiece(0, 1)) {
            scoreRef.current += 1;
            setScore(scoreRef.current);
            lastDropRef.current = performance.now();
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          rotatePiece();
          break;
        case " ":
          e.preventDefault();
          hardDrop();
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [startGame, movePiece, rotatePiece, hardDrop]);

  /* ---- cleanup flash timers ---- */

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  /* ---- render ---- */

  return (
    <div
      ref={containerRef}
      style={{
        display: "flex",
        justifyContent: "center",
        width: "100%",
        outline: "none",
      }}
      tabIndex={-1}
    >
      <div
        style={{
          display: "flex",
          gap: PANEL_GAP,
          maxWidth: TOTAL_WIDTH,
        }}
      >
        {/* Board */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <canvas
            ref={canvasRef}
            style={{
              display: "block",
              borderRadius: 8,
              border: `1px solid ${BORDER}`,
              maxWidth: BOARD_WIDTH,
            }}
          />

          {/* Game Over Overlay */}
          {gameState === "gameover" && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(15, 15, 19, 0.85)",
                borderRadius: 8,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 16,
                zIndex: 10,
              }}
            >
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: TEXT,
                  letterSpacing: "0.02em",
                }}
              >
                Game Over
              </div>

              <div
                style={{
                  fontSize: 14,
                  color: TEXT_DIM,
                  marginBottom: 4,
                }}
              >
                Score
              </div>
              <div
                style={{
                  fontSize: 36,
                  fontWeight: 700,
                  color: ACCENT,
                  marginTop: -12,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {score.toLocaleString()}
              </div>

              {/* Rank / Personal Best */}
              {isLoggedIn && scoreResult && (
                <div
                  style={{
                    display: "flex",
                    gap: 24,
                    marginTop: 4,
                  }}
                >
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 2 }}>
                      Rank
                    </div>
                    <div
                      style={{
                        fontSize: 20,
                        fontWeight: 700,
                        color: "#a855f7",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      #{scoreResult.rank}
                    </div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 2 }}>
                      Best
                    </div>
                    <div
                      style={{
                        fontSize: 20,
                        fontWeight: 700,
                        color: "#22c55e",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {scoreResult.personalBest.toLocaleString()}
                    </div>
                  </div>
                </div>
              )}

              {isLoggedIn && submitting && (
                <div style={{ fontSize: 12, color: TEXT_DIM }}>Saving score...</div>
              )}

              {!isLoggedIn && (
                <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 4 }}>
                  Sign in to save your score
                </div>
              )}

              <button
                onClick={startGame}
                style={{
                  marginTop: 8,
                  padding: "10px 28px",
                  background: `linear-gradient(135deg, ${ACCENT}, #a855f7)`,
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "transform 0.1s ease, box-shadow 0.1s ease",
                }}
                onMouseDown={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.97)";
                }}
                onMouseUp={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
                }}
              >
                Play Again
              </button>
            </div>
          )}
        </div>

        {/* Side Panel */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            width: PANEL_WIDTH,
            flexShrink: 0,
          }}
        >
          {/* Next Piece */}
          <div
            style={{
              background: CARD_BG,
              borderRadius: 8,
              border: `1px solid ${BORDER}`,
              padding: "12px 12px 8px",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: TEXT_DIM,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 8,
              }}
            >
              Next
            </div>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <canvas
                ref={previewCanvasRef}
                style={{
                  borderRadius: 6,
                }}
              />
            </div>
          </div>

          {/* Score */}
          <StatCard label="Score" value={score.toLocaleString()} accent />

          {/* Level */}
          <StatCard label="Level" value={String(level)} />

          {/* Lines */}
          <StatCard label="Lines" value={String(lines)} />

          {/* Controls */}
          <div
            style={{
              background: CARD_BG,
              borderRadius: 8,
              border: `1px solid ${BORDER}`,
              padding: 12,
              marginTop: "auto",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: TEXT_DIM,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 8,
              }}
            >
              Controls
            </div>
            <div style={{ fontSize: 11, color: TEXT_DIM, lineHeight: 1.7 }}>
              <span style={{ color: TEXT, fontWeight: 500 }}>
                &#8592; &#8594;
              </span>{" "}
              Move
              <br />
              <span style={{ color: TEXT, fontWeight: 500 }}>&#8593;</span> Rotate
              <br />
              <span style={{ color: TEXT, fontWeight: 500 }}>&#8595;</span> Soft
              drop
              <br />
              <span style={{ color: TEXT, fontWeight: 500 }}>Space</span> Hard drop
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                    */
/* ------------------------------------------------------------------ */

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        background: CARD_BG,
        borderRadius: 8,
        border: `1px solid ${BORDER}`,
        padding: 12,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: TEXT_DIM,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: accent ? ACCENT : TEXT,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}
