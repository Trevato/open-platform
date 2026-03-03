"use client";

import { useRef, useEffect, useCallback, useState } from "react";

interface BreakoutProps {
  slug: string;
  isLoggedIn: boolean;
  onScoreSubmitted: () => void;
}

// --- Constants ---

const LOGICAL_W = 600;
const LOGICAL_H = 450;
const BG = "#0f0f13";
const TEXT_COLOR = "#e2e2e8";
const TEXT_DIM = "#888";
const ACCENT_1 = "#6c5ce7";
const ACCENT_2 = "#a855f7";

const PADDLE_W = 100;
const PADDLE_H = 14;
const PADDLE_RADIUS = 7;
const PADDLE_Y = LOGICAL_H - 32;

const BALL_R = 8;
const BALL_INITIAL_SPEED = 320; // px/sec
const BALL_SPEED_INCREMENT = 12; // every 10 bricks
const BALL_SPEED_LEVEL_BONUS = 30; // extra speed per level cleared
const BALL_MAX_SPEED = 700;

const BRICK_COLS = 8;
const BRICK_ROWS = 5;
const BRICK_PAD = 4;
const BRICK_TOP = 50;
const BRICK_H = 22;
const BRICK_AREA_W = LOGICAL_W - 40;
const BRICK_W = (BRICK_AREA_W - (BRICK_COLS - 1) * BRICK_PAD) / BRICK_COLS;
const BRICK_LEFT = 20;

const ROW_CONFIG: { color: string; points: number }[] = [
  { color: "#ef4444", points: 50 },
  { color: "#f97316", points: 40 },
  { color: "#fbbf24", points: 30 },
  { color: "#22c55e", points: 20 },
  { color: "#6c5ce7", points: 10 },
];

const LIVES_TOTAL = 3;

// --- Types ---

type GameState = "idle" | "playing" | "gameover";

