"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const theme = {
  background: "#0f0f13",
  foreground: "#e0e0f0",
  cursor: "#60a0ff",
  selectionBackground: "rgba(96, 160, 255, 0.3)",
  black: "#1a1a24",
  red: "#f87171",
  green: "#4ade80",
  yellow: "#fbbf24",
  blue: "#60a0ff",
  magenta: "#a855f7",
  cyan: "#22d3ee",
  white: "#e0e0f0",
  brightBlack: "#555570",
  brightRed: "#fca5a5",
  brightGreen: "#86efac",
  brightYellow: "#fde68a",
  brightBlue: "#93c5fd",
  brightMagenta: "#c084fc",
  brightCyan: "#67e8f9",
  brightWhite: "#f0f0ff",
};

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export function TerminalView({ slug }: { slug: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const termRef = useRef<unknown>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const connect = useCallback(async () => {
    if (!containerRef.current) return;

    setStatus("connecting");
    setErrorMessage(null);

    try {
      const { init, Terminal, FitAddon } = await import("ghostty-web");
      await init();

      // Clean up previous terminal if reconnecting
      if (termRef.current) {
        (termRef.current as { dispose: () => void }).dispose();
      }
      containerRef.current.innerHTML = "";

      const term = new Terminal({
        theme,
        fontSize: 14,
        fontFamily:
          '"FiraCode Nerd Font Mono", "Fira Code", "Cascadia Code", monospace',
        cursorBlink: true,
        cursorStyle: "bar",
        scrollback: 5000,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(containerRef.current);

      // Defer fit until WASM has measured font metrics (returns 0 on first frame)
      requestAnimationFrame(() => {
        fitAddon.fit();
        fitAddon.observeResize();
      });

      termRef.current = term;

      // Connect WebSocket
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(
        `${protocol}//${location.host}/ws/terminal?slug=${slug}`
      );
      wsRef.current = ws;

      // Clipboard via DOM listener (avoids breaking ghostty-web key handling)
      // Cmd+C / Ctrl+Shift+C = copy selection, Cmd+V / Ctrl+Shift+V = paste
      const container = containerRef.current;
      const handleClipboard = (event: KeyboardEvent) => {
        const isMac = navigator.platform.includes("Mac");
        const mod = isMac ? event.metaKey : event.ctrlKey && event.shiftKey;
        if (!mod) return;

        if (event.key === "c") {
          const selection = term.getSelection();
          if (selection) {
            navigator.clipboard.writeText(selection);
            event.preventDefault();
          }
        } else if (event.key === "v") {
          event.preventDefault();
          navigator.clipboard.readText().then((text) => {
            if (text && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "input", data: text }));
            }
          });
        }
      };
      container.addEventListener("keydown", handleClipboard);

      ws.onopen = () => {
        // Wait for 'connected' message from server
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          switch (msg.type) {
            case "connected":
              setStatus("connected");
              term.focus();
              break;
            case "output":
              term.write(msg.data);
              break;
            case "error":
              setStatus("error");
              setErrorMessage(msg.message);
              break;
            case "closed":
              setStatus("disconnected");
              setErrorMessage(msg.reason);
              break;
          }
        } catch {}
      };

      ws.onclose = () => {
        setStatus((prev) => (prev === "error" ? "error" : "disconnected"));
      };

      ws.onerror = () => {
        setStatus("error");
        setErrorMessage("Connection failed.");
      };

      // Terminal input → server
      term.onData((data: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "input", data }));
        }
      });

      // Terminal resize → server
      term.onResize(({ cols, rows }: { cols: number; rows: number }) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "resize", cols, rows }));
        }
      });
    } catch (err) {
      console.error("Terminal init error:", err);
      setStatus("error");
      setErrorMessage("Failed to initialize terminal.");
    }
  }, [slug]);

  useEffect(() => {
    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (termRef.current) {
        (termRef.current as { dispose: () => void }).dispose();
        termRef.current = null;
      }
    };
  }, [connect]);

  const statusDotClass =
    status === "connected"
      ? "status-dot-ready"
      : status === "connecting"
        ? "status-dot-provisioning"
        : "status-dot-failed";

  return (
    <div className="terminal-wrapper">
      <div className="terminal-status-bar">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className={`status-dot ${statusDotClass}`} />
          <span className="text-sm text-muted">
            {status === "connecting" && "Connecting..."}
            {status === "connected" && "Connected"}
            {status === "disconnected" && "Disconnected"}
            {status === "error" && (errorMessage || "Error")}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {status === "connected" && (
            <span className="text-sm text-muted" style={{ opacity: 0.6 }}>
              {navigator?.platform?.includes("Mac") ? "\u2318C" : "Ctrl+Shift+C"} copy{" "}
              {navigator?.platform?.includes("Mac") ? "\u2318V" : "Ctrl+Shift+V"} paste
            </span>
          )}
          {(status === "disconnected" || status === "error") && (
            <button className="btn btn-sm btn-ghost" onClick={connect}>
              Reconnect
            </button>
          )}
        </div>
      </div>
      <div ref={containerRef} className="terminal-container" />
    </div>
  );
}
