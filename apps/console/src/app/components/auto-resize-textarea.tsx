"use client";

import { useRef, useEffect, type ChangeEvent, type KeyboardEvent } from "react";

interface AutoResizeTextareaProps {
  value: string;
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

export function AutoResizeTextarea({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled,
  autoFocus,
}: AutoResizeTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = `${Math.min(ref.current.scrollHeight, 200)}px`;
    }
  }, [value]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <textarea
      ref={ref}
      className="input"
      value={value}
      onChange={onChange}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
      rows={1}
      style={{
        flex: 1,
        resize: "none",
        minHeight: 42,
        maxHeight: 200,
        overflow: "auto",
        lineHeight: 1.5,
        padding: "8px 12px",
      }}
    />
  );
}
