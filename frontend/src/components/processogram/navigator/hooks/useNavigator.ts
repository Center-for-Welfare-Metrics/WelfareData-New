/**
 * ═══════════════════════════════════════════════════════════════════════
 * SVG Navigator — Hook de Navegação Principal
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Expõe `changeLevelTo(target, toPrevious, callback?)` — a função
 * central que recebe um elemento SVG alvo e anima o `viewBox` do
 * `<svg>` raiz até enquadrá-lo perfeitamente na viewport.
 *
 * Responsabilidades:
 *   1. Calcular o viewBox destino via `getElementViewBox()`
 *   2. Salvar no histórico de navegação (refs)
 *   3. Bloquear interação durante a animação (lockInteraction)
 *   4. Animar o viewBox com GSAP (`gsap.fromTo`)
 *   5. Notificar mudanças via callback `onChange`
 *
 * ⚠ Este hook NÃO é responsável pelo isolamento visual (filter/brightness).
 *   Isso será adicionado na Etapa 4.
 *
 * Referência: GUIA_REPLICACAO_SVG_NAVIGATOR.md §10
 * ═══════════════════════════════════════════════════════════════════════
 */

"use client";

import { type RefObject, useCallback } from "react";
import { gsap } from "gsap";
import { getElementViewBox } from "../getElementViewBox";
import { getLevelNumberById } from "../extractInfoFromId";
import { ANIMATION_DURATION, ANIMATION_EASE } from "../consts";
import type { HierarchyItem, HistoryLevel } from "../types";

// ─── Props do Hook ─────────────────────────────────────────────────────

export interface UseNavigatorProps {
  /** Referência ao `<svg>` DOM injetado pelo react-inlinesvg. */
  svgElement: SVGElement | null;

  /** Histórico de navegação: nível → último ID visitado. */
  historyLevelRef: RefObject<HistoryLevel>;

  /** Flag de trava: `true` durante animações para evitar double-clicks. */
  lockInteractionRef: RefObject<boolean>;

  /** Nível numérico atual da câmera (0–3). */
  currentLevelRef: RefObject<number>;

  /** ID do elemento atualmente enquadrado. */
  currentElementIdRef: RefObject<string | null>;

  /** Tema visual atual (para uso futuro no isolamento visual). */
  currentTheme: "dark" | "light";

  /**
   * Callback de notificação: chamado a cada mudança de nível.
   * Recebe o identificador hierárquico e o caminho de breadcrumb.
   */
  onChange: (identifier: string, hierarchy: HierarchyItem[]) => void;

  /**
   * Helper que, dado um ID de elemento, retorna o identificador
   * hierárquico e o caminho de breadcrumb completo.
   */
  getElementIdentifierWithHierarchy: (
    id: string,
  ) => [string, HierarchyItem[]];

  /**
   * Restaura o brilho total nos filhos do nível atual após
   * a animação completar.
   */
  setFullBrightnessToCurrentLevel: (toPrevious: boolean) => void;
}

// ─── Return Type ───────────────────────────────────────────────────────

export interface UseNavigatorReturn {
  /**
   * Função principal de navegação.
   *
   * @param target    - Elemento SVG para onde a câmera deve ir.
   * @param toPrevious - `true` se é drill-up (voltando), `false` se drill-down.
   * @param callback  - Callback opcional executado após a animação.
   */
  changeLevelTo: (
    target: SVGElement,
    toPrevious: boolean,
    callback?: () => void,
  ) => void;
}

// ─── Hook ──────────────────────────────────────────────────────────────

export function useNavigator({
  svgElement,
  historyLevelRef,
  lockInteractionRef,
  currentLevelRef,
  currentElementIdRef,
  currentTheme: _currentTheme,
  onChange,
  getElementIdentifierWithHierarchy,
  setFullBrightnessToCurrentLevel,
}: UseNavigatorProps): UseNavigatorReturn {
  const changeLevelTo = useCallback(
    (target: SVGElement, toPrevious: boolean, callback?: () => void) => {
      if (!svgElement) return;

      // ═══════════════════════════════════════════════
      // 1. CALCULAR O VIEWBOX DESTINO
      // ═══════════════════════════════════════════════
      const viewBox = getElementViewBox(target);
      if (!viewBox) return;

      const id = target.id;
      const level = getLevelNumberById(id);

      // ═══════════════════════════════════════════════
      // 2. SALVAR NO HISTÓRICO DE NAVEGAÇÃO
      // ═══════════════════════════════════════════════
      // Permite drill-up: ao clicar no vazio, o sistema
      // consulta historyLevel[currentLevel - 1] para
      // saber para onde voltar.
      historyLevelRef.current[level] = { id };
      currentElementIdRef.current = id;
      currentLevelRef.current = level;

      // ═══════════════════════════════════════════════
      // 3. ISOLAMENTO VISUAL (ESCURECER FORA DE FOCO)
      // ═══════════════════════════════════════════════
      // TODO: Etapa 4 - Isolamento Visual
      // Aqui entrará a lógica de:
      //   - Selecionar irmãos fora de foco via querySelectorAll
      //   - gsap.to(outOfFocusElements, { filter: UNFOCUSED_FILTER[_currentTheme] })
      //   - Reverter animação anterior (outOfFocusAnimation.current.revert())
      void _currentTheme; // Usado na Etapa 4

      // ═══════════════════════════════════════════════
      // 4. NOTIFICAR MUDANÇA (breadcrumb, etc.)
      // ═══════════════════════════════════════════════
      const [identifier, hierarchy] =
        getElementIdentifierWithHierarchy(id);
      onChange(identifier, hierarchy);

      // ═══════════════════════════════════════════════
      // 5. ANIMAR O VIEWBOX (A "CÂMERA")
      // ═══════════════════════════════════════════════
      // Bloqueia interação durante a animação para
      // evitar double-clicks e race conditions.
      lockInteractionRef.current = true;

      gsap.fromTo(
        svgElement,
        // Estado inicial: bloqueia pointer events imediatamente
        { pointerEvents: "none" },
        {
          // Anima o atributo viewBox nativamente — o browser
          // recalcula toda a projeção a cada frame.
          attr: { viewBox },
          duration: ANIMATION_DURATION,
          ease: ANIMATION_EASE,
          onComplete: () => {
            // Restaura pointer events e desbloqueia interação
            gsap.set(svgElement, {
              pointerEvents: "auto",
              onComplete: () => {
                // Restaura brilho dos filhos do elemento alvo
                setFullBrightnessToCurrentLevel(toPrevious);
                lockInteractionRef.current = false;
                callback?.();
              },
            });
          },
        },
      );
    },
    [svgElement, historyLevelRef, lockInteractionRef, currentLevelRef, currentElementIdRef, _currentTheme, onChange, getElementIdentifierWithHierarchy, setFullBrightnessToCurrentLevel],
  );

  return { changeLevelTo };
}
