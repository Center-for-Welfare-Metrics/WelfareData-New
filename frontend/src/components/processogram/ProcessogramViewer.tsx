"use client";

import { useRef, useEffect, useCallback } from "react";
import gsap from "gsap";
import { motion } from "framer-motion";
import { ZoomIn, ZoomOut, Maximize, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

/* =====================================================================
 * GSAP ViewBox Camera Engine v2 — Hotfix
 *
 * Anima nativamente o atributo `viewBox` do <svg>.
 * O browser re-renderiza vetores a cada frame → zero desfoque.
 *
 * Hotfixes aplicados:
 *   1. SVG dimensionamento: remove width/height fixos, usa CSS 100%
 *   2. Cliques: distingue click vs pan via distância de arrasto
 *   3. ViewBox sync: ref unificada entre câmera e pan/zoom
 * ===================================================================== */

// ─── Constantes ────────────────────────────────────────────────────────
const ANIM_DURATION = 0.8;
const PADDING_FACTOR = 0.20;
const MIN_VIEWBOX_DIM = 120;
const ZOOM_STEP = 0.25;
const PAN_CLICK_THRESHOLD = 5; // pixels — abaixo disso é clique, acima é pan

// ─── Tipos ─────────────────────────────────────────────────────────────
interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface HudButtonProps {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  className?: string;
}

// ─── Utilitários ───────────────────────────────────────────────────────

function parseViewBox(raw: string | null): ViewBox | null {
  if (!raw) return null;
  const parts = raw.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return null;
  return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
}

function viewBoxToString(vb: ViewBox): string {
  return `${vb.x} ${vb.y} ${vb.w} ${vb.h}`;
}

function extractRealId(zoomToken: string): string {
  if (!zoomToken.startsWith("zoom__")) return zoomToken;
  const parts = zoomToken.split("__");
  return parts[1] ?? zoomToken;
}

function computeTargetViewBox(element: SVGGraphicsElement): ViewBox {
  const bbox = element.getBBox();

  const rawPadX = bbox.width * PADDING_FACTOR;
  const rawPadY = bbox.height * PADDING_FACTOR;
  const minPad = MIN_VIEWBOX_DIM / 4;
  const padX = Math.max(rawPadX, minPad);
  const padY = Math.max(rawPadY, minPad);

  let w = bbox.width + padX * 2;
  let h = bbox.height + padY * 2;

  if (w < MIN_VIEWBOX_DIM) {
    const diff = MIN_VIEWBOX_DIM - w;
    w = MIN_VIEWBOX_DIM;
    return {
      x: bbox.x - padX - diff / 2,
      y: bbox.y - padY - (MIN_VIEWBOX_DIM - h) / 2,
      w,
      h: Math.max(h, MIN_VIEWBOX_DIM),
    };
  }
  if (h < MIN_VIEWBOX_DIM) {
    const diff = MIN_VIEWBOX_DIM - h;
    h = MIN_VIEWBOX_DIM;
    return {
      x: bbox.x - padX - (MIN_VIEWBOX_DIM - w) / 2,
      y: bbox.y - padY - diff / 2,
      w: Math.max(w, MIN_VIEWBOX_DIM),
      h,
    };
  }

  return { x: bbox.x - padX, y: bbox.y - padY, w, h };
}

/**
 * Sanitiza o <svg> injetado:
 *  - Remove atributos width/height fixos (ex: width="1920" height="1080")
 *  - Se não houver viewBox, cria um a partir de width/height antes de removê-los
 *  - Aplica preserveAspectRatio para enquadramento correto
 */
function sanitizeSvgElement(svgEl: SVGSVGElement): void {
  const existingViewBox = svgEl.getAttribute("viewBox");

  // Se não tem viewBox, tenta criar a partir de width/height
  if (!existingViewBox) {
    const w = svgEl.getAttribute("width");
    const h = svgEl.getAttribute("height");
    if (w && h) {
      const wNum = parseFloat(w);
      const hNum = parseFloat(h);
      if (!Number.isNaN(wNum) && !Number.isNaN(hNum) && wNum > 0 && hNum > 0) {
        svgEl.setAttribute("viewBox", `0 0 ${wNum} ${hNum}`);
      }
    }
  }

  // Remove dimensões fixas — o SVG deve obedecer ao container via CSS
  svgEl.removeAttribute("width");
  svgEl.removeAttribute("height");

  // Garante enquadramento proporcional centralizado
  svgEl.setAttribute("preserveAspectRatio", "xMidYMid meet");
}

// ─── HUD Button ────────────────────────────────────────────────────────

function HudButton({ onClick, label, children, className }: HudButtonProps) {
  return (
    <motion.button
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={label}
      className={cn(
        "flex size-10 items-center justify-center rounded-md",
        "border border-white/20 bg-black/50 text-white/80 backdrop-blur-sm",
        "transition-colors hover:border-primary/50 hover:bg-black/70 hover:text-primary",
        className
      )}
    >
      {children}
    </motion.button>
  );
}

// ─── Hook: useViewBoxCamera ────────────────────────────────────────────

function useViewBoxCamera(svgRef: React.RefObject<SVGSVGElement | null>) {
  const originalViewBoxRef = useRef<ViewBox | null>(null);
  const currentViewBoxRef = useRef<ViewBox | null>(null);
  const tweenRef = useRef<gsap.core.Tween | null>(null);

  const captureOriginalViewBox = useCallback(() => {
    const svg = svgRef.current;
    if (!svg || originalViewBoxRef.current) return;

    const raw = svg.getAttribute("viewBox");
    const parsed = parseViewBox(raw);

    if (parsed) {
      originalViewBoxRef.current = parsed;
      currentViewBoxRef.current = { ...parsed };
      return;
    }

    // Fallback: calcula do bounding box inteiro do SVG
    try {
      const bbox = svg.getBBox();
      if (bbox.width > 0 && bbox.height > 0) {
        const vb: ViewBox = { x: bbox.x, y: bbox.y, w: bbox.width, h: bbox.height };
        originalViewBoxRef.current = vb;
        currentViewBoxRef.current = { ...vb };
        svg.setAttribute("viewBox", viewBoxToString(vb));
      }
    } catch {
      // getBBox pode falhar se o SVG não está renderizado ainda
    }
  }, [svgRef]);

  const animateTo = useCallback(
    (target: ViewBox, duration = ANIM_DURATION) => {
      const svg = svgRef.current;
      if (!svg) return;

      // Se não temos viewBox atual, captura e aplica direto
      if (!currentViewBoxRef.current) {
        captureOriginalViewBox();
        if (!currentViewBoxRef.current) {
          svg.setAttribute("viewBox", viewBoxToString(target));
          currentViewBoxRef.current = { ...target };
          return;
        }
      }

      tweenRef.current?.kill();

      const proxy = { ...currentViewBoxRef.current };

      tweenRef.current = gsap.to(proxy, {
        x: target.x,
        y: target.y,
        w: target.w,
        h: target.h,
        duration,
        ease: "power3.inOut",
        onUpdate: () => {
          svg.setAttribute("viewBox", viewBoxToString(proxy));
          currentViewBoxRef.current = { ...proxy };
        },
        onComplete: () => {
          currentViewBoxRef.current = { ...target };
        },
      });
    },
    [svgRef, captureOriginalViewBox]
  );

  const zoomToTarget = useCallback(
    (targetId: string | null) => {
      const svg = svgRef.current;
      if (!svg) return;

      captureOriginalViewBox();

      if (!targetId) {
        if (originalViewBoxRef.current) {
          animateTo(originalViewBoxRef.current);
        }
        return;
      }

      const realId = extractRealId(targetId);
      const element =
        svg.querySelector(`#${CSS.escape(realId)}`) ??
        svg.querySelector(`[id="${realId}"]`);

      if (!element) return;

      try {
        const targetVb = computeTargetViewBox(element as SVGGraphicsElement);
        animateTo(targetVb);
      } catch {
        // getBBox pode falhar em elementos sem geometria
      }
    },
    [svgRef, captureOriginalViewBox, animateTo]
  );

  const zoomIn = useCallback(() => {
    if (!currentViewBoxRef.current) return;
    const vb = currentViewBoxRef.current;
    const shrinkW = vb.w * ZOOM_STEP;
    const shrinkH = vb.h * ZOOM_STEP;
    animateTo({
      x: vb.x + shrinkW / 2,
      y: vb.y + shrinkH / 2,
      w: vb.w - shrinkW,
      h: vb.h - shrinkH,
    }, 0.4);
  }, [animateTo]);

  const zoomOut = useCallback(() => {
    if (!currentViewBoxRef.current) return;
    const vb = currentViewBoxRef.current;
    const growW = vb.w * ZOOM_STEP;
    const growH = vb.h * ZOOM_STEP;
    animateTo({
      x: vb.x - growW / 2,
      y: vb.y - growH / 2,
      w: vb.w + growW,
      h: vb.h + growH,
    }, 0.4);
  }, [animateTo]);

  const resetView = useCallback(() => {
    if (originalViewBoxRef.current) {
      animateTo(originalViewBoxRef.current);
    }
  }, [animateTo]);

  const fitToScreen = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    try {
      const bbox = svg.getBBox();
      if (bbox.width <= 0 || bbox.height <= 0) return;
      const pad = Math.max(bbox.width, bbox.height) * 0.05;
      animateTo({
        x: bbox.x - pad,
        y: bbox.y - pad,
        w: bbox.width + pad * 2,
        h: bbox.height + pad * 2,
      });
    } catch {
      // getBBox pode falhar
    }
  }, [svgRef, animateTo]);

  useEffect(() => {
    return () => {
      tweenRef.current?.kill();
    };
  }, []);

  return { captureOriginalViewBox, zoomToTarget, zoomIn, zoomOut, resetView, fitToScreen, currentViewBoxRef };
}

