"use client";

import { useCallback, useRef, useEffect, type ReactNode } from "react";
import { isAnalyzableId } from "@/hooks/useProcessogramState";

const HIGHLIGHT_CLASS = "processogram-element-highlight";
const HIGHLIGHT_DURATION = 2000;

interface ProcessogramInteractiveLayerProps {
  children: ReactNode;
  onElementSelect: (elementId: string) => void;
  selectedElementId: string | null;
}

function resolveDeepestAnalyzableNode(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null;

  const self = target as Element;

  const selfId = self.getAttribute("id");
  if (selfId && isAnalyzableId(selfId)) return self;

  const closest = self.closest("[id]");
  if (!closest) return null;

  const closestTag = closest.tagName.toLowerCase();
  if (closestTag === "svg" || closestTag === "html") return null;

  const closestId = closest.getAttribute("id");
  if (closestId && isAnalyzableId(closestId)) return closest;

  let current = closest.parentElement;
  while (current && current.tagName.toLowerCase() !== "svg") {
    const parentId = current.getAttribute("id");
    if (parentId && isAnalyzableId(parentId)) return current;
    current = current.parentElement;
  }

  return null;
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
      e.stopPropagation();

      const node = resolveDeepestAnalyzableNode(e.target);
      if (!node) return;

      const id = node.getAttribute("id");
      if (!id) return;

      applyHighlight(node);
      onElementSelect(id);
    },
    [onElementSelect, applyHighlight]
  );

  return (
    <div ref={containerRef} onClick={handleClick} className="size-full">
      {children}
    </div>
  );
}
