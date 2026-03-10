"use client";

import { useRef, useState, useEffect } from "react";

const LINES = [
  { prefix: "$ ", text: "creating your platform...", cls: "deploy-cmd" },
  { prefix: "\u2713 ", text: "Kubernetes cluster", cls: "deploy-check" },
  { prefix: "\u2713 ", text: "PostgreSQL database", cls: "deploy-check" },
  { prefix: "\u2713 ", text: "S3 object storage", cls: "deploy-check" },
  {
    prefix: "\u2713 ",
    text: "Forgejo \u2014 git, packages, sign-in",
    cls: "deploy-check",
  },
  {
    prefix: "\u2713 ",
    text: "Woodpecker CI \u2014 push to deploy",
    cls: "deploy-check",
  },
  { prefix: "\u2713 ", text: "App template installed", cls: "deploy-check" },
  { prefix: "", text: "", cls: "" },
  { prefix: "", text: "Ready. Push code to ship.", cls: "deploy-result" },
];

export function DeploySequence() {
  const ref = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          let i = 0;
          const interval = setInterval(() => {
            i++;
            setVisibleCount(i);
            if (i >= LINES.length) clearInterval(interval);
          }, 400);
          observer.unobserve(el);
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="deploy-terminal" ref={ref}>
      <div className="deploy-terminal-header">
        <div className="deploy-terminal-dot" />
        <div className="deploy-terminal-dot" />
        <div className="deploy-terminal-dot" />
      </div>
      <div className="deploy-terminal-body">
        {LINES.map((line, i) => (
          <div
            key={i}
            className={`deploy-line ${i < visibleCount ? "visible" : ""}`}
          >
            {line.prefix && <span className={line.cls}>{line.prefix}</span>}
            <span className={line.cls}>{line.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
