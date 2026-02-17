"use client";

import { useCallback, useRef, useEffect, type ReactNode } from "react";

const HIGHLIGHT_CLASS = "processogram-element-highlight";
const HIGHLIGHT_DURATION = 2000;

interface ProcessogramInteractiveLayerProps {
  children: ReactNode;
  onElementSelect: (elementId: string) => void;
  selectedElementId: string | null;
}

function cleanId(raw: string): string {
  return raw.replace(/^#/, "").trim();
}

function findClickableAncestor(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null;
  return target.closest("[id]");
}

export function ProcessogramInteractiveLayer({
  children,
  onElementSelect,
  selectedElementId,
}: ProcessogramInteractiveLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const previousHighlightRef = useRef<Element | null>(null);

  const clearHighlight = useCallback(() => {
    if (previousHighlightRef.current) {
      previousHighlightRef.current.classList.remove(HIGHLIGHT_CLASS);
      previousHighlightRef.current = null;
    }
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }
  }, []);

  const applyHighlight = useCallback(
    (element: Element) => {
      clearHighlight();
      element.classList.add(HIGHLIGHT_CLASS);
      previousHighlightRef.current = element;

      highlightTimerRef.current = setTimeout(() => {
        element.classList.remove(HIGHLIGHT_CLASS);
        previousHighlightRef.current = null;
      }, HIGHLIGHT_DURATION);
    },
    [clearHighlight]
  );

  useEffect(() => {
    return () => clearHighlight();
  }, [clearHighlight]);

  useEffect(() => {
    if (!selectedElementId || !containerRef.current) return;

    const svgContainer = containerRef.current.querySelector(
      ".processogram-svg-container"
    );
    if (!svgContainer) return;

    const target =
      svgContainer.querySelector(`#${CSS.escape(selectedElementId)}`) ??
      svgContainer.querySelector(`[id="${selectedElementId}"]`);

    if (target) {
      applyHighlight(target);
    }
  }, [selectedElementId, applyHighlight]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const ancestor = findClickableAncestor(e.target);
      if (!ancestor) return;

      const id = ancestor.getAttribute("id");
      if (!id) return;

      const cleaned = cleanId(id);
      if (!cleaned || cleaned === "svg" || cleaned.startsWith("__")) return;

      applyHighlight(ancestor);
      onElementSelect(cleaned);
    },
    [onElementSelect, applyHighlight]
  );

  return (
    <div ref={containerRef} onClick={handleClick} className="size-full">
      {children}
    </div>
  );
}
