"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type RefObject,
} from "react";

export function useStickToBottom(ref: RefObject<HTMLDivElement | null>) {
  const [isAtBottom, setIsAtBottom] = useState(true);
  const isAutoScrolling = useRef(false);

  const scrollToBottom = useCallback(() => {
    if (ref.current) {
      isAutoScrolling.current = true;
      ref.current.scrollTop = ref.current.scrollHeight;
      // Reset flag after scroll completes
      requestAnimationFrame(() => {
        isAutoScrolling.current = false;
      });
    }
  }, [ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleScroll = () => {
      if (isAutoScrolling.current) return;
      const threshold = 50;
      const atBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
      setIsAtBottom(atBottom);
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [ref]);

  return { isAtBottom, scrollToBottom };
}
