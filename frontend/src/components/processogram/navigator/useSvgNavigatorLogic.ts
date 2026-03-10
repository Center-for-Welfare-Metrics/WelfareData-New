/**
 * ═══════════════════════════════════════════════════════════════════════
 * SVG Navigator — Orquestrador Central
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Compõe os 3 hooks internos (useNavigator, useClickHandler,
 * useHoverEffects) num único hook de fachada que o componente
 * ProcessogramViewer consome.
 *
 * Responsabilidades:
 *   1. Criar e gerenciar todos os refs mutáveis (history, level, lock, id)
 *   2. Instanciar os 3 hooks na ordem correta de dependência
 *   3. Registrar o click listener global no `window`
 *   4. Expor updateSvgElement para receber a ref do SVG do react-inlinesvg
 *   5. Expor navigateToLevel para navegação programática (breadcrumb / Home)
 *
 * Após a Otimização Nível 1 (Event Delegation), os handlers de mouse
 * (onMouseMove / onMouseLeave) foram eliminados. O `useHoverEffects`
 * regista os seus próprios listeners DOM directamente no `svgElement`;
 * o React nunca é notificado do movimento do rato.
 *
 * O consumidor (ProcessogramViewer) não precisa conhecer os hooks
 * internos — apenas chama:
 *   - updateSvgElement(svgEl)  → após react-inlinesvg injetar o <svg>
 *
 * Referência: GUIA_REPLICACAO_SVG_NAVIGATOR.md §9 (Passo 9)
 * ═══════════════════════════════════════════════════════════════════════
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { gsap } from "gsap";

import { useNavigator } from "./hooks/useNavigator";
import { useClickHandler } from "./hooks/useClickHandler";
import { useHoverEffects } from "./hooks/useHoverEffects";
import { useOptimizeSvgParts } from "./hooks/useOptimizeSvgParts";
import { usePrefetchRaster } from "./hooks/usePrefetchRaster";
import { getHierarchy, getElementIdentifier } from "./hierarchy";
import type { RasterImage } from "@/types/processogram";
import {
  FOCUSED_OPACITY,
  UNFOCUSED_OPACITY,
  ANIMATION_DURATION,
  ANIMATION_EASE,
  INVERSE_DICT,
} from "./consts";
import type { HierarchyItem, HistoryLevel } from "./types";

// ─── Props do Orquestrador ─────────────────────────────────────────────

export interface UseSvgNavigatorLogicProps {
  /** Tema visual atual — propagado para isolamento visual. */
  currentTheme: "dark" | "light";

  /**
   * Callback de notificação a cada mudança de nível.
   * O page.tsx usa para atualizar breadcrumb, SidePanel, etc.
   *
   * @param identifier - Path hierárquico pontilhado (ex: "broiler.growing.feeding")
   * @param hierarchy  - Array de HierarchyItem para o breadcrumb
   */
  onChange: (identifier: string, hierarchy: HierarchyItem[]) => void;

  /**
   * Callback para quando o utilizador faz drill-up além do root.
   * Equivalente a "fechar" o processograma / voltar à visão geral.
   */
  onClose: () => void;

  /**
   * Metadados de rasterização vindos da API para o tema actual.
   * Key = elementId (ex: "gestation--ph"), valor = {src, x, y, width, height}.
   * Alimenta o motor de Swap O(1) (LOD via PNG Swap).
   */
  rasterImages: Record<string, RasterImage> | undefined;
}

// ─── Return Type ───────────────────────────────────────────────────────

export interface UseSvgNavigatorLogicReturn {
  /**
   * Registra o <svg> DOM real no orquestrador.
   * Deve ser chamado pelo callback `onSvgReady` do ProcessogramViewer.
   */
  updateSvgElement: (svgEl: SVGSVGElement) => void;

  /**
   * Navegação programática para um nível específico do histórico.
   * Usado pelo breadcrumb e pelo botão Home.
   *
   * @param levelIndex - Índice do nível destino (0–3).
   *                     Se < 0, faz reset total (volta à visão geral).
   */
  navigateToLevel: (levelIndex: number) => void;
}

