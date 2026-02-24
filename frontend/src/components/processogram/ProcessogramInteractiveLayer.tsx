"use client";

import { useCallback, useRef, useEffect, type ReactNode } from "react";
import { isAnalyzableId } from "@/hooks/useProcessogramState";
import type { BreadcrumbItem } from "@/types/processogram";

const HIGHLIGHT_CLASS = "processogram-element-highlight";
const HIGHLIGHT_DURATION = 2000;

/* ---------- Visual Isolation CSS classes ---------- */
const CLS_EXPLORING = "is-exploring";
const CLS_ACTIVE_ZONE = "is-active-zone";
const CLS_TARGET = "is-target-element";

interface ProcessogramInteractiveLayerProps {
  children: ReactNode;
  onElementSelect: (elementId: string) => void;
  selectedElementId: string | null;
  /** Índice do nível ativo na hierarquia (-1 = nenhum). */
  activeLevelIndex: number;
  /** Caminho de breadcrumbs da hierarquia atual. */
  breadcrumbPath: BreadcrumbItem[];
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
  activeLevelIndex,
  breadcrumbPath,
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

  /* ================================================================
   * Visual Isolation — "Blackout" (Focus & Mute)
   *
   * Gerencia dinamicamente 3 classes CSS no DOM do SVG:
   *   .is-exploring    → na tag <svg> raiz
   *   .is-active-zone  → no <g> do nível ativo (breadcrumb)
   *   .is-target-element → no nó do selectedElementId
   *
   * O CSS em globals.css aplica brightness(0.3) / brightness(1)
   * baseado nessas classes — sem jamais alterar fill/stroke/opacity.
   * ================================================================ */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const svgContainer = container.querySelector(".processogram-svg-container");
    if (!svgContainer) return;

    const svgRoot = svgContainer.querySelector("svg");
    if (!svgRoot) return;

    // --- Passo 1: Reset limpo de todas as classes de isolamento ---
    svgRoot.classList.remove(CLS_EXPLORING);
    svgRoot.querySelectorAll(`.${CLS_ACTIVE_ZONE}`).forEach((el) => {
      el.classList.remove(CLS_ACTIVE_ZONE);
    });
    svgRoot.querySelectorAll(`.${CLS_TARGET}`).forEach((el) => {
      el.classList.remove(CLS_TARGET);
    });

    // --- Passo 2: Blackout — ativa modo exploração se fez drill-down ---
    const isExploring = activeLevelIndex >= 0 && breadcrumbPath.length > 0;
    if (isExploring) {
      svgRoot.classList.add(CLS_EXPLORING);

      // --- Passo 3: Acende a zona ativa (nível atual do breadcrumb) ---
      const activeCrumb = breadcrumbPath[activeLevelIndex];
      if (activeCrumb) {
        const activeNode =
          svgRoot.querySelector(`#${CSS.escape(activeCrumb.id)}`) ??
          svgRoot.querySelector(`[id="${activeCrumb.id}"]`);
        if (activeNode) {
          activeNode.classList.add(CLS_ACTIVE_ZONE);
        }
      }
    }

    // --- Passo 4: Destacar o elemento-alvo selecionado ---
    if (selectedElementId) {
      const targetNode =
        svgRoot.querySelector(`#${CSS.escape(selectedElementId)}`) ??
        svgRoot.querySelector(`[id="${selectedElementId}"]`);
      if (targetNode) {
        targetNode.classList.add(CLS_TARGET);
      }
    }
  }, [activeLevelIndex, breadcrumbPath, selectedElementId]);

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
