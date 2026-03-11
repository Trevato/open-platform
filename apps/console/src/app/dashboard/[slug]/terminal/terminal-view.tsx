"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const theme = {
  background: "#1e1e2e",
  foreground: "#cdd6f4",
  cursor: "#f5e0dc",
  selectionBackground: "#353749",
  black: "#45475a",
  red: "#f38ba8",
  green: "#a6e3a1",
  yellow: "#f9e2af",
  blue: "#89b4fa",
  magenta: "#f5c2e7",
  cyan: "#94e2d5",
  white: "#a6adc8",
  brightBlack: "#585b70",
  brightRed: "#f38ba8",
  brightGreen: "#a6e3a1",
  brightYellow: "#f9e2af",
  brightBlue: "#89b4fa",
  brightMagenta: "#f5c2e7",
  brightCyan: "#94e2d5",
  brightWhite: "#bac2de",
};

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export function TerminalView({ slug }: { slug?: string } = {}) {
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

      // Force font remeasure so fit() gets real character dimensions.
      // ghostty-web caches metrics from term.open() which may be zero
      // if the web font hasn't loaded yet.
      const remeasure = () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const renderer = (term as any).renderer;
        if (renderer?.remeasureFont) renderer.remeasureFont();
      };

      // Fit terminal to container and send dimensions to PTY.
      // Must be called after WebSocket is open so the resize message
      // actually reaches the server (the real bug: fit() was firing
      // before the WebSocket connected, so the resize was silently dropped).
      const sendSize = (ws: WebSocket) => {
        remeasure();
        fitAddon.fit();
        // Always send current dimensions — fit() only triggers onResize
        // if dimensions changed, but the PTY needs them on first connect.
        ws.send(JSON.stringify({
          type: "resize",
          cols: term.cols,
          rows: term.rows,
        }));
      };

      // Start observing container resize after fonts are ready
      document.fonts.ready.then(() => {
        requestAnimationFrame(() => {
          remeasure();
          fitAddon.fit();
          fitAddon.observeResize();
        });
      });

      termRef.current = term;

      // Connect WebSocket
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(
        `${protocol}//${location.host}/ws/terminal${slug ? `?slug=${slug}` : ""}`
      );
      wsRef.current = ws;

      // Clipboard via DOM listener (avoids breaking ghostty-web key handling)
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

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          switch (msg.type) {
            case "connected":
              setStatus("connected");
              // Send real terminal dimensions now that WebSocket is open
              sendSize(ws);
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

      // Terminal resize → server (for window resizes after initial connect)
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