interface Brick {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  points: number;
  alive: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

// --- Helpers ---

function buildBricks(): Brick[] {
  const bricks: Brick[] = [];
  for (let row = 0; row < BRICK_ROWS; row++) {
    const { color, points } = ROW_CONFIG[row];
    for (let col = 0; col < BRICK_COLS; col++) {
      bricks.push({
        x: BRICK_LEFT + col * (BRICK_W + BRICK_PAD),
        y: BRICK_TOP + row * (BRICK_H + BRICK_PAD),
        w: BRICK_W,
        h: BRICK_H,
        color,
        points,
        alive: true,
      });
    }
  }
  return bricks;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
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

// --- Component ---

export default function Breakout({
  slug,
  isLoggedIn,
  onScoreSubmitted,
}: BreakoutProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Mutable game state kept in refs to avoid re-render overhead
  const game = useRef({
    state: "idle" as GameState,
    paddleX: LOGICAL_W / 2,
    ballX: LOGICAL_W / 2,
    ballY: PADDLE_Y - BALL_R,
    ballVX: 0,
    ballVY: 0,
    ballSpeed: BALL_INITIAL_SPEED,
    bricks: buildBricks(),
    particles: [] as Particle[],
    score: 0,
    lives: LIVES_TOTAL,
    level: 1,
    bricksHit: 0,
    totalBricksHit: 0,
    lastTime: 0,
    animFrame: 0,
    keysDown: new Set<string>(),
    submitResult: null as { personalBest: number; rank: number } | null,
    submitting: false,
    submitted: false,
  });

  const [, forceRender] = useState(0);

  // --- Score submission ---

  const submitScore = useCallback(
    async (score: number) => {
      const g = game.current;
      if (!isLoggedIn || g.submitting || g.submitted) return;
      g.submitting = true;
      try {
        const res = await fetch(`/api/games/${slug}/scores`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ score }),
        });
        if (res.ok) {
          g.submitResult = await res.json();
          g.submitted = true;
          onScoreSubmitted();
        }
      } catch {
        // Silent failure — score display handles missing result
      } finally {
        g.submitting = false;
        forceRender((n) => n + 1);
      }
    },
    [slug, isLoggedIn, onScoreSubmitted]
  );

  // --- Launch ball ---

  const launch = useCallback(() => {
    const g = game.current;
    if (g.state !== "idle") return;
    g.state = "playing";
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.6;
    g.ballVX = Math.cos(angle) * g.ballSpeed;
    g.ballVY = Math.sin(angle) * g.ballSpeed;
  }, []);

  // --- Reset for next life ---

  const resetBall = useCallback(() => {
    const g = game.current;
    g.ballX = g.paddleX;
    g.ballY = PADDLE_Y - BALL_R;
    g.ballVX = 0;
    g.ballVY = 0;
    g.state = "idle";
  }, []);

  // --- Full game reset ---

  const resetGame = useCallback(() => {
    const g = game.current;
    g.state = "idle";
    g.score = 0;
    g.lives = LIVES_TOTAL;
    g.level = 1;
    g.bricksHit = 0;
    g.totalBricksHit = 0;
    g.ballSpeed = BALL_INITIAL_SPEED;
    g.bricks = buildBricks();
    g.particles = [];
    g.paddleX = LOGICAL_W / 2;
    g.submitResult = null;
    g.submitting = false;
    g.submitted = false;
    resetBall();
    forceRender((n) => n + 1);
  }, [resetBall]);

  // --- Game loop ---

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d")!;
    let dpr = window.devicePixelRatio || 1;

    function resize() {
      if (!canvas || !container) return;
      dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      const scale = Math.min(rect.width / LOGICAL_W, 1);
      const w = LOGICAL_W * scale;
      const h = LOGICAL_H * scale;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    resize();
    window.addEventListener("resize", resize);

    // --- Input ---

    function onMouseMove(e: MouseEvent) {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = LOGICAL_W / rect.width;
      game.current.paddleX = clamp(
        (e.clientX - rect.left) * scaleX,
        PADDLE_W / 2,
        LOGICAL_W - PADDLE_W / 2
      );
    }

    function onTouchMove(e: TouchEvent) {
      if (!canvas) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const scaleX = LOGICAL_W / rect.width;
      const touch = e.touches[0];
      game.current.paddleX = clamp(
        (touch.clientX - rect.left) * scaleX,
        PADDLE_W / 2,
        LOGICAL_W - PADDLE_W / 2
      );
    }

    function onKeyDown(e: KeyboardEvent) {
      const g = game.current;
      g.keysDown.add(e.key);
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        if (g.state === "idle" || g.state === "playing") {
          e.preventDefault();
        }
      }
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (g.state === "idle") launch();
        if (g.state === "gameover") resetGame();
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      game.current.keysDown.delete(e.key);
    }

    function onClick() {
      const g = game.current;
      if (g.state === "idle") launch();
    }

    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("click", onClick);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // --- Spawn particles ---

    function spawnParticles(x: number, y: number, color: string) {
      const g = game.current;
      for (let i = 0; i < 8; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 60 + Math.random() * 140;
        const duration = 0.3 + Math.random() * 0.3;
        g.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: duration,
          maxLife: duration,
          color,
          size: 2 + Math.random() * 3,
        });
      }
    }

    // --- Physics tick ---

    function tick(dt: number) {
      const g = game.current;

      // Keyboard paddle movement
      const PADDLE_KEY_SPEED = 500;
      if (g.keysDown.has("ArrowLeft")) {
        g.paddleX = clamp(
          g.paddleX - PADDLE_KEY_SPEED * dt,
          PADDLE_W / 2,
          LOGICAL_W - PADDLE_W / 2
        );
      }
      if (g.keysDown.has("ArrowRight")) {
        g.paddleX = clamp(
          g.paddleX + PADDLE_KEY_SPEED * dt,
          PADDLE_W / 2,
          LOGICAL_W - PADDLE_W / 2
        );
      }

      // Idle: ball follows paddle
      if (g.state === "idle") {
        g.ballX = g.paddleX;
        g.ballY = PADDLE_Y - BALL_R;
        return;
      }

      if (g.state !== "playing") return;

      // Move ball
      g.ballX += g.ballVX * dt;
      g.ballY += g.ballVY * dt;

      // Wall collisions
      if (g.ballX - BALL_R <= 0) {
        g.ballX = BALL_R;
        g.ballVX = Math.abs(g.ballVX);
      }
      if (g.ballX + BALL_R >= LOGICAL_W) {
        g.ballX = LOGICAL_W - BALL_R;
        g.ballVX = -Math.abs(g.ballVX);
      }
      if (g.ballY - BALL_R <= 0) {
        g.ballY = BALL_R;
        g.ballVY = Math.abs(g.ballVY);
      }

      // Paddle collision
      const padLeft = g.paddleX - PADDLE_W / 2;
      const padRight = g.paddleX + PADDLE_W / 2;
      const padTop = PADDLE_Y;

      if (
        g.ballVY > 0 &&
        g.ballY + BALL_R >= padTop &&
        g.ballY + BALL_R <= padTop + PADDLE_H + 4 &&
        g.ballX >= padLeft - BALL_R &&
        g.ballX <= padRight + BALL_R
      ) {
        // Hit position: -1 (left) to 1 (right)
        const hitPos = (g.ballX - g.paddleX) / (PADDLE_W / 2);
        const angle = -Math.PI / 2 + clamp(hitPos, -0.9, 0.9) * (Math.PI / 3);
        const speed = Math.sqrt(g.ballVX ** 2 + g.ballVY ** 2);
        g.ballVX = Math.cos(angle) * speed;
        g.ballVY = Math.sin(angle) * speed;
        g.ballY = padTop - BALL_R;
      }

      // Brick collisions
      for (const brick of g.bricks) {
        if (!brick.alive) continue;

        // AABB test with ball as a point expanded by radius
        const bLeft = brick.x - BALL_R;
        const bRight = brick.x + brick.w + BALL_R;
        const bTop = brick.y - BALL_R;
        const bBottom = brick.y + brick.h + BALL_R;

        if (
          g.ballX >= bLeft &&
          g.ballX <= bRight &&
          g.ballY >= bTop &&
          g.ballY <= bBottom
        ) {
          brick.alive = false;
          g.score += brick.points;
          g.bricksHit++;
          g.totalBricksHit++;

          spawnParticles(
            brick.x + brick.w / 2,
            brick.y + brick.h / 2,
            brick.color
          );

          // Speed increase every 10 bricks
          if (g.totalBricksHit % 10 === 0) {
            g.ballSpeed = Math.min(
              g.ballSpeed + BALL_SPEED_INCREMENT,
              BALL_MAX_SPEED
            );
          }

          // Determine bounce direction
          const overlapLeft = g.ballX - bLeft;
          const overlapRight = bRight - g.ballX;
          const overlapTop = g.ballY - bTop;
          const overlapBottom = bBottom - g.ballY;
          const minOverlap = Math.min(
            overlapLeft,
            overlapRight,
            overlapTop,
            overlapBottom
          );

          if (minOverlap === overlapLeft || minOverlap === overlapRight) {
            g.ballVX = -g.ballVX;
          } else {
            g.ballVY = -g.ballVY;
          }

          // Normalize speed to current ballSpeed
          const currentSpeed = Math.sqrt(g.ballVX ** 2 + g.ballVY ** 2);
          if (currentSpeed > 0) {
            g.ballVX = (g.ballVX / currentSpeed) * g.ballSpeed;
            g.ballVY = (g.ballVY / currentSpeed) * g.ballSpeed;
          }

          // Only break one brick per frame
          break;
        }
      }

      // All bricks cleared — next level
      if (g.bricks.every((b) => !b.alive)) {
        g.level++;
        g.bricksHit = 0;
        g.bricks = buildBricks();
        g.ballSpeed = Math.min(
          g.ballSpeed + BALL_SPEED_LEVEL_BONUS,
          BALL_MAX_SPEED
        );
        resetBall();
        return;
      }

      // Ball below screen — lose life
      if (g.ballY - BALL_R > LOGICAL_H) {
        g.lives--;
        if (g.lives <= 0) {
          g.state = "gameover";
          if (isLoggedIn && g.score > 0) {
            submitScore(g.score);
          }
          forceRender((n) => n + 1);
        } else {
          resetBall();
        }
      }

      // Update particles
      g.particles = g.particles.filter((p) => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        return p.life > 0;
      });
    }

    // --- Render ---

    function draw() {
      if (!canvas) return;
      const g = game.current;
      const cw = canvas.width;
      const ch = canvas.height;
      const scaleX = cw / LOGICAL_W;
      const scaleY = ch / LOGICAL_H;

      ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);

      // Background
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

      // Bricks
      for (const brick of g.bricks) {
        if (!brick.alive) continue;
        ctx.fillStyle = brick.color;
        drawRoundedRect(ctx, brick.x, brick.y, brick.w, brick.h, 3);
        ctx.fill();

        // Subtle highlight
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        drawRoundedRect(ctx, brick.x, brick.y, brick.w, brick.h / 2, 3);
        ctx.fill();
      }

      // Particles
      for (const p of g.particles) {
        const alpha = p.life / p.maxLife;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Paddle
      const padLeft = g.paddleX - PADDLE_W / 2;
      const gradient = ctx.createLinearGradient(
        padLeft,
        PADDLE_Y,
        padLeft + PADDLE_W,
        PADDLE_Y
      );
      gradient.addColorStop(0, ACCENT_1);
      gradient.addColorStop(1, ACCENT_2);
      ctx.fillStyle = gradient;
      drawRoundedRect(
        ctx,
        padLeft,
        PADDLE_Y,
        PADDLE_W,
        PADDLE_H,
        PADDLE_RADIUS
      );
      ctx.fill();

      // Paddle glow
      ctx.shadowColor = ACCENT_2;
      ctx.shadowBlur = 12;
      drawRoundedRect(
        ctx,
        padLeft,
        PADDLE_Y,
        PADDLE_W,
        PADDLE_H,
        PADDLE_RADIUS
      );
      ctx.fill();
      ctx.shadowBlur = 0;

      // Ball
      ctx.fillStyle = "#fff";
      ctx.shadowColor = "#fff";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(g.ballX, g.ballY, BALL_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // HUD — score (top-left)
      ctx.fillStyle = TEXT_COLOR;
      ctx.font = "bold 16px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(`${g.score}`, 14, 14);

      // HUD — level (top-center)
      if (g.level > 1) {
        ctx.fillStyle = TEXT_DIM;
        ctx.font = "13px system-ui, -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`Level ${g.level}`, LOGICAL_W / 2, 16);
      }

      // HUD — lives (top-right, dots)
      for (let i = 0; i < g.lives; i++) {
        ctx.fillStyle = ACCENT_2;
        ctx.beginPath();
        ctx.arc(LOGICAL_W - 18 - i * 22, 22, 6, 0, Math.PI * 2);
        ctx.fill();
      }

      // Idle prompt
      if (g.state === "idle") {
        ctx.fillStyle = TEXT_DIM;
        ctx.font = "14px system-ui, -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(
          "Click or press Space to launch",
          LOGICAL_W / 2,
          LOGICAL_H / 2 + 40
        );
      }

      // Game over overlay
      if (g.state === "gameover") {
        // Dim overlay
        ctx.fillStyle = "rgba(15, 15, 19, 0.85)";
        ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // "GAME OVER"
        ctx.fillStyle = TEXT_COLOR;
        ctx.font = "bold 32px system-ui, -apple-system, sans-serif";
        ctx.fillText("GAME OVER", LOGICAL_W / 2, LOGICAL_H / 2 - 60);

        // Score
        ctx.fillStyle = ACCENT_2;
        ctx.font = "bold 48px system-ui, -apple-system, sans-serif";
        ctx.fillText(`${g.score}`, LOGICAL_W / 2, LOGICAL_H / 2 - 10);

        // Result info
        let infoY = LOGICAL_H / 2 + 30;
        ctx.font = "14px system-ui, -apple-system, sans-serif";

        if (isLoggedIn) {
          if (g.submitResult) {
            ctx.fillStyle = TEXT_DIM;
            ctx.fillText(
              `Personal Best: ${g.submitResult.personalBest}`,
              LOGICAL_W / 2,
              infoY
            );
            infoY += 22;
            ctx.fillText(
              `Rank #${g.submitResult.rank}`,
              LOGICAL_W / 2,
              infoY
            );
            infoY += 22;
          } else if (g.submitting) {
            ctx.fillStyle = TEXT_DIM;
            ctx.fillText("Saving score...", LOGICAL_W / 2, infoY);
            infoY += 22;
          }
        } else {
          ctx.fillStyle = TEXT_DIM;
          ctx.fillText(
            "Sign in to save your score",
            LOGICAL_W / 2,
            infoY
          );
          infoY += 22;
        }

        // Play again prompt
        infoY += 12;
        ctx.fillStyle = TEXT_COLOR;
        ctx.font = "15px system-ui, -apple-system, sans-serif";
        ctx.fillText("Click or press Space to play again", LOGICAL_W / 2, infoY);
      }
    }

    // --- Main loop ---

    function loop(time: number) {
      const g = game.current;
      if (g.lastTime === 0) g.lastTime = time;
      const rawDt = (time - g.lastTime) / 1000;
      // Cap delta to avoid tunneling on tab switch
      const dt = Math.min(rawDt, 0.05);
      g.lastTime = time;

      tick(dt);
      draw();

      g.animFrame = requestAnimationFrame(loop);
    }

    game.current.animFrame = requestAnimationFrame(loop);

    // Handle game-over click (canvas click in gameover state)
    function onCanvasClickGameOver() {
      if (game.current.state === "gameover") {
        resetGame();
      }
    }
    canvas.addEventListener("click", onCanvasClickGameOver);

    return () => {
      cancelAnimationFrame(game.current.animFrame);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("click", onCanvasClickGameOver);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", resize);
    };
  }, [launch, resetBall, resetGame, isLoggedIn, submitScore]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        maxWidth: LOGICAL_W,
        margin: "0 auto",
        aspectRatio: `${LOGICAL_W} / ${LOGICAL_H}`,
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid #2a2a3a",
        cursor: "none",
        touchAction: "none",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          background: BG,
        }}
      />
    </div>
  );
}
