"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, LogIn, Loader2, AlertTriangle } from "lucide-react";
import { useTheme } from "next-themes";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { ProcessogramViewer } from "@/components/processogram/ProcessogramViewer";
import { ProcessogramInteractiveLayer } from "@/components/processogram/ProcessogramInteractiveLayer";
import { ProcessogramBreadcrumb } from "@/components/processogram/ProcessogramBreadcrumb";
import { SidePanel } from "@/components/processogram/SidePanel";
import { useProcessogramState } from "@/hooks/useProcessogramState";
import { processogramService } from "@/services/processograms";
import type { Processogram, ProcessogramElement, ProcessogramQuestion } from "@/types/processogram";

type ViewState =
  | { status: "loading" }
  | { status: "ready"; processogram: Processogram; svgContent: string }
  | { status: "error"; message: string };

export default function PublicViewPage() {
  const params = useParams<{ id: string }>();
  const { resolvedTheme } = useTheme();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [state, setState] = useState<ViewState>({ status: "loading" });
  const [elements, setElements] = useState<ProcessogramElement[]>([]);
  const [questions, setQuestions] = useState<ProcessogramQuestion[]>([]);

  const {
    selectedElementId,
    activeElementData,
    breadcrumbPath,
    activeLevelIndex,
    zoomTargetId,
    handleDrilldown,
    clearSelection,
    navigateUp,
  } = useProcessogramState(elements, questions);

  const handleElementSelect = useCallback(
    (elementId: string) => {
      if (selectedElementId === elementId) {
        clearSelection();
      } else {
        handleDrilldown(elementId);
      }
    },
    [selectedElementId, handleDrilldown, clearSelection]
  );

  useEffect(() => {
    console.log("Current State:", {
      selectedElementId,
      activeLevelIndex,
      zoomTargetId,
      breadcrumbPath,
      activeElementData,
    });
  }, [selectedElementId, activeLevelIndex, zoomTargetId, breadcrumbPath, activeElementData]);

  useEffect(() => {
    if (!params.id) return;

    const controller = new AbortController();

    async function fetchProcessogram() {
      setState({ status: "loading" });
      try {
        const theme = resolvedTheme === "light" ? "light" : "dark";

        const [{ data: processogram }, { data: svgContent }] =
          await Promise.all([
            api.get<Processogram>(`/processograms/${params.id}`, {
              signal: controller.signal,
            }),
            api.get<string>(`/processograms/${params.id}/svg`, {
              params: { theme },
              signal: controller.signal,
              responseType: "text",
              transformResponse: [(data: string) => data],
            }),
          ]);

        setState({ status: "ready", processogram, svgContent });

        processogramService
          .getElementData(params.id!)
          .then(setElements)
          .catch(() => {});

        processogramService
          .getQuestions(params.id!)
          .then(setQuestions)
          .catch(() => {});
      } catch (err: unknown) {
        if ((err as Error).name === "CanceledError") return;
        if ((err as Error).name === "AbortError") return;
        const status = (err as { response?: { status?: number } })?.response
          ?.status;
        const message =
          status === 404
            ? "Processograma não encontrado."
            : "Erro ao carregar o processograma.";
        setState({ status: "error", message });
      }
    }

    fetchProcessogram();
    return () => controller.abort();
  }, [params.id, resolvedTheme]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <header className="relative z-20 flex h-12 shrink-0 items-center justify-between border-b border-white/5 bg-black/30 px-4 backdrop-blur-lg">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary/15 border border-primary/30">
            <Activity className="size-3.5 text-primary" />
          </div>
          <span className="text-sm font-bold tracking-wide text-foreground">
            WelfareData
          </span>
        </Link>

        <div className="flex items-center gap-3">
          {state.status === "ready" && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="hidden text-xs font-mono text-muted-foreground sm:block"
            >
              {state.processogram.name}
            </motion.span>
          )}

          {!isAuthenticated && (
            <Link
              href="/login"
              className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-mono text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
            >
              <LogIn className="size-3" />
              Login
            </Link>
          )}
        </div>
      </header>

      <div className="relative flex-1">
        <AnimatePresence mode="wait">
          {state.status === "loading" && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex size-full flex-col items-center justify-center gap-4"
            >
              <Loader2 className="size-8 animate-spin text-primary/60" />
              <span className="text-sm font-mono text-muted-foreground">
                Carregando processograma...
              </span>
            </motion.div>
          )}

          {state.status === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex size-full flex-col items-center justify-center gap-4"
            >
              <div className="flex size-14 items-center justify-center rounded-full border border-destructive/30 bg-destructive/10">
                <AlertTriangle className="size-6 text-destructive" />
              </div>
              <p className="text-sm text-muted-foreground">{state.message}</p>
              <Link
                href="/"
                className="text-xs font-mono text-primary hover:underline"
              >
                Voltar ao Dashboard
              </Link>
            </motion.div>
          )}

          {state.status === "ready" && (
            <motion.div
              key="viewer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="size-full"
            >
              <ProcessogramBreadcrumb
                breadcrumbPath={breadcrumbPath}
                activeLevelIndex={activeLevelIndex}
                onNavigate={navigateUp}
                onReset={clearSelection}
              />

              <ProcessogramInteractiveLayer
                onElementSelect={handleElementSelect}
                selectedElementId={selectedElementId}
              >
                <ProcessogramViewer
                  svgContent={state.svgContent}
                  zoomTargetId={zoomTargetId}
                />
              </ProcessogramInteractiveLayer>

              <SidePanel
                processogramId={params.id!}
                selectedElementId={selectedElementId}
                onClose={clearSelection}
                activeElementData={activeElementData}
                breadcrumbPath={breadcrumbPath}
                onBreadcrumbClick={navigateUp}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
