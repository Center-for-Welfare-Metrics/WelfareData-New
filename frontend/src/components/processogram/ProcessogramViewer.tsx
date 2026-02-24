"use client";

import { useRef, useEffect } from "react";
import {
  TransformWrapper,
  TransformComponent,
  useControls,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import { motion } from "framer-motion";
import { ZoomIn, ZoomOut, Maximize, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface HudButtonProps {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  className?: string;
}

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

const ZOOM_ANIMATION_MS = 800;
const ZOOM_PADDING = 0.85;

function computeDynamicScale(
  elementId: string,
  wrapperEl: HTMLElement | null
): number {
  if (!wrapperEl) return 2;

  const svgContainer = wrapperEl.querySelector(".processogram-svg-container");
  if (!svgContainer) return 2;

  const target =
    svgContainer.querySelector(`#${CSS.escape(elementId)}`) ??
    svgContainer.querySelector(`[id="${elementId}"]`);
  if (!target) return 2;

  const bbox = (target as SVGGraphicsElement).getBBox?.();
  if (!bbox || bbox.width === 0 || bbox.height === 0) return 2;

  const wrapperRect = wrapperEl.getBoundingClientRect();
  const scaleX = (wrapperRect.width * ZOOM_PADDING) / bbox.width;
  const scaleY = (wrapperRect.height * ZOOM_PADDING) / bbox.height;
  const idealScale = Math.min(scaleX, scaleY);

  return Math.max(0.5, Math.min(idealScale, 6));
}

interface CameraControllerProps {
  zoomTargetId: string | null;
  wrapperRef: React.RefObject<HTMLDivElement | null>;
}

function CameraController({ zoomTargetId, wrapperRef }: CameraControllerProps) {
  const { zoomToElement, resetTransform } = useControls();
  const prevTargetRef = useRef<string | null>(null);

  useEffect(() => {
    if (!zoomTargetId) {
      if (prevTargetRef.current !== null) {
        resetTransform(ZOOM_ANIMATION_MS, "easeInOutCubic");
        prevTargetRef.current = null;
      }
      return;
    }

    if (zoomTargetId === prevTargetRef.current) return;
    prevTargetRef.current = zoomTargetId;

    const scale = computeDynamicScale(zoomTargetId, wrapperRef.current);

    requestAnimationFrame(() => {
      zoomToElement(zoomTargetId, scale, ZOOM_ANIMATION_MS, "easeInOutCubic");
    });
  }, [zoomTargetId, zoomToElement, resetTransform, wrapperRef]);

  return null;
}

interface ProcessogramViewerProps {
  svgContent: string;
  zoomTargetId?: string | null;
}

export function ProcessogramViewer({
  svgContent,
  zoomTargetId = null,
}: ProcessogramViewerProps) {
  const transformRef = useRef<ReactZoomPanPinchRef>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={wrapperRef} className="relative size-full overflow-hidden bg-background">
      <TransformWrapper
        ref={transformRef}
        initialScale={1}
        minScale={0.2}
        maxScale={8}
        centerOnInit
        limitToBounds={false}
        panning={{ velocityDisabled: false }}
        doubleClick={{ mode: "zoomIn", step: 0.7 }}
      >
        <CameraController
          zoomTargetId={zoomTargetId}
          wrapperRef={wrapperRef}
        />
        <TransformComponent
          wrapperClass="!size-full cursor-grab active:cursor-grabbing"
          contentClass="!flex !items-center !justify-center"
        >
          <div
            className="processogram-svg-container select-none"
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
        </TransformComponent>
      </TransformWrapper>

      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.3, duration: 0.4 }}
        className="absolute right-4 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-2"
      >
        <HudButton
          onClick={() => transformRef.current?.zoomIn(0.5)}
          label="Zoom in"
        >
          <ZoomIn className="size-4" />
        </HudButton>

        <HudButton
          onClick={() => transformRef.current?.zoomOut(0.5)}
          label="Zoom out"
        >
          <ZoomOut className="size-4" />
        </HudButton>

        <div className="my-1 h-px bg-white/10" />

        <HudButton
          onClick={() => transformRef.current?.centerView(1)}
          label="Resetar zoom"
        >
          <Maximize className="size-4" />
        </HudButton>

        <HudButton
          onClick={() => transformRef.current?.centerView()}
          label="Ajustar à tela"
        >
          <RotateCcw className="size-4" />
        </HudButton>
      </motion.div>

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
