"use client";

import Markdown from "react-markdown";

export function MarkdownBody({ children }: { children: string }) {
  return (
    <div style={{ fontSize: 15, lineHeight: 1.7, color: "#e0e0f0" }}>
      <Markdown
        components={{
          p: ({ children }) => (
            <p style={{ margin: "0 0 12px" }}>{children}</p>
          ),
          h1: ({ children }) => (
            <h1
              style={{
                fontSize: 24,
                fontWeight: 700,
                margin: "24px 0 12px",
                letterSpacing: "-0.02em",
              }}
            >
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2
              style={{
                fontSize: 20,
                fontWeight: 600,
                margin: "20px 0 10px",
                letterSpacing: "-0.01em",
              }}
            >
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3
              style={{
                fontSize: 16,
                fontWeight: 600,
                margin: "16px 0 8px",
              }}
            >
              {children}
            </h3>
          ),
          strong: ({ children }) => (
            <strong style={{ fontWeight: 600, color: "#f0f0ff" }}>
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em style={{ color: "#c0c0d8" }}>{children}</em>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--accent, #60a0ff)", textDecoration: "none" }}
            >
              {children}
            </a>
          ),
          code: ({ children }) => (
            <code
              style={{
                background: "#12121a",
                padding: "2px 6px",
                borderRadius: 4,
                fontSize: 13,
                fontFamily: "ui-monospace, 'Cascadia Code', monospace",
                color: "#c0c0d8",
              }}
            >
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre
              style={{
                background: "#12121a",
                padding: 16,
                borderRadius: 8,
                overflow: "auto",
                fontSize: 13,
                fontFamily: "ui-monospace, 'Cascadia Code', monospace",
                margin: "12px 0",
                border: "1px solid #2a2a3a",
              }}
            >
              {children}
            </pre>
          ),
          ul: ({ children }) => (
            <ul
              style={{
                margin: "8px 0",
                paddingLeft: 24,
                listStyleType: "disc",
              }}
            >
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol style={{ margin: "8px 0", paddingLeft: 24 }}>{children}</ol>
          ),
          li: ({ children }) => (
            <li style={{ margin: "4px 0", color: "#c0c0d8" }}>{children}</li>
          ),
          blockquote: ({ children }) => (
            <blockquote
              style={{
                borderLeft: "3px solid #3a3a4a",
                margin: "12px 0",
                paddingLeft: 16,
                color: "#a0a0b8",
                fontStyle: "italic",
              }}
            >
              {children}
            </blockquote>
          ),
          hr: () => (
            <hr
              style={{
                border: "none",
                borderTop: "1px solid #2a2a3a",
                margin: "24px 0",
              }}
            />
          ),
        }}
      >
        {children}
      </Markdown>
    </div>
  );
}
