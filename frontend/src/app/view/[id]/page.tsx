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
import { ProcessogramBreadcrumb } from "@/components/processogram/ProcessogramBreadcrumb";
import { SidePanel } from "@/components/processogram/SidePanel";
import { useSvgNavigatorLogic } from "@/components/processogram/navigator";
import type { HierarchyItem } from "@/components/processogram/navigator";
import { processogramService } from "@/services/processograms";
import type {
  Processogram,
  ProcessogramElement,
  BreadcrumbItem,
  ActiveElementData,
} from "@/types/processogram";

type ViewState =
  | { status: "loading" }
  | { status: "ready"; processogram: Processogram; svgUrl: string }
  | { status: "error"; message: string };

// ─── Mapeamento HierarchyItem → BreadcrumbItem ────────────────────────
// O navigator usa `HierarchyItem`; a UI (breadcrumb, SidePanel) espera
// `BreadcrumbItem`. Este mapeamento é a ponte entre os dois sistemas.

const LEVEL_TO_ELEMENT_LEVEL: Record<string, BreadcrumbItem["levelName"]> = {
  "Production System": "production system",
  "Life Fate": "life-fate",
  Phase: "phase",
  Circumstance: "circumstance",
};

function hierarchyToBreadcrumb(
  hierarchy: HierarchyItem[],
): BreadcrumbItem[] {
  return hierarchy.map((item) => ({
    id: item.rawId,
    label: item.name,
    levelName: LEVEL_TO_ELEMENT_LEVEL[item.level] ?? "unknown",
  }));
}

export default function PublicViewPage() {
  const params = useParams<{ id: string }>();
  const { resolvedTheme } = useTheme();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [state, setState] = useState<ViewState>({ status: "loading" });
  const [elements, setElements] = useState<ProcessogramElement[]>([]);

  // ─── Estado derivado do navigator (System B) ─────────────────────────

  /** ID do elemento atualmente enquadrado pela câmera. */
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

  /** Breadcrumb path para a UI. */
  const [breadcrumbPath, setBreadcrumbPath] = useState<BreadcrumbItem[]>([]);

  /** Nível ativo (0–3, -1 = nenhum). */
  const [activeLevelIndex, setActiveLevelIndex] = useState<number>(-1);

  /** Dados do elemento ativo para o SidePanel. */
  const [activeElementData, setActiveElementData] = useState<ActiveElementData | null>(null);

  // ─── Tema ────────────────────────────────────────────────────────────

  const currentTheme: "dark" | "light" =
    resolvedTheme === "light" ? "light" : "dark";

  // ─── Callbacks do navigator ──────────────────────────────────────────

  /**
   * Chamado pelo navigator a cada mudança de nível.
   * Atualiza o estado de UI (breadcrumb, SidePanel, etc.).
   */
  const handleNavigatorChange = useCallback(
    (identifier: string, hierarchy: HierarchyItem[]) => {
      const crumbs = hierarchyToBreadcrumb(hierarchy);
      setBreadcrumbPath(crumbs);

      const lastItem = hierarchy[hierarchy.length - 1];
      if (lastItem) {
        setSelectedElementId(lastItem.rawId);
        setActiveLevelIndex(lastItem.levelNumber);

        // Monta o ActiveElementData para o SidePanel
        const elementLevel =
          LEVEL_TO_ELEMENT_LEVEL[lastItem.level] ?? "unknown";
        const matchingElement = elements.find(
          (e) => e.elementId === lastItem.rawId,
        );

        setActiveElementData({
          elementId: lastItem.rawId,
          level: elementLevel,
          label: lastItem.name,
          description: matchingElement?.description ?? "",
          parents: crumbs.slice(0, -1),
          questions: [],
        });
      }
    },
    [elements],
  );

  /**
   * Chamado pelo navigator quando o utilizador faz drill-up além do root.
   * Limpa toda a seleção e volta à visão geral.
   */
  const handleNavigatorClose = useCallback(() => {
    setSelectedElementId(null);
    setBreadcrumbPath([]);
    setActiveLevelIndex(-1);
    setActiveElementData(null);
  }, []);

  // ─── Orquestrador (System B) ─────────────────────────────────────────

  const { updateSvgElement, navigateToLevel } =
    useSvgNavigatorLogic({
      currentTheme,
      onChange: handleNavigatorChange,
      onClose: handleNavigatorClose,
    });

  // ─── Callbacks da UI ─────────────────────────────────────────────────

  const clearSelection = useCallback(() => {
    navigateToLevel(-1);
  }, [navigateToLevel]);

  const navigateUp = useCallback(
    (levelIndex: number) => {
      if (levelIndex < 0) {
        clearSelection();
        return;
      }
      navigateToLevel(levelIndex);
    },
    [clearSelection, navigateToLevel],
  );

  useEffect(() => {
    if (!params.id) return;

    const controller = new AbortController();

    async function fetchProcessogram() {
      setState({ status: "loading" });
      try {
        const theme = resolvedTheme === "light" ? "light" : "dark";

        const { data: processogram } = await api.get<Processogram>(
          `/processograms/${params.id}`,
          { signal: controller.signal },
        );

        // Monta a URL que o react-inlinesvg usará para fazer fetch
        const svgUrl = `/api/v1/processograms/${params.id}/svg?theme=${theme}`;

        setState({ status: "ready", processogram, svgUrl });

        processogramService
          .getElementData(params.id!)
          .then(setElements)
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

      <div className="relative flex-1 overflow-hidden">
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

              <ProcessogramViewer
                svgUrl={state.svgUrl}
                onSvgReady={updateSvgElement}
              />

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
