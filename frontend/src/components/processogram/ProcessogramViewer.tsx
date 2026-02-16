"use client";

import { useRef } from "react";
import {
  TransformWrapper,
  TransformComponent,
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

interface ProcessogramViewerProps {
  svgContent: string;
}

export function ProcessogramViewer({ svgContent }: ProcessogramViewerProps) {
  const transformRef = useRef<ReactZoomPanPinchRef>(null);

  return (
    <div className="relative size-full overflow-hidden bg-background">
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