// ─── Hook ──────────────────────────────────────────────────────────────

export function useSvgNavigatorLogic({
  currentTheme,
  onChange,
  onClose,
  rasterImages,
}: UseSvgNavigatorLogicProps): UseSvgNavigatorLogicReturn {
  // ═══════════════════════════════════════════════════
  // 1. ESTADO LOCAL
  // ═══════════════════════════════════════════════════

  /** Referência ao <svg> DOM injetado pelo react-inlinesvg. */
  const [svgElement, setSvgElement] = useState<SVGElement | null>(null);

  // ═══════════════════════════════════════════════════
  // 2. REFS MUTÁVEIS (React Compiler: sufixo Ref)
  // ═══════════════════════════════════════════════════

  /** Histórico de navegação: nível → último ID visitado. */
  const historyLevelRef = useRef<HistoryLevel>({});

  /** Nível numérico atual da câmera (0–3). 0 = root visível. */
  const currentLevelRef = useRef<number>(0);

  /** ID do elemento atualmente enquadrado pela câmera. */
  const currentElementIdRef = useRef<string | null>(null);

  /** Flag de trava: true durante animações para evitar double-clicks. */
  const lockInteractionRef = useRef<boolean>(false);

  /** ViewBox original do SVG (capturado uma vez no carregamento).
   *  Usado para estabilizar o cálculo de BBox via getCTM() —
   *  sem isso, o getCTM() reflete o viewBox animado pelo GSAP,
   *  distorcendo as coordenadas durante drill-up. */
  const originalViewBoxRef = useRef<string | null>(null);

  // ═══════════════════════════════════════════════════
  // 3. HELPERS PARA useNavigator
  // ═══════════════════════════════════════════════════

  /**
   * Dado um ID de elemento, retorna o identificador hierárquico
   * pontilhado e o caminho completo de breadcrumb.
   *
   * Precisa do elemento DOM real (para subir com closest()),
   * por isso usa o svgElement para querySelector.
   */
  const getElementIdentifierWithHierarchy = useCallback(
    (id: string): [string, HierarchyItem[]] => {
      if (!svgElement) return [id, []];

      const element = svgElement.querySelector<SVGElement>(
        `#${CSS.escape(id)}`,
      );
      if (!element) return [id, []];

      const { hierarchy, hierarchyPath } = getHierarchy(element);
      const identifier = getElementIdentifier(id, hierarchy);

      return [identifier, hierarchyPath];
    },
    [svgElement],
  );

  /**
   * Restaura a opacidade total (FOCUSED_OPACITY) em todos os filhos
   * do nível atual + o próprio elemento enquadrado.
   *
   * Chamado após a animação de changeLevelTo completar, para que
   * os sub-grupos do próximo nível fiquem visíveis e clicáveis.
   */
  const setFullBrightnessToCurrentLevel = useCallback(
    (toPrevious: boolean) => {
      if (!svgElement) return;

      const currentId = currentElementIdRef.current;
      const level = currentLevelRef.current;
      const nextLevelKey = INVERSE_DICT[level + 1];

      // Drill-up usa duração completa para transição suave;
      // drill-down usa metade para resposta tátil rápida.
      const duration = toPrevious
        ? ANIMATION_DURATION
        : ANIMATION_DURATION / 2;

      // O próprio elemento enquadrado
      if (currentId) {
        const self = svgElement.querySelector<SVGElement>(
          `#${CSS.escape(currentId)}`,
        );
        if (self) {
          gsap.to(self, {
            opacity: FOCUSED_OPACITY[currentTheme],
            duration,
            ease: ANIMATION_EASE,
          });
        }
      }

      // Filhos do próximo nível (sub-grupos disponíveis para drill-down)
      if (nextLevelKey) {
        const children = svgElement.querySelectorAll(
          `[id*="${nextLevelKey}" i]`,
        );
        if (children.length > 0) {
          gsap.to(children, {
            opacity: FOCUSED_OPACITY[currentTheme],
            duration,
            ease: ANIMATION_EASE,
          });
        }
      }
    },
    [svgElement, currentTheme],
  );

  // ═══════════════════════════════════════════════════
  // 4. COMPOSIÇÃO DOS HOOKS INTERNOS
  // ═══════════════════════════════════════════════════

  // 4a. Prefetch de raster (LOD via PNG Swap — Etapa 1+2)
  //     Faz o download silencioso das imagens PNG para a RAM do browser.
  //     Deve ser instanciado ANTES de useOptimizeSvgParts para que
  //     o imageCache esteja disponível como sinal de readiness.
  const { imageCache } = usePrefetchRaster(rasterImages);

  // 4b. Motor de Swap O(1) (LOD via PNG Swap — Etapa 3)
  //     Deve ser instanciado ANTES de useNavigator para que
  //     optimizeLevelElements e restoreAllRasterized possam
  //     ser injectados no motor de câmara (4c).
  const { optimizeLevelElements, restoreAllRasterized } = useOptimizeSvgParts({
    svgElement,
    rasterImages,
    imageCache,
  });

  // 4c. Motor de câmera (viewBox + isolamento visual)
  const { changeLevelTo } = useNavigator({
    svgElement,
    historyLevelRef,
    lockInteractionRef,
    currentLevelRef,
    currentElementIdRef,
    currentTheme,
    onChange,
    getElementIdentifierWithHierarchy,
    setFullBrightnessToCurrentLevel,
    originalViewBoxRef,
    optimizeLevelElements,
    restoreAllRasterized,
  });

  // 4d. Interceptação de cliques (drill-down / drill-up / close)
  const { handleClick } = useClickHandler({
    svgElement,
    changeLevelTo,
    onClose,
    lockInteractionRef,
    currentLevelRef,
    currentElementIdRef,
    historyLevelRef,
  });

  // 4e. Efeitos visuais de hover (Event Delegation nativa — zero re-renders)
  //     Os listeners de mousemove/mouseleave são registados directamente no
  //     svgElement; o React não é envolvido no ciclo de hover.
  useHoverEffects({
    svgElement,
    lockInteraction: lockInteractionRef,
    currentLevelRef,
    currentElementIdRef,
    currentTheme,
  });

  // ═══════════════════════════════════════════════════
  // 5. CLICK LISTENER GLOBAL (window)
  // ═══════════════════════════════════════════════════
  //
  // O listener é registrado no `window` (não no SVG) porque
  // eventos de clique em <text>, <path> e <tspan> dentro do SVG
  // não propagam de forma confiável para o <svg>.

  useEffect(() => {
    if (!svgElement) return;

    window.addEventListener("click", handleClick);
    return () => {
      window.removeEventListener("click", handleClick);
    };
  }, [svgElement, handleClick]);

  // ═══════════════════════════════════════════════════
  // 6. HANDLERS DE MOUSE PARA O SVG
  // ═══════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════
  // 7. REGISTRAR O SVG ELEMENT
  // ═══════════════════════════════════════════════════

  /**
   * Callback para o ProcessogramViewer chamar quando o
   * react-inlinesvg terminar de injetar o <svg> no DOM.
   */
  const updateSvgElement = useCallback((svgEl: SVGSVGElement) => {
    // Captura o viewBox original ANTES de qualquer animação GSAP.
    // Este valor é imutável e usado como referência estável para
    // o cálculo de BBox (getCTM) em getElementViewBox.
    originalViewBoxRef.current = svgEl.getAttribute("viewBox");
    setSvgElement(svgEl);
  }, []);

  // ═══════════════════════════════════════════════════
  // 8. NAVEGAÇÃO PROGRAMÁTICA (BREADCRUMB / HOME)
  // ═══════════════════════════════════════════════════

  /**
   * Navega programaticamente para um nível específico do histórico.
   *
   * - levelIndex < 0  → Reset total: anima o viewBox ao original,
   *                      limpa refs e chama onClose().
   * - levelIndex === 0 → Volta ao root do SVG (nível Production System).
   * - levelIndex >= 1  → Consulta o histórico e navega ao elemento guardado.
   * - levelIndex === currentLevel → Ignora (já está nesse nível).
   */
  const navigateToLevel = useCallback(
    (levelIndex: number) => {
      if (!svgElement) return;
      if (lockInteractionRef.current) return;

      // Já está nesse nível — nada a fazer
      if (levelIndex === currentLevelRef.current && levelIndex >= 0) return;

      // ── RESET TOTAL (Home / fechar) ──
      if (levelIndex < 0) {
        // Restaura elementos rasterizados antes de qualquer animação:
        // os <g> voltam a ser vectoriais para que os tweens GSAP os
        // encontrem correctamente.
        restoreAllRasterized();

        // Blindagem de eventos DOM — mesma lógica de changeLevelTo:
        // lock + pointerEvents imperativo + kill de tweens residuais.
        lockInteractionRef.current = true;
        svgElement.style.pointerEvents = "none";
        gsap.killTweensOf(svgElement.querySelectorAll('[id*="--"]'));

        // Reverte toda a opacidade visual (restaura visibilidade)
        const allFiltered = svgElement.querySelectorAll('[id*="--"]');
        if (allFiltered.length > 0) {
          gsap.to(allFiltered, {
            opacity: FOCUSED_OPACITY[currentTheme],
            duration: ANIMATION_DURATION,
            ease: ANIMATION_EASE,
          });
        }

        // Anima o viewBox de volta ao original
        const originalVB = originalViewBoxRef.current;
        if (originalVB) {
          gsap.to(svgElement, {
            attr: { viewBox: originalVB },
            duration: ANIMATION_DURATION,
            ease: ANIMATION_EASE,
            onComplete: () => {
              gsap.set(svgElement, {
                pointerEvents: "auto",
                onComplete: () => {
                  // Limpa todas as refs internas
                  historyLevelRef.current = {};
                  currentLevelRef.current = 0;
                  currentElementIdRef.current = null;
                  lockInteractionRef.current = false;

                  // Notifica o page.tsx para limpar estado React
                  onClose();
                },
              });
            },
          });
        } else {
          // Sem viewBox original — limpa direto
          historyLevelRef.current = {};
          currentLevelRef.current = 0;
          currentElementIdRef.current = null;
          lockInteractionRef.current = false;
          onClose();
        }
        return;
      }

      // ── NAVEGAR A UM NÍVEL ESPECÍFICO DO HISTÓRICO ──
      const historyEntry = historyLevelRef.current[levelIndex];

      if (!historyEntry) {
        // Sem histórico para esse nível — fallback ao root
        changeLevelTo(svgElement as SVGElement, true);
        return;
      }

      const element = svgElement.querySelector<SVGElement>(
        `#${CSS.escape(historyEntry.id)}`,
      );

      if (!element) {
        console.warn(
          `[navigateToLevel] Elemento "${historyEntry.id}" não encontrado no DOM. Fallback ao root.`,
        );
        changeLevelTo(svgElement as SVGElement, true);
        return;
      }

      // Limpa entradas do histórico para níveis mais profundos que o destino,
      // para que um futuro drill-down não herde estado stale.
      const historyKeys = Object.keys(historyLevelRef.current).map(Number);
      for (const key of historyKeys) {
        if (key > levelIndex) {
          delete historyLevelRef.current[key];
        }
      }

      changeLevelTo(element, true);
    },
    [svgElement, changeLevelTo, currentTheme, onClose, restoreAllRasterized],
  );

  // ═══════════════════════════════════════════════════
  // RETURN
  // ═══════════════════════════════════════════════════

  return {
    updateSvgElement,
    navigateToLevel,
  };
}
