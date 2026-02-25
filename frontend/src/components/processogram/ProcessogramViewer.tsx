"use client";

import { useRef, useEffect, useCallback } from "react";
import gsap from "gsap";
import { motion } from "framer-motion";
import { ZoomIn, ZoomOut, Maximize, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

/* =====================================================================
 * GSAP ViewBox Camera Engine
 *
 * Substitui react-zoom-pan-pinch por animação nativa de `viewBox`.
 * O SVG recalcula vetores nativamente a cada frame — zero desfoque,
 * enquadramento perfeito, centralização matemática exata.
 *
 * Fluxo:
 *   zoomTargetId muda → extractRealId → getBBox → padding adaptativo
 *   → gsap.to(svg, { attr: { viewBox } }) → animação fluida
 * ===================================================================== */

// ─── Constantes ────────────────────────────────────────────────────────
const ANIM_DURATION = 0.8;
const PADDING_FACTOR = 0.20; // 20% de padding ao redor do alvo
const MIN_VIEWBOX_DIM = 120; // Dimensão mínima do viewBox (evita zoom excessivo em elementos minúsculos)
const ZOOM_STEP = 0.25; // Fração de zoom por clique no HUD (25%)

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

/**
 * Extrai o ID real do elemento a partir do token de zoom.
 * Formato: "zoom__<realId>__<levelIdx>__<timestamp>"
 * Fallback: devolve o próprio valor se não seguir o formato.
 */
function extractRealId(zoomToken: string): string {
  if (!zoomToken.startsWith("zoom__")) return zoomToken;
  const parts = zoomToken.split("__");
  return parts[1] ?? zoomToken;
}

/**
 * Calcula o viewBox alvo com padding adaptativo ao redor de um elemento SVG.
 *
 * Padding = max(PADDING_FACTOR × dimensão, MIN_VIEWBOX_DIM / 4).
 * Isso garante que elementos muito pequenos (ex: um leitão) não sejam
 * enquadrados tão de perto que percam contexto visual.
 */
function computeTargetViewBox(element: SVGGraphicsElement): ViewBox {
  const bbox = element.getBBox();

  // Padding adaptativo: 20% da dimensão, com mínimo absoluto
  const rawPadX = bbox.width * PADDING_FACTOR;
  const rawPadY = bbox.height * PADDING_FACTOR;
  const minPad = MIN_VIEWBOX_DIM / 4;
  const padX = Math.max(rawPadX, minPad);
  const padY = Math.max(rawPadY, minPad);

  let w = bbox.width + padX * 2;
  let h = bbox.height + padY * 2;

  // Garante dimensão mínima para elementos microscópicos
  if (w < MIN_VIEWBOX_DIM) {
    const diff = MIN_VIEWBOX_DIM - w;
    w = MIN_VIEWBOX_DIM;
    // Re-centraliza
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

  return {
    x: bbox.x - padX,
    y: bbox.y - padY,
    w,
    h,
  };
}

// ─── HUD Button ────────────────────────────────────────────────────────

function HudButton({ onClick, label, children, className }: HudButtonProps) {
  return (
    <motion.button
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
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

interface UseViewBoxCameraOptions {
  svgRef: React.RefObject<SVGSVGElement | null>;
}

function useViewBoxCamera({ svgRef }: UseViewBoxCameraOptions) {
  const originalViewBoxRef = useRef<ViewBox | null>(null);
  const currentViewBoxRef = useRef<ViewBox | null>(null);
  const tweenRef = useRef<gsap.core.Tween | null>(null);

  // Captura o viewBox original do SVG após a primeira renderização
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
    const bbox = svg.getBBox();
    if (bbox.width > 0 && bbox.height > 0) {
      const vb: ViewBox = { x: bbox.x, y: bbox.y, w: bbox.width, h: bbox.height };
      originalViewBoxRef.current = vb;
      currentViewBoxRef.current = { ...vb };
      svg.setAttribute("viewBox", viewBoxToString(vb));
    }
  }, [svgRef]);

  // Anima para um viewBox específico
  const animateTo = useCallback(
    (target: ViewBox, duration = ANIM_DURATION) => {
      const svg = svgRef.current;
      if (!svg || !currentViewBoxRef.current) return;

      // Mata animação anterior (evita sobreposição)
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
    [svgRef]
  );

  // Zoom para um elemento alvo (ou reset se null)
  const zoomToTarget = useCallback(
    (targetId: string | null) => {
      const svg = svgRef.current;
      if (!svg) return;

      captureOriginalViewBox();

      // Reset → volta ao viewBox original
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

      const targetVb = computeTargetViewBox(
        element as SVGGraphicsElement
      );
      animateTo(targetVb);
    },
    [svgRef, captureOriginalViewBox, animateTo]
  );

  // HUD: Zoom In (reduz viewBox → aproxima)
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

  // HUD: Zoom Out (expande viewBox → afasta)
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

  // HUD: Reset (volta ao viewBox original com scale 1:1)
  const resetView = useCallback(() => {
    if (originalViewBoxRef.current) {
      animateTo(originalViewBoxRef.current);
    }
  }, [animateTo]);

  // HUD: Fit to screen (ajusta o viewBox para caber o conteúdo inteiro)
  const fitToScreen = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const bbox = svg.getBBox();
    if (bbox.width <= 0 || bbox.height <= 0) return;
    const pad = Math.max(bbox.width, bbox.height) * 0.05;
    animateTo({
      x: bbox.x - pad,
      y: bbox.y - pad,
      w: bbox.width + pad * 2,
      h: bbox.height + pad * 2,
    });
  }, [svgRef, animateTo]);

  // Cleanup: mata tweens pendentes ao desmontar
  useEffect(() => {
    return () => {
      tweenRef.current?.kill();
    };
  }, []);

  return { captureOriginalViewBox, zoomToTarget, zoomIn, zoomOut, resetView, fitToScreen, currentViewBoxRef };
}

// ─── Hook: useSvgPanZoom (pan + scroll zoom nativos) ───────────────────

function useSvgPanZoom(
  svgRef: React.RefObject<SVGSVGElement | null>,
  containerRef: React.RefObject<HTMLDivElement | null>,
  currentViewBoxRef: React.MutableRefObject<ViewBox | null>
) {
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const container = containerRef.current;
    const svg = svgRef.current;
    if (!container || !svg) return;

    // ── Scroll Zoom ──
    function handleWheel(e: WheelEvent) {
      e.preventDefault();
      const vb = currentViewBoxRef.current;
      if (!vb) return;

      const rect = svg!.getBoundingClientRect();
      // Posição normalizada do cursor dentro do SVG (0..1)
      const normX = (e.clientX - rect.left) / rect.width;
      const normY = (e.clientY - rect.top) / rect.height;

      const factor = e.deltaY > 0 ? 1.1 : 0.9;
      const newW = vb.w * factor;
      const newH = vb.h * factor;

      // Zoom centrado no cursor
      const newX = vb.x + (vb.w - newW) * normX;
      const newY = vb.y + (vb.h - newH) * normY;

      const newVb: ViewBox = { x: newX, y: newY, w: newW, h: newH };
      svg!.setAttribute("viewBox", viewBoxToString(newVb));
      currentViewBoxRef.current = newVb;
    }

    // ── Pan (drag) ──
    function handlePointerDown(e: PointerEvent) {
      // Ignora se for clique em botão do HUD
      if ((e.target as Element).closest("[data-hud]")) return;
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX, y: e.clientY };
      container!.style.cursor = "grabbing";
      container!.setPointerCapture(e.pointerId);
    }

    function handlePointerMove(e: PointerEvent) {
      if (!isPanningRef.current) return;
      const vb = currentViewBoxRef.current;
      if (!vb) return;

      const rect = svg!.getBoundingClientRect();
      // Converte pixels de tela → unidades SVG
      const scaleX = vb.w / rect.width;
      const scaleY = vb.h / rect.height;

      const dx = (panStartRef.current.x - e.clientX) * scaleX;
      const dy = (panStartRef.current.y - e.clientY) * scaleY;

      const newVb: ViewBox = { x: vb.x + dx, y: vb.y + dy, w: vb.w, h: vb.h };
      svg!.setAttribute("viewBox", viewBoxToString(newVb));
      currentViewBoxRef.current = newVb;

      panStartRef.current = { x: e.clientX, y: e.clientY };
    }

    function handlePointerUp() {
      isPanningRef.current = false;
      container!.style.cursor = "";
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
  } = useViewBoxCamera({ svgRef });

  // Após injetar o SVG, captura a ref do <svg> real
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const svgContainer = container.querySelector(".processogram-svg-container");
    if (!svgContainer) return;

    const svgEl = svgContainer.querySelector("svg");
    if (!svgEl) return;

    // Garante que o SVG tem preserveAspectRatio
    svgEl.setAttribute("preserveAspectRatio", "xMidYMid meet");
    // Garante que o SVG preenche o container
    svgEl.style.width = "100%";
    svgEl.style.height = "100%";

    // Atribui a ref manualmente (o SVG vem de dangerouslySetInnerHTML)
    (svgRef as React.MutableRefObject<SVGSVGElement | null>).current = svgEl;
    svgReadyRef.current = true;
    captureOriginalViewBox();
  }, [svgContent, captureOriginalViewBox]);

  // Pan + Scroll Zoom nativos
  useSvgPanZoom(svgRef, containerRef, currentViewBoxRef);

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
      className="relative size-full overflow-hidden bg-background cursor-grab active:cursor-grabbing"
    >
      <div
        className="processogram-svg-container size-full select-none"
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
