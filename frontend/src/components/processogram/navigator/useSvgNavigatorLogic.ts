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
 *   2. Criar e gerenciar o estado de hover (onHover)
 *   3. Instanciar os 3 hooks na ordem correta de dependência
 *   4. Registrar o click listener global no `window`
 *   5. Expor onMouseMove / onMouseLeave para o componente de SVG
 *   6. Expor updateSvgElement para receber a ref do SVG do react-inlinesvg
 *
 * O consumidor (ProcessogramViewer) não precisa conhecer os hooks
 * internos — apenas chama:
 *   - updateSvgElement(svgEl)     → após react-inlinesvg injetar o <svg>
 *   - onMouseMove={onMouseMove}   → no wrapper do SVG
 *   - onMouseLeave={onMouseLeave} → no wrapper do SVG
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
import { getHierarchy, getElementIdentifier } from "./hierarchy";
import {
  FOCUSED_FILTER,
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
}

// ─── Return Type ───────────────────────────────────────────────────────

export interface UseSvgNavigatorLogicReturn {
  /**
   * Registra o <svg> DOM real no orquestrador.
   * Deve ser chamado pelo callback `onSvgReady` do ProcessogramViewer.
   */
  updateSvgElement: (svgEl: SVGSVGElement) => void;

  /**
   * Handler de mouse move — deve ser passado ao wrapper do SVG.
   * Detecta o grupo semântico sob o cursor e ativa o hover visual.
   */
  onMouseMove: (e: React.MouseEvent) => void;

  /**
   * Handler de mouse leave — deve ser passado ao wrapper do SVG.
   * Limpa o hover visual quando o cursor sai do SVG.
   */
  onMouseLeave: () => void;
}

// ─── Hook ──────────────────────────────────────────────────────────────

export function useSvgNavigatorLogic({
  currentTheme,
  onChange,
  onClose,
}: UseSvgNavigatorLogicProps): UseSvgNavigatorLogicReturn {
  // ═══════════════════════════════════════════════════
  // 1. ESTADO LOCAL
  // ═══════════════════════════════════════════════════

  /** Referência ao <svg> DOM injetado pelo react-inlinesvg. */
  const [svgElement, setSvgElement] = useState<SVGElement | null>(null);

  /** ID do elemento sob o cursor (para efeitos de hover). */
  const [onHover, setOnHover] = useState<string | null>(null);

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
   * Restaura o brilho total (FOCUSED_FILTER) em todos os filhos
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
            filter: FOCUSED_FILTER[currentTheme],
            duration,
            ease: ANIMATION_EASE,
          });
        }
      }

      // Filhos do próximo nível (sub-grupos disponíveis para drill-down)
      if (nextLevelKey) {
        const children = svgElement.querySelectorAll(
          `[id*="${nextLevelKey}"]`,
        );
        if (children.length > 0) {
          gsap.to(children, {
            filter: FOCUSED_FILTER[currentTheme],
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

  // 4a. Motor de câmera (viewBox + isolamento visual)
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
  });

  // 4b. Interceptação de cliques (drill-down / drill-up / close)
  const { handleClick } = useClickHandler({
    svgElement,
    changeLevelTo,
    setOnHover,
    onClose,
    lockInteractionRef,
    currentLevelRef,
    historyLevelRef,
  });

  // 4c. Efeitos visuais de hover (focus/mute por brightness/grayscale)
  useHoverEffects({
    svgElement,
    onHover,
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

  /**
   * Mouse move no wrapper do SVG:
   * - Detecta o grupo semântico sob o cursor no PRÓXIMO nível
   *   (para pré-visualizar o drill-down)
   * - Se o cursor não está sobre nenhum grupo, limpa o hover
   */
  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!svgElement) return;
      if (lockInteractionRef.current) return;

      const target = e.target as SVGElement;
      const nextLevelKey = INVERSE_DICT[currentLevelRef.current + 1];

      if (!nextLevelKey) {
        // Nível máximo — não há sub-grupos para hover
        setOnHover(null);
        return;
      }

      // Sobe na árvore DOM até achar o grupo do próximo nível
      const hovered = target.closest<SVGElement>(
        `[id*="${nextLevelKey}"]`,
      );

      if (hovered) {
        setOnHover(hovered.id);
      } else {
        setOnHover(null);
      }
    },
    [svgElement],
  );

  /**
   * Mouse leave do wrapper do SVG: limpa hover.
   */
  const onMouseLeave = useCallback(() => {
    setOnHover(null);
  }, []);

  // ═══════════════════════════════════════════════════
  // 7. REGISTRAR O SVG ELEMENT
  // ═══════════════════════════════════════════════════

  /**
   * Callback para o ProcessogramViewer chamar quando o
   * react-inlinesvg terminar de injetar o <svg> no DOM.
   */
  const updateSvgElement = useCallback((svgEl: SVGSVGElement) => {
    setSvgElement(svgEl);
  }, []);

  // ═══════════════════════════════════════════════════
  // RETURN
  // ═══════════════════════════════════════════════════

  return {
    updateSvgElement,
    onMouseMove,
    onMouseLeave,
  };
}
