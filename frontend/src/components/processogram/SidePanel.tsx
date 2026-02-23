"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Scan, Database } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatWidget } from "@/components/chat/ChatWidget";
import type { ActiveElementData, BreadcrumbItem } from "@/types/processogram";

interface ElementData {
  elementId: string;
  description: string;
}

interface SidePanelProps {
  processogramId: string;
  selectedElementId: string | null;
  onClose: () => void;
  activeElementData?: ActiveElementData | null;
  breadcrumbPath?: BreadcrumbItem[];
  onBreadcrumbClick?: (levelIndex: number) => void;
}

const panelVariants = {
  hidden: { x: "100%", opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: { type: "spring" as const, damping: 28, stiffness: 300 },
  },
  exit: {
    x: "100%",
    opacity: 0,
    transition: { type: "spring" as const, damping: 28, stiffness: 300 },
  },
};

function formatElementId(id: string): string {
  return id
    .replace(/[-_]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function SidePanel({
  processogramId,
  selectedElementId,
  onClose,
  /* Navigation props — wired for future Breadcrumb / Questions UI */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  activeElementData,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  breadcrumbPath,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onBreadcrumbClick,
}: SidePanelProps) {
  const [elementData, setElementData] = useState<ElementData | null>(null);
  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    if (!selectedElementId) {
      setElementData(null);
      return;
    }

    const controller = new AbortController();

    async function fetchElementData() {
      setLoadingData(true);
      setElementData(null);
      try {
        const res = await fetch(
          `/api/v1/processograms/${processogramId}/data/public`,
          {
            credentials: "include",
            signal: controller.signal,
          }
        );
        if (!res.ok) {
          setLoadingData(false);
          return;
        }
        const items: ElementData[] = await res.json();
        const match = items.find(
          (d) => d.elementId === selectedElementId
        );
        setElementData(match ?? null);
      } catch {
        /* abort or network error */
      } finally {
        setLoadingData(false);
      }
    }

    fetchElementData();
    return () => controller.abort();
  }, [processogramId, selectedElementId]);

  return (
    <AnimatePresence>
      {selectedElementId && (
        <motion.aside
          key="side-panel"
          variants={panelVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className={cn(
            "absolute inset-y-0 right-0 z-30 flex w-full flex-col sm:w-95 lg:w-105",
            "border-l border-primary/20 bg-black/80 backdrop-blur-xl"
          )}
        >
          <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10">
                <Scan className="size-3.5 text-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-bold text-foreground">
                  {formatElementId(selectedElementId)}
                </h2>
                <p className="truncate text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  ID: {selectedElementId}
                </p>
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              aria-label="Fechar painel"
              className={cn(
                "flex size-7 items-center justify-center rounded-md",
                "border border-white/10 bg-white/5 text-muted-foreground",
                "transition-colors hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
              )}
            >
              <X className="size-3.5" />
            </motion.button>
          </header>

          {(elementData || loadingData) && (
            <div className="shrink-0 border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <Database className="size-3 text-primary/60" />
                <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  Dados do Elemento
                </span>
              </div>
              {loadingData ? (
                <div className="h-4 w-3/4 animate-pulse rounded bg-white/10" />
              ) : elementData ? (
                <p className="text-xs leading-relaxed text-foreground/80">
                  {elementData.description}
                </p>
              ) : null}
            </div>
          )}

          {!loadingData && !elementData && (
            <div className="shrink-0 border-b border-white/10 px-4 py-3">
              <p className="text-[11px] font-mono text-muted-foreground/60 italic">
                Nenhuma descrição disponível para este elemento.
              </p>
            </div>
          )}

          <div className="flex-1 overflow-hidden">
            <ChatWidget
              processogramId={processogramId}
              elementContext={selectedElementId}
            />
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
