/**
 * ═══════════════════════════════════════════════════════════════════════
 * SVG Navigator — Hook de Interceptação de Cliques
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Intercepta cliques GLOBAIS (no window, não no SVG) e decide entre:
 *   - DRILL-DOWN: clicou em um grupo semântico → navega para dentro
 *   - DRILL-UP:   clicou no "vazio" → volta ao nível anterior
 *   - CLOSE:      já está no root e clicou no vazio → fecha
 *
 * O listener é global (window) porque eventos de clique em `<text>`,
 * `<path>` e `<tspan>` dentro do SVG não propagam de forma confiável
 * para o `<svg>`. Usando `target.closest()`, subimos na árvore DOM
 * a partir de QUALQUER elemento clicado até encontrar o `<g>` semântico.
 *
 * Referência: GUIA_REPLICACAO_SVG_NAVIGATOR.md §9
 * ═══════════════════════════════════════════════════════════════════════
 */

"use client";

import { type RefObject, useCallback } from "react";
import { INVERSE_DICT } from "../consts";
import type { HistoryLevel } from "../types";

// ─── Props do Hook ─────────────────────────────────────────────────────

export interface UseClickHandlerProps {
  /** Referência ao `<svg>` DOM injetado pelo react-inlinesvg. */
  svgElement: SVGElement | null;

  /** Função de navegação principal (de `useNavigator`). */
  changeLevelTo: (
    element: SVGElement,
    toPrevious: boolean,
    callback?: () => void,
  ) => void;

  /** Setter do hover (limpa ao clicar). */
  setOnHover: (id: string | null) => void;

  /** Callback para fechar o processograma (drill-up além do root). */
  onClose: () => void;

  /** Flag de trava: bloqueia cliques durante animações. */
  lockInteractionRef: RefObject<boolean>;

  /** Nível numérico atual da câmera (0–3). */
  currentLevelRef: RefObject<number>;

  /** ID do elemento atualmente enquadrado pela câmera. */
  currentElementIdRef: RefObject<string | null>;

  /** Histórico de navegação para drill-up. */
  historyLevelRef: RefObject<HistoryLevel>;
}

// ─── Return Type ───────────────────────────────────────────────────────

export interface UseClickHandlerReturn {
  /**
   * Handler global de clique — deve ser registrado no `window`.
   * Não registrar diretamente no SVG.
   */
  handleClick: (event: MouseEvent) => void;

  /**
   * Dado um target de evento, resolve o `<g>` semântico mais próximo.
   * Tenta primeiro o próximo nível (drill-down), fallback para o atual.
   */
  getClickedStage: (target: SVGElement, level: number) => SVGElement | null;
}

// ─── Hook ──────────────────────────────────────────────────────────────

export function useClickHandler({
  svgElement,
  changeLevelTo,
  setOnHover,
  onClose,
  lockInteractionRef,
  currentLevelRef,
  currentElementIdRef,
  historyLevelRef,
}: UseClickHandlerProps): UseClickHandlerReturn {
  /**
   * Dado o `event.target` (que pode ser um `<path>`, `<text>`, etc.),
   * sobe na árvore DOM até encontrar o grupo `<g>` com ID semântico.
   *
   * **Prioridade:** próximo nível > nível atual.
   * Isso permite que ao clicar DENTRO de um grupo do nível atual,
   * ele encontre o sub-grupo do próximo nível (drill-down).
   *
   * @example
   * ```
   * // Se currentLevel = 0 (ps), tenta achar --lf primeiro, depois --ps
   * getClickedStage(pathElement, 0)
   * // → <g id="growing--lf1"> (drill-down para Life Fate)
   * ```
   */
  const getClickedStage = useCallback(
    (target: SVGElement, level: number): SVGElement | null => {
      const nextLevelSuffix = INVERSE_DICT[level + 1];

      // Apenas tenta o PRÓXIMO nível (drill-down legítimo).
      // NÃO faz fallback para o nível atual — caso contrário,
      // irmãos escurecidos do mesmo nível seriam capturados
      // pelo closest(), impedindo o drill-up de ser atingido.
      if (!nextLevelSuffix) return null;

      return target.closest<SVGElement>(
        `[id*="${nextLevelSuffix}" i]`,
      );
    },
    [],
  );

  /**
   * Handler de clique GLOBAL.
   *
   * Fluxo:
   * ```
   * Clique → lockInteraction? → ignora
   *        → stopPropagation()
   *        → closest() → achou? → DRILL-DOWN (changeLevelTo(alvo, false))
   *                     → não?  → currentLevel > 1? → DRILL-UP (historyLevel[prev])
   *                              → currentLevel = 1? → volta ao root (svgElement)
   *                              → currentLevel = 0? → onClose()
   * ```
   */
  const handleClick = useCallback(
    (event: MouseEvent) => {
      if (!svgElement) return;

      // ── LOCK: animação em curso → ignora ──
      if (lockInteractionRef.current) return;

      // ── GUARD: clique fora do SVG → ignora silenciosamente ──
      const target = event.target as SVGElement;
      if (!svgElement.contains(target)) return;

      // ── Impede propagação para outros listeners ──
      event.stopPropagation();

      // ── Limpa hover ao clicar ──
      setOnHover(null);

      const clickedStage = getClickedStage(target, currentLevelRef.current);

      // Se clicou num elemento válido E não é o elemento já focado (evita trap)
      if (clickedStage && clickedStage.id !== currentElementIdRef.current) {
        // ══════════════════════════
        // DRILL-DOWN
        // ══════════════════════════
        // Achou um grupo semântico diferente → navega para dentro dele
        changeLevelTo(clickedStage, false);
        return;
      }

      // ══════════════════════════
      // DRILL-UP
      // ══════════════════════════
      // Não achou grupo → clicou no "vazio" → volta um nível
      const prevLevel = currentLevelRef.current - 1;

      if (prevLevel < 1) {
        if (prevLevel < 0) {
          // Já está no root (nível 0) e clicou no vazio → fecha
          onClose();
          return;
        }
        // Nível 1 → volta ao SVG root (nível 0)
        changeLevelTo(svgElement as SVGElement, true);
        return;
      }

      // Busca o elemento do nível anterior no histórico
      const prevData = historyLevelRef.current[prevLevel];
      if (!prevData) {
        console.warn("Histórico de navegação perdido. Fazendo fallback para o Root.");
        changeLevelTo(svgElement as SVGElement, true);
        return;
      }

      const element = svgElement.querySelector<SVGElement>(
        `#${CSS.escape(prevData.id)}`,
      );
      if (!element) {
        console.warn("Elemento pai não encontrado no DOM. Fazendo fallback para o Root.");
        changeLevelTo(svgElement as SVGElement, true);
        return;
      }

      changeLevelTo(element, true);
    },
    [
      svgElement,
      changeLevelTo,
      getClickedStage,
      setOnHover,
      onClose,
      lockInteractionRef,
      currentLevelRef,
      currentElementIdRef,
      historyLevelRef,
    ],
  );

  return { handleClick, getClickedStage };
}