// ─── Hook: useSvgPanZoom ───────────────────────────────────────────────

function useSvgPanZoom(
  svgRef: React.RefObject<SVGSVGElement | null>,
  containerRef: React.RefObject<HTMLDivElement | null>,
  currentViewBoxRef: React.MutableRefObject<ViewBox | null>
) {
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const pointerStartRef = useRef({ x: 0, y: 0 });
  const didDragRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function getSvg() {
      return svgRef.current;
    }

    // ── Scroll Zoom (centrado no cursor) ──
    function handleWheel(e: WheelEvent) {
      e.preventDefault();
      const svg = getSvg();
      const vb = currentViewBoxRef.current;
      if (!svg || !vb) return;

      const rect = svg.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const normX = (e.clientX - rect.left) / rect.width;
      const normY = (e.clientY - rect.top) / rect.height;

      const factor = e.deltaY > 0 ? 1.1 : 0.9;
      const newW = vb.w * factor;
      const newH = vb.h * factor;

      const newVb: ViewBox = {
        x: vb.x + (vb.w - newW) * normX,
        y: vb.y + (vb.h - newH) * normY,
        w: newW,
        h: newH,
      };
      svg.setAttribute("viewBox", viewBoxToString(newVb));
      currentViewBoxRef.current = newVb;
    }

    // ── Pan (drag) ──
    function handlePointerDown(e: PointerEvent) {
      if ((e.target as Element).closest("[data-hud]")) return;
      // Só pan com botão primário
      if (e.button !== 0) return;

      isPanningRef.current = true;
      didDragRef.current = false;
      activePointerIdRef.current = e.pointerId;
      panStartRef.current = { x: e.clientX, y: e.clientY };
      pointerStartRef.current = { x: e.clientX, y: e.clientY };
      // NÃO chama setPointerCapture aqui — senão o browser
      // redireciona o target e suprime o evento click sintético.
      // A captura é ativada APENAS quando o arrasto excede o threshold.
    }

    function handlePointerMove(e: PointerEvent) {
      if (!isPanningRef.current) return;
      const svg = getSvg();
      const vb = currentViewBoxRef.current;
      if (!svg || !vb) return;

      // Calcula distância total desde o início para determinar se é drag
      const totalDx = e.clientX - pointerStartRef.current.x;
      const totalDy = e.clientY - pointerStartRef.current.y;
      const totalDist = Math.sqrt(totalDx * totalDx + totalDy * totalDy);

      if (totalDist >= PAN_CLICK_THRESHOLD) {
        // Cruza o threshold → agora É drag. Ativa pointer capture
        // apenas na primeira vez para travar o pan no container.
        if (!didDragRef.current) {
          didDragRef.current = true;
          if (activePointerIdRef.current !== null) {
            try { container!.setPointerCapture(activePointerIdRef.current); } catch { /* ok */ }
          }
        }
        container!.style.cursor = "grabbing";
      }

      const rect = svg.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const scaleX = vb.w / rect.width;
      const scaleY = vb.h / rect.height;

      const dx = (panStartRef.current.x - e.clientX) * scaleX;
      const dy = (panStartRef.current.y - e.clientY) * scaleY;

      const newVb: ViewBox = { x: vb.x + dx, y: vb.y + dy, w: vb.w, h: vb.h };
      svg.setAttribute("viewBox", viewBoxToString(newVb));
      currentViewBoxRef.current = newVb;

      panStartRef.current = { x: e.clientX, y: e.clientY };
    }

    function handlePointerUp(e: PointerEvent) {
      const wasDragging = didDragRef.current;
      isPanningRef.current = false;
      activePointerIdRef.current = null;
      container!.style.cursor = "";

      // Só libera pointer capture se realmente capturou (i.e., arrastou)
      if (wasDragging) {
        try { container!.releasePointerCapture(e.pointerId); } catch { /* ok */ }
      }
    }

    container.addEventListener("wheel", handleWheel, { passive: false });
    container.addEventListener("pointerdown", handlePointerDown);
    container.addEventListener("pointermove", handlePointerMove);
    container.addEventListener("pointerup", handlePointerUp);
    container.addEventListener("pointerleave", handlePointerUp);

    return () => {
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("pointerdown", handlePointerDown);
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerup", handlePointerUp);
      container.removeEventListener("pointerleave", handlePointerUp);
    };
  }, [svgRef, containerRef, currentViewBoxRef]);

  return { didDragRef };
}

