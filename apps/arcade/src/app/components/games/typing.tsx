"use client";

import { useState, useCallback, useRef, useEffect } from "react";

const WORDS = [
  "code","pixel","arcade","score","level","power","speed","quest","spark",
  "blaze","frost","storm","drift","pulse","surge","orbit","nexus","cache",
  "debug","stack","array","logic","query","build","craft","swift","flame",
  "cyber","proto","ultra","turbo","glitch","render","shader","voxel","input",
  "output","loop","thread","async","fetch","route","state","props","hooks",
  "react","node","data","cloud","port","host","shell","byte","hash","link",
  "grid","flex","void","null","true","false","class","super","yield","await",
  "break","while","match","parse","merge","clone","scope","trace","chunk",
  "queue","index","frame","delta","alpha","omega","gamma","sigma",
];

const ROUND_DURATION = 30;

type GameState = "idle" | "playing" | "gameover";

function shuffle<T>(array: T[]): T[] {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function TypingGame({
  slug,
  isLoggedIn,
  onScoreSubmitted,
}: {
  slug: string;
  isLoggedIn: boolean;
  onScoreSubmitted: () => void;
}) {
  const [state, setState] = useState<GameState>("idle");
  const [wordQueue, setWordQueue] = useState<string[]>(() => shuffle(WORDS));
  const [wordIndex, setWordIndex] = useState(0);
  const [input, setInput] = useState("");
  const [timeLeft, setTimeLeft] = useState(ROUND_DURATION);
  const [correctChars, setCorrectChars] = useState(0);
  const [totalChars, setTotalChars] = useState(0);
  const [wordsCompleted, setWordsCompleted] = useState(0);
  const [totalCharsTyped, setTotalCharsTyped] = useState(0);
  const [score, setScore] = useState(0);
  const [flashColor, setFlashColor] = useState<string | null>(null);
  const [inputError, setInputError] = useState(false);
  const [result, setResult] = useState<{
    personalBest: number;
    rank: number;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const startTimeRef = useRef<number>(0);
  const correctCharsRef = useRef(0);
  const totalCharsRef = useRef(0);
  const totalCharsTypedRef = useRef(0);

  const currentWord = wordQueue[wordIndex] || "";

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopTimer();
  }, [stopTimer]);

  useEffect(() => {
    if (inputRef.current && state !== "gameover") {
      inputRef.current.focus();
    }
  }, [state]);

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

  const endGame = useCallback(() => {
    stopTimer();
    const elapsed = (Date.now() - startTimeRef.current) / 1000;
    const minutes = elapsed / 60;
    const cc = correctCharsRef.current;
    const tc = totalCharsRef.current;
    const wpm = minutes > 0 ? cc / 5 / minutes : 0;
    const accuracy = tc > 0 ? cc / tc : 0;
    const finalScore = Math.round(wpm * accuracy);
    setScore(finalScore);
    setState("gameover");
    submitScore(finalScore);
  }, [stopTimer, submitScore]);

  const startGame = useCallback(() => {
    startTimeRef.current = Date.now();
    setState("playing");
    setTimeLeft(ROUND_DURATION);
    timerRef.current = setInterval(() => {
      const remaining = Math.max(
        0,
        ROUND_DURATION -
          Math.floor((Date.now() - startTimeRef.current) / 1000)
      );
      setTimeLeft(remaining);
      if (remaining <= 0) {
        endGame();
      }
    }, 200);
  }, [endGame]);

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;

      if (state === "idle") {
        startGame();
      }

      if (state === "gameover") return;

      setInput(value);

      const lastChar = value[value.length - 1];
      const expectedChar = currentWord[value.length - 1];

      totalCharsRef.current += 1;
      setTotalChars((t) => t + 1);
      setTotalCharsTyped((t) => t + 1);
      totalCharsTypedRef.current += 1;

      if (lastChar === expectedChar) {
        correctCharsRef.current += 1;
        setCorrectChars((c) => c + 1);
        setInputError(false);
      } else {
        setInputError(true);
        setTimeout(() => setInputError(false), 200);
      }

      // Check if word completed
      if (value === currentWord) {
        setWordsCompleted((w) => w + 1);
        setFlashColor("#22c55e");
        setTimeout(() => setFlashColor(null), 250);
        setInput("");
        setWordIndex((i) => {
          const next = i + 1;
          if (next >= wordQueue.length) {
            // Reshuffle if we exhaust the queue
            setWordQueue(shuffle(WORDS));
            return 0;
          }
          return next;
        });
      }
    },
    [state, currentWord, wordQueue.length, startGame]
  );

  const resetGame = useCallback(() => {
    stopTimer();
    setWordQueue(shuffle(WORDS));
    setWordIndex(0);
    setInput("");
    setTimeLeft(ROUND_DURATION);
    setCorrectChars(0);
    setTotalChars(0);
    setWordsCompleted(0);
    setTotalCharsTyped(0);
    setScore(0);
    setFlashColor(null);
    setInputError(false);
    setResult(null);
    setState("idle");
    correctCharsRef.current = 0;
    totalCharsRef.current = 0;
    totalCharsTypedRef.current = 0;
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [stopTimer]);

  // Live stats
  const elapsedSec = state === "playing"
    ? ROUND_DURATION - timeLeft
    : state === "gameover"
      ? ROUND_DURATION
      : 0;
  const liveMinutes = elapsedSec / 60;
  const liveWpm =
    liveMinutes > 0 ? Math.round(correctChars / 5 / liveMinutes) : 0;
  const liveAccuracy =
    totalChars > 0 ? Math.round((correctChars / totalChars) * 100) : 100;
  const progressPct = (timeLeft / ROUND_DURATION) * 100;

  // Final stats for game over
  const finalMinutes = ROUND_DURATION / 60;
  const finalWpm =
    finalMinutes > 0 ? Math.round(correctChars / 5 / finalMinutes) : 0;
  const finalAccuracy =
    totalChars > 0 ? Math.round((correctChars / totalChars) * 100) : 100;

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
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <LiveStat label="WPM" value={liveWpm} color="#a855f7" />
        <LiveStat label="Accuracy" value={`${liveAccuracy}%`} />
        <LiveStat
          label="Time"
          value={`${timeLeft}s`}
          color={timeLeft <= 5 ? "#ef4444" : "#e2e2e8"}
        />
      </div>

      {/* Progress Bar */}
      <div
        style={{
          height: 3,
          background: "#1a1a24",
          borderRadius: 2,
          marginBottom: 32,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${progressPct}%`,
            background: "linear-gradient(90deg, #6c5ce7, #a855f7)",
            borderRadius: 2,
            transition: "width 0.3s linear",
          }}
        />
      </div>

      {/* Word Display */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 80,
          marginBottom: 24,
        }}
      >
        <span
          style={{
            fontSize: 32,
            fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
            fontWeight: 600,
            color: flashColor || "#e2e2e8",
            transition: "color 0.15s ease",
            letterSpacing: "0.04em",
            userSelect: "none",
          }}
        >
          {state === "gameover" ? "" : currentWord}
        </span>
      </div>

      {/* Character preview: show which chars are typed correctly */}
      {state !== "gameover" && input.length > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 2,
            marginBottom: 16,
            minHeight: 24,
          }}
        >
          {currentWord.split("").map((char, i) => (
            <span
              key={i}
              style={{
                fontSize: 16,
                fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
                fontWeight: 600,
                color:
                  i >= input.length
                    ? "#333"
                    : input[i] === char
                      ? "#22c55e"
                      : "#ef4444",
                transition: "color 0.1s",
              }}
            >
              {char}
            </span>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={handleInput}
          disabled={state === "gameover"}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={
            state === "idle" ? "Start typing to begin..." : ""
          }
          style={{
            width: "100%",
            maxWidth: 320,
            padding: "12px 16px",
            background: "#0f0f13",
            border: `2px solid ${
              inputError
                ? "#ef4444"
                : flashColor
                  ? "#22c55e"
                  : state === "playing"
                    ? "#6c5ce7"
                    : "#2a2a3a"
            }`,
            borderRadius: 8,
            color: "#e2e2e8",
            fontSize: 18,
            fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
            outline: "none",
            textAlign: "center",
            transition: "border-color 0.15s ease",
            boxSizing: "border-box",
          }}
        />
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
          Type the word above to begin the 30-second challenge
        </p>
      )}

      {/* Words completed counter */}
      {state === "playing" && (
        <p
          style={{
            textAlign: "center",
            color: "#444",
            fontSize: 13,
            marginTop: 12,
            marginBottom: 0,
          }}
        >
          {wordsCompleted} word{wordsCompleted !== 1 ? "s" : ""} completed
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
              Time's Up!
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
              <MiniStat label="WPM" value={String(finalWpm)} color="#a855f7" />
              <MiniStat label="Accuracy" value={`${finalAccuracy}%`} />
              <MiniStat
                label="Words"
                value={String(wordsCompleted)}
                color="#22c55e"
              />
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
    </div>
  );
}

function LiveStat({
  label,
  value,
  color = "#e2e2e8",
}: {
  label: string;
  value: string | number;
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
          transition: "color 0.3s",
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
