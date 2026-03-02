"use client";

import Markdown from "react-markdown";

export function PostBody({ children }: { children: string }) {
  return (
    <div
      className="post-body"
      style={{
        margin: 0,
        fontSize: 15,
        lineHeight: 1.55,
        color: "#222",
      }}
    >
      <Markdown
        components={{
          p: ({ children }) => (
            <p style={{ margin: "0 0 8px", lineHeight: 1.55 }}>{children}</p>
          ),
          strong: ({ children }) => (
            <strong style={{ fontWeight: 600 }}>{children}</strong>
          ),
          em: ({ children }) => <em>{children}</em>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#2563eb", textDecoration: "none" }}
            >
              {children}
            </a>
          ),
          code: ({ children }) => (
            <code
              style={{
                background: "#f0f0f0",
                padding: "2px 5px",
                borderRadius: 4,
                fontSize: 13,
                fontFamily: "ui-monospace, monospace",
              }}
            >
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre
              style={{
                background: "#f0f0f0",
                padding: 12,
                borderRadius: 8,
                overflow: "auto",
                fontSize: 13,
                fontFamily: "ui-monospace, monospace",
                margin: "8px 0",
              }}
            >
              {children}
            </pre>
          ),
          ul: ({ children }) => (
            <ul style={{ margin: "4px 0", paddingLeft: 20 }}>{children}</ul>
          ),
          ol: ({ children }) => (
            <ol style={{ margin: "4px 0", paddingLeft: 20 }}>{children}</ol>
          ),
          blockquote: ({ children }) => (
            <blockquote
              style={{
                borderLeft: "3px solid #ddd",
                margin: "8px 0",
                paddingLeft: 12,
                color: "#666",
              }}
            >
              {children}
            </blockquote>
          ),
        }}
      >
        {children}
      </Markdown>
    </div>
  );
}
