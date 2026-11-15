"use client";
import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "rr-bottom-panel-height";
export function ResizableResults({
  tab,
  children,
}: {
  tab: string;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  const drag = useRef<{ y: number; height: number } | null>(null);
  const [height, setHeight] = useState<number | null>(null);
  const [maximum, setMaximum] = useState(700);
  const minimum = Math.min(tab === "coach" ? 240 : 120, maximum);
  const clamp = (value: number) => Math.min(maximum, Math.max(minimum, value));
  useEffect(() => {
    const parent = panel.current?.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver(() => {
      const max = Math.max(
        120,
        Math.floor(parent.getBoundingClientRect().height - 198),
      );
      setMaximum(max);
      setHeight((current) =>
        current === null ? null : Math.min(max, current),
      );
    });
    observer.observe(parent);
    try {
      const saved = Number(localStorage.getItem(STORAGE_KEY));
      if (saved >= 120 && saved <= 3000) setHeight(saved);
    } catch {}
    return () => observer.disconnect();
  }, []);
  const remember = (value: number) => {
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch {}
  };
  const actual = height === null ? undefined : clamp(height);
  return (
    <section
      ref={panel}
      className={`results-panel resizable-results ${tab === "terminal" ? "terminal-open" : tab === "coach" ? "coach-open" : ""}`}
      style={{ height: actual, flexBasis: actual, maxHeight: maximum }}
    >
      <div
        className="results-resize-handle"
        role="separator"
        aria-label="Resize bottom panel"
        aria-orientation="horizontal"
        aria-valuemin={minimum}
        aria-valuemax={maximum}
        aria-valuenow={
          actual ??
          Math.min(
            maximum,
            tab === "coach" ? 420 : tab === "terminal" ? 340 : 224,
          )
        }
        tabIndex={0}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          drag.current = {
            y: event.clientY,
            height: panel.current!.getBoundingClientRect().height,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (drag.current)
            setHeight(
              clamp(drag.current.height + drag.current.y - event.clientY),
            );
        }}
        onPointerUp={(event) => {
          if (!drag.current) return;
          const value = clamp(
            drag.current.height + drag.current.y - event.clientY,
          );
          drag.current = null;
          setHeight(value);
          remember(value);
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        onDoubleClick={() => {
          setHeight(null);
          try {
            localStorage.removeItem(STORAGE_KEY);
          } catch {}
        }}
        onKeyDown={(event) => {
          if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key))
            return;
          event.preventDefault();
          const current = panel.current!.getBoundingClientRect().height;
          const value = clamp(
            event.key === "Home"
              ? minimum
              : event.key === "End"
                ? maximum
                : current + (event.key === "ArrowUp" ? 32 : -32),
          );
          setHeight(value);
          remember(value);
        }}
      >
        <span />
      </div>
      {children}
    </section>
  );
}
