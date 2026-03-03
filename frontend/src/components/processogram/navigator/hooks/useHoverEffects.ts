/**
 * ═══════════════════════════════════════════════════════════════════════
 * SVG Navigator — Hook de Efeitos de Hover
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Gerencia o isolamento visual baseado na posição do cursor:
 *
 *   - Quando o mouse entra num grupo semântico (`onHover = "growing--lf1"`):
 *     → Esse grupo recebe brilho total (FOCUSED_FILTER)
 *     → Os irmãos do mesmo nível escurecem (UNFOCUSED_FILTER)
 *
 *   - Quando o mouse sai (`onHover = null`):
 *     → Restaura o estado padrão baseado no nível atual da câmera
 *     → Irmãos do nível atual → escurecidos
 *     → Elemento atual + filhos do próximo nível → brilho total
 *
 * O sistema NUNCA altera `fill`, `stroke` ou `opacity` dos elementos
 * SVG. Utiliza exclusivamente `filter: brightness()` (dark mode) ou
 * `filter: grayscale()` (light mode) via GSAP para transições suaves,
 * preservando 100% das cores originais do SVG.
 *
 * Referência: GUIA_REPLICACAO_SVG_NAVIGATOR.md §8, §11
 * ═══════════════════════════════════════════════════════════════════════
 */

"use client";

import { type RefObject, useEffect } from "react";
import { gsap } from "gsap";
import { getLevelNumberById } from "../extractInfoFromId";
import {
  ANIMATION_DURATION,
  ANIMATION_EASE,
  FOCUSED_FILTER,
  UNFOCUSED_FILTER,
  INVERSE_DICT,
} from "../consts";

// ─── Props do Hook ─────────────────────────────────────────────────────

export interface UseHoverEffectsProps {
  /** Referência ao `<svg>` DOM injetado pelo react-inlinesvg. */
  svgElement: SVGElement | null;

  /**
   * ID do elemento sob o cursor, ou `null` se o mouse não está
   * sobre nenhum grupo semântico.
   */
  onHover: string | null;

  /** Nível numérico atual da câmera (0–3). */
  currentLevelRef: RefObject<number>;

  /** ID do elemento atualmente enquadrado pela câmera. */
  currentElementIdRef: RefObject<string | null>;

  /** Tema visual atual ("dark" ou "light"). */
  currentTheme: "dark" | "light";
}

// ─── Hook ──────────────────────────────────────────────────────────────

export function useHoverEffects({
  svgElement,
  onHover,
  currentLevelRef,
  currentElementIdRef,
  currentTheme,
}: UseHoverEffectsProps): void {
  useEffect(() => {
    if (!svgElement) return;

    // Duração mais curta para hover — resposta tátil rápida
    const halfDuration = ANIMATION_DURATION / 2;

    if (!onHover) {
      // ══════════════════════════════════════════
      // MOUSE SAIU: restaura o estado padrão
      // ══════════════════════════════════════════
      // O "estado padrão" depende do nível atual da câmera:
      //   - O elemento enquadrado e os filhos do próximo nível → FOCUSED
      //   - Os irmãos do nível atual → UNFOCUSED
      const currentId = currentElementIdRef.current;
      const level = getLevelNumberById(currentId);
      const levelKey = INVERSE_DICT[level];
      const nextLevelKey = INVERSE_DICT[level + 1];

      if (levelKey) {
        // Irmãos do nível atual → escurece (volta ao estado de navegação)
        const siblings = svgElement.querySelectorAll(
          `[id*="${levelKey}" i]:not([id="${currentId}"])`,
        );
        if (siblings.length > 0) {
          gsap.to(siblings, {
            filter: UNFOCUSED_FILTER[currentTheme],
            duration: halfDuration,
            ease: ANIMATION_EASE,
          });
        }
      }

      // Elemento atual + filhos do próximo nível → brilho total
      const focusedSelector = nextLevelKey
        ? `[id="${currentId}"],[id*="${nextLevelKey}" i]`
        : `[id="${currentId}"]`;

      const focused = svgElement.querySelectorAll(focusedSelector);
      if (focused.length > 0) {
        gsap.to(focused, {
          filter: FOCUSED_FILTER[currentTheme],
          duration: halfDuration,
          ease: ANIMATION_EASE,
        });
      }

      return;
    }

    // ══════════════════════════════════════════
    // HOVER ATIVO: destaca o grupo sob o cursor
    // ══════════════════════════════════════════

    // Elemento hovered → brilho total
    const hovered = svgElement.querySelectorAll(`[id="${onHover}"]`);
    if (hovered.length > 0) {
      gsap.to(hovered, {
        filter: FOCUSED_FILTER[currentTheme],
        duration: halfDuration,
        ease: ANIMATION_EASE,
      });
    }

    // Irmãos do mesmo nível → escurecidos
    const hoverLevel = getLevelNumberById(onHover);
    const levelKey = INVERSE_DICT[hoverLevel];

    if (levelKey) {
      const notHovered = svgElement.querySelectorAll(
        `[id*="${levelKey}" i]:not([id="${onHover}"])`,
      );
      if (notHovered.length > 0) {
        gsap.to(notHovered, {
          filter: UNFOCUSED_FILTER[currentTheme],
          duration: halfDuration,
          ease: ANIMATION_EASE,
        });
      }
    }
  }, [onHover, svgElement, currentLevelRef, currentElementIdRef, currentTheme]);
}