// ─── Componente Principal ──────────────────────────────────────────────

interface ProcessogramViewerProps {
  svgContent: string;
  zoomTargetId?: string | null;
}

export function ProcessogramViewer({
  svgContent,
  zoomTargetId = null,
}: ProcessogramViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const prevTargetRef = useRef<string | null>(null);
  const svgReadyRef = useRef(false);

  const {
    captureOriginalViewBox,
    zoomToTarget,
    zoomIn,
    zoomOut,
    resetView,
    fitToScreen,
    currentViewBoxRef,
  } = useViewBoxCamera(svgRef);

  // Após injetar o SVG, sanitiza e captura o viewBox original
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const svgContainer = container.querySelector(".processogram-svg-container");
    if (!svgContainer) return;

    const svgEl = svgContainer.querySelector("svg");
    if (!svgEl) return;

    // ── Fix 1: Sanitização — remove dimensões fixas, garante viewBox ──
    sanitizeSvgElement(svgEl);

    // Atribui a ref manualmente (o SVG vem de dangerouslySetInnerHTML)
    (svgRef as React.MutableRefObject<SVGSVGElement | null>).current = svgEl;
    svgReadyRef.current = true;
    captureOriginalViewBox();
  }, [svgContent, captureOriginalViewBox]);

  // Pan + Scroll Zoom nativos
  const { didDragRef } = useSvgPanZoom(svgRef, containerRef, currentViewBoxRef);

  // ── Fix 2: Click handler que distingue drag de clique ──
  // O click event do React só dispara DEPOIS do pointerup.
  // Se o usuário arrastou (didDragRef = true), engolimos o click aqui
  // para que ele NÃO chegue ao InteractiveLayer.
  const handleContainerClick = useCallback(
    (e: React.MouseEvent) => {
      if (didDragRef.current) {
        // Foi drag, não click — bloqueia propagação para o InteractiveLayer
        didDragRef.current = false;
        e.stopPropagation();
        return;
      }
      // Se clicou no HUD, o botão já tem seu próprio onClick
      if ((e.target as Element).closest("[data-hud]")) return;

      // Click real: NÃO chamamos stopPropagation — o evento borbulha
      // até o InteractiveLayer, que resolve o elemento analisável.
    },
    [didDragRef]
  );

  // Reage a mudanças no zoomTargetId (vindo do useProcessogramState)
  useEffect(() => {
    if (!svgReadyRef.current) return;

    if (!zoomTargetId) {
      if (prevTargetRef.current !== null) {
        zoomToTarget(null);
        prevTargetRef.current = null;
      }
      return;
    }

    if (zoomTargetId === prevTargetRef.current) return;
    prevTargetRef.current = zoomTargetId;

    zoomToTarget(zoomTargetId);
  }, [zoomTargetId, zoomToTarget]);

  return (
    <div
      ref={containerRef}
      onClick={handleContainerClick}
      className="relative size-full overflow-hidden bg-background cursor-grab active:cursor-grabbing"
    >
      {/* O SVG ocupa 100% via CSS — sem width/height fixos */}
      <div
        className="processogram-svg-container size-full select-none [&>svg]:size-full [&>svg]:object-contain"
        dangerouslySetInnerHTML={{ __html: svgContent }}
      />

      {/* ── HUD de Controles ── */}
      <motion.div
        data-hud
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.3, duration: 0.4 }}
        className="absolute right-4 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-2"
      >
        <HudButton onClick={zoomIn} label="Zoom in">
          <ZoomIn className="size-4" />
        </HudButton>

        <HudButton onClick={zoomOut} label="Zoom out">
          <ZoomOut className="size-4" />
        </HudButton>

        <div className="my-1 h-px bg-white/10" />

        <HudButton onClick={resetView} label="Resetar zoom">
          <Maximize className="size-4" />
        </HudButton>

        <HudButton onClick={fitToScreen} label="Ajustar à tela">
          <RotateCcw className="size-4" />
        </HudButton>
      </motion.div>

      {/* ── Dica de uso ── */}
      <motion.div
        data-hud
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="absolute bottom-4 left-4 z-10 flex items-center gap-2 rounded-md border border-white/10 bg-black/40 px-3 py-1.5 backdrop-blur-sm"
      >
        <span className="text-[10px] font-mono uppercase tracking-widest text-white/50">
          Scroll para zoom · Arraste para navegar
        </span>
      </motion.div>
    </div>
  );
}
