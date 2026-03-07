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
 *   3. Blindar eventos DOM (lock + pointerEvents + killTweensOf)
 *   4. Escurecer elementos fora de foco (outOfFocusAnimation)
 *   5. Notificar mudanças via callback `onChange`
 *   6. Animar o viewBox com GSAP (`gsap.to`)
 *
 * Referência: GUIA_REPLICACAO_SVG_NAVIGATOR.md §10
 * ═══════════════════════════════════════════════════════════════════════
 */

"use client";

import { type RefObject, useCallback, useRef } from "react";
import { gsap } from "gsap";
import { getElementViewBox } from "../getElementViewBox";
import { getLevelNumberById } from "../extractInfoFromId";
import {
  ANIMATION_DURATION,
  ANIMATION_EASE,
  UNFOCUSED_FILTER,
  INVERSE_DICT,
  MAX_LEVEL,
} from "../consts";
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

  /**
   * ViewBox original do `<svg>` — capturado no momento da injeção,
   * ANTES de qualquer animação GSAP. Usado para estabilizar getCTM()
   * durante o cálculo de BBox em drill-up.
   */
  originalViewBoxRef: RefObject<string | null>;

  /**
   * Restaura todos os elementos rasterizados antes de iniciar nova transição.
   * Garante que o DOM está limpo antes dos querySelector de outOfFocusSelector.
   * Opcional — o motor de câmara funciona sem o optimizador.
   */
  restoreAllRasterized?: () => void;

  /**
   * Agenda a rasterização dos elementos fora de foco após a transição.
   * O setTimeout(0) interno liberta o frame actual para o GSAP.
   * Opcional — o motor de câmara funciona sem o optimizador.
   */
  optimizeLevelElements?: (
    currentElement: SVGElement,
    outOfFocusElements: NodeListOf<Element>,
  ) => void;
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
  currentTheme,
  onChange,
  getElementIdentifierWithHierarchy,
  setFullBrightnessToCurrentLevel,
  originalViewBoxRef,
  restoreAllRasterized,
  optimizeLevelElements,
}: UseNavigatorProps): UseNavigatorReturn {
  /**
   * Ref para a animação de escurecimento dos irmãos fora de foco.
   * Guardamos para poder dar `.revert()` antes de uma nova transição,
   * evitando sobreposição de filtros.
   */
  const outOfFocusAnimationRef = useRef<gsap.core.Tween | null>(null);

  const changeLevelTo = useCallback(
    (target: SVGElement, toPrevious: boolean, callback?: () => void) => {
      if (!svgElement) return;

      // ═══════════════════════════════════════════════
      // 0. RESTAURAR RASTERIZAÇÕES ANTERIORES
      // ═══════════════════════════════════════════════
      // Garante DOM limpo antes dos querySelector de outOfFocusSelector.
      // Os <g> substituídos por <image> voltam a ser vectoriais para
      // que os selectores CSS os encontrem correctamente.
      restoreAllRasterized?.();

      // ═══════════════════════════════════════════════
      // 1. CALCULAR O VIEWBOX DESTINO
      // ═══════════════════════════════════════════════
      const viewBox = getElementViewBox(target, originalViewBoxRef.current);
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
      // Seleciona todos os irmãos do elemento alvo que
      // devem ficar "apagados" (fora de foco).
      //
      // No MAX_LEVEL (folha): escurece irmãos do MESMO nível.
      // Nos outros níveis:   escurece tudo que NÃO é filho
      //                      do elemento alvo.
      let outOfFocusSelector: string;

      if (level === MAX_LEVEL) {
        // Nível máximo (ci): escurece os irmãos do mesmo nível
        const levelKey = INVERSE_DICT[level];
        outOfFocusSelector = `[id*="${levelKey}" i]:not([id="${id}"])`;
      } else {
        // Outros níveis: escurece tudo com "--" que NÃO é
        // descendente do elemento alvo
        outOfFocusSelector = `[id*="--"]:not([id^="${id}"] *):not([id="${id}"])`;
      }

      const outOfFocusElements =
        svgElement.querySelectorAll(outOfFocusSelector);

      // ═══════════════════════════════════════════════
      // 3. BLINDAGEM DE EVENTOS DOM
      // ═══════════════════════════════════════════════
      // Aplicada imperativamante ANTES de qualquer tween,
      // cobrindo também o outOfFocusAnimation abaixo.
      //
      //   a) lockInteraction → o handler de mousemove de
      //      useHoverEffects aborta na primeira linha.
      //   b) pointerEvents: "none" directo no style → o
      //      browser para imediatamente de calcular CSS
      //      :hover e de propagar eventos em todo o
      //      sub-tree SVG durante a transição.
      //   c) killTweensOf → limpa tweens de hover residuais
      //      para que o GSAP foque 100% no viewBox.
      lockInteractionRef.current = true;
      svgElement.style.pointerEvents = "none";
      gsap.killTweensOf(svgElement.querySelectorAll('[id*="--"]'));

      // ═══════════════════════════════════════════════
      // 4. ISOLAMENTO VISUAL (ESCURECER FORA DE FOCO)
      // ═══════════════════════════════════════════════
      // Reverte a animação anterior para não sobrepor filtros
      if (outOfFocusAnimationRef.current) {
        outOfFocusAnimationRef.current.revert();
      }

      // Aplicação INSTANTÂNEA do filter (gsap.set — duration: 0).
      // Com 1200+ elementos, o gsap.to anterior interpolava o filter
      // frame-a-frame durante 0.7s = 1200 repaints/frame × 42 frames.
      // gsap.set aplica o valor num único batch síncrono → 1 reflow.
      // O contrato de .revert() é preservado (gsap.set retorna Tween).
      if (outOfFocusElements.length > 0) {
        outOfFocusAnimationRef.current = gsap.set(outOfFocusElements, {
          filter: UNFOCUSED_FILTER[currentTheme],
        });
      }

      // ═══════════════════════════════════════════════
      // 5. NOTIFICAR MUDANÇA (breadcrumb, etc.)
      // ═══════════════════════════════════════════════
      const [identifier, hierarchy] =
        getElementIdentifierWithHierarchy(id);
      onChange(identifier, hierarchy);

      // ═══════════════════════════════════════════════
      // 5.5. RASTERIZAÇÃO DINÂMICA (Otimização Nível 2)
      // ═══════════════════════════════════════════════
      // Agenda a conversão dos outOfFocusElements de vectorial para
      // bitmap PNG. O setTimeout(0) interno liberta o frame actual
      // para o GSAP iniciar a animação do viewBox sem interrupções.
      // O target é restaurado para 100% vectorial (nítido no zoom).
      optimizeLevelElements?.(target, outOfFocusElements);

      // ═══════════════════════════════════════════════
      // 6. ANIMAR O VIEWBOX (A "CÂMERA")
      // ═══════════════════════════════════════════════
      // pointerEvents já está "none" — o browser não
      // processa colisões de rato durante este tween.
      gsap.to(svgElement, {
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
      });
    },
    [svgElement, historyLevelRef, lockInteractionRef, currentLevelRef, currentElementIdRef, currentTheme, onChange, getElementIdentifierWithHierarchy, setFullBrightnessToCurrentLevel, originalViewBoxRef, restoreAllRasterized, optimizeLevelElements],
  );

  return { changeLevelTo };
}
