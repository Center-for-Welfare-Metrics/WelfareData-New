"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, MapPin, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BreadcrumbItem, ElementLevel } from "@/types/processogram";

interface ProcessogramBreadcrumbProps {
  breadcrumbPath: BreadcrumbItem[];
  activeLevelIndex: number;
  onNavigate: (levelIndex: number) => void;
  onReset: () => void;
}

const LEVEL_ABBREVIATION: Record<ElementLevel, string> = {
  "production system": "SYS",
  "life-fate": "LF",
  phase: "PH",
  circumstance: "CI",
  unknown: "?",
};

const LEVEL_COLOR: Record<ElementLevel, string> = {
  "production system": "text-sky-400",
  "life-fate": "text-amber-400",
  phase: "text-emerald-400",
  circumstance: "text-rose-400",
  unknown: "text-white/40",
};

export function ProcessogramBreadcrumb({
  breadcrumbPath,
  activeLevelIndex,
  onNavigate,
  onReset,
}: ProcessogramBreadcrumbProps) {
  if (breadcrumbPath.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.nav
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ type: "spring", damping: 25, stiffness: 350 }}
        aria-label="Navegação hierárquica"
        className={cn(
          "absolute left-4 top-4 z-50 flex items-center gap-1",
          "rounded-lg border border-white/10 bg-black/60 px-3 py-2 backdrop-blur-md",
          "shadow-lg shadow-black/30"
        )}
      >
        <button
          onClick={onReset}
          aria-label="Voltar à visão global"
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded",
            "text-white/40 transition-colors",
            "hover:bg-white/10 hover:text-primary"
          )}
        >
          <Home className="size-3.5" />
        </button>

        {breadcrumbPath.map((crumb, index) => {
          const isActive = index === activeLevelIndex;
          const isPast = index < activeLevelIndex;
          const isFuture = index > activeLevelIndex;

          return (
            <motion.div
              key={crumb.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="flex items-center gap-1"
            >
              <ChevronRight className="size-3 text-white/20 shrink-0" />

              <button
                onClick={() => onNavigate(index)}
                disabled={isFuture}
                className={cn(
                  "group flex items-center gap-1.5 rounded px-2 py-1 font-mono text-[11px] transition-all",
                  isActive && [
                    "bg-primary/15 border border-primary/30",
                    "text-primary",
                  ],
                  isPast && [
                    "text-white/60 hover:bg-white/10 hover:text-white",
                  ],
                  isFuture && "cursor-default text-white/20"
                )}
              >
                <span
                  className={cn(
                    "text-[9px] font-bold uppercase tracking-widest",
                    isActive
                      ? LEVEL_COLOR[crumb.levelName]
                      : isPast
                        ? "text-white/40"
                        : "text-white/15"
                  )}
                >
                  {LEVEL_ABBREVIATION[crumb.levelName]}
                </span>
                <span className="max-w-24 truncate sm:max-w-40">{crumb.label}</span>
                {isActive && (
                  <MapPin className="size-2.5 text-primary/60 shrink-0" />
                )}
              </button>
            </motion.div>
          );
        })}
      </motion.nav>
    </AnimatePresence>
  );
}
