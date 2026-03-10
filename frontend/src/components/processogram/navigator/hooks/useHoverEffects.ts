/**
 * ═══════════════════════════════════════════════════════════════════════
 * SVG Navigator — Hook de Efeitos de Hover (Nível 1 de Otimização)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Motor de hover de zero re-renders: usa Event Delegation nativa no
 * `svgElement` para mover toda a lógica de hover completamente fora
 * do ciclo de reconciliação do React. O React nunca sabe que o rato
 * se moveu — apenas o GSAP e o DOM interagem.
 *
 * ARQUITETURA (Event Delegation pura):
 *   Um único `mousemove` e um único `mouseleave` são registados
 *   directamente no `<svg>`. `hoveredElementId` (useRef) rastreia
 *   o grupo activo sem nenhum `useState`.
 *
 *   ┌─ mousemove ──────────────────────────────────────────────────────┐
 *   │  1. lockInteraction? → return  (câmara em animação)             │
 *   │  2. Resolve nextLevelKey via INVERSE_DICT[currentLevel + 1]     │
 *   │  3. closest(nextLevelKey) → grupo válido?                       │
 *   │       não → clearHover() e return                               │
 *   │       sim → mesmo ID que hoveredElementId? → return (sem spam)  │
 *   │            → novo ID → actualiza ref + GSAP brilho + unfocused  │
 *   └──────────────────────────────────────────────────────────────────┘
 *   ┌─ mouseleave ─────────────────────────────────────────────────────┐
 *   │  clearHover(): restaura estado de navegação baseado no nível    │
 *   │  actual da câmara (irmãos escuros, elemento focado com brilho)  │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * Ganho de performance:
 *   Antes: pixel → setOnHover → re-render React → useEffect → GSAP (~60 renders/s)
 *   Agora: pixel → handler DOM nativo → GSAP  (0 re-renders)
 *
 * O sistema NUNCA altera `fill`, `stroke` ou `filter`. Utiliza
 * exclusivamente `opacity` via GSAP para isolamento visual —
 * propriedade de composição pura na GPU, sem re-rasterização.
 *
 * Referência: GUIA_REPLICACAO_SVG_NAVIGATOR.md §8, §11
 * ═══════════════════════════════════════════════════════════════════════
 */

"use client";

import { type RefObject, useEffect, useRef } from "react";
import { gsap } from "gsap";
import { getLevelNumberById, isInteractiveNavigableId } from "../extractInfoFromId";
import {
  ANIMATION_DURATION,
  ANIMATION_EASE,
  FOCUSED_OPACITY,
  UNFOCUSED_OPACITY,
  INVERSE_DICT,
} from "../consts";

// ─── Props do Hook ─────────────────────────────────────────────────────

export interface UseHoverEffectsProps {
  /** Referência ao `<svg>` DOM injetado pelo react-inlinesvg. */
  svgElement: SVGElement | null;

  /**
   * Flag de trava partilhada com o motor de câmara (`useNavigator`).
   * Quando `true`, o handler de `mousemove` aborta imediatamente para
   * não sobrepor filtros de hover durante uma animação de viewBox.
   */
  lockInteraction: RefObject<boolean>;

  /** Nível numérico actual da câmara (0–3). */
  currentLevelRef: RefObject<number>;

  /** ID do elemento actualmente enquadrado pela câmara. */
  currentElementIdRef: RefObject<string | null>;

  /** Tema visual actual ("dark" ou "light"). */
  currentTheme: "dark" | "light";

  /**
   * Ref exposta para que o motor de câmara possa limpar o hover
   * antes de iniciar uma transição de nível (changeLevelTo).
   */
  clearHoverRef?: RefObject<(() => void) | null>;
}

// ─── Hook ──────────────────────────────────────────────────────────────

export function useHoverEffects({
  svgElement,
  lockInteraction,
  currentLevelRef,
  currentElementIdRef,
  currentTheme,
  clearHoverRef,
}: UseHoverEffectsProps): void {
  /**
   * Rastreia o ID do grupo actualmente sob o cursor.
   * Ref mutável — jamais provoca re-renders ao mudar.
   */
  const hoveredElementId = useRef<string | null>(null);

  /**
   * Mantém o tema acessível dentro dos handlers DOM nativos,
   * sem necessidade de re-registar os listeners a cada troca de tema.
   */
  const themeRef = useRef(currentTheme);
  useEffect(() => {
    themeRef.current = currentTheme;
  }, [currentTheme]);

  useEffect(() => {
    if (!svgElement) return;

    // Captura o elemento no momento do registo — garantidamente não-nulo
    const svg = svgElement;
    const halfDuration = ANIMATION_DURATION / 2;

    /**
     * Restaura o estado visual de navegação (sem hover activo):
     *   - Irmãos do nível actual → UNFOCUSED
     *   - Elemento enquadrado + filhos do próximo nível → FOCUSED
     *
     * Guard: aborta silenciosamente se já não havia hover activo.
     */
    function clearHover(): void {
      if (hoveredElementId.current === null) return;

      // Restaura opacity do elemento que estava em hover imediatamente
      const prevHoveredId = hoveredElementId.current;
      hoveredElementId.current = null;

      const currentId = currentElementIdRef.current;
      const level = getLevelNumberById(currentId);
      const levelKey = INVERSE_DICT[level];
      const nextLevelKey = INVERSE_DICT[level + 1];
      const theme = themeRef.current;

      const prevHovered = svg.querySelector(`[id="${prevHoveredId}"]`);
      if (prevHovered) {
        gsap.set(prevHovered, { opacity: UNFOCUSED_OPACITY[theme] });
      }

      if (levelKey) {
        const siblings = Array.from(
          svg.querySelectorAll(
            `[id*="${levelKey}" i]:not([id="${currentId}"])`,
          ),
        ).filter((el) => isInteractiveNavigableId(el.id));
        if (siblings.length > 0) {
          gsap.to(siblings, {
            opacity: UNFOCUSED_OPACITY[theme],
            duration: halfDuration,
            ease: ANIMATION_EASE,
          });
        }
      }

      // Elemento enquadrado + filhos do próximo nível → opacidade total
      const focusedSelector = nextLevelKey
        ? `[id="${currentId}"],[id*="${nextLevelKey}" i]`
        : `[id="${currentId}"]`;
      const focused = svg.querySelectorAll(focusedSelector);
      if (focused.length > 0) {
        gsap.to(focused, {
          opacity: FOCUSED_OPACITY[theme],
          duration: halfDuration,
          ease: ANIMATION_EASE,
        });
      }
    }

    // Expõe clearHover para o motor de câmara via ref
    if (clearHoverRef) clearHoverRef.current = clearHover;

    function handleMouseMove(e: MouseEvent): void {
      // ── LOCK: câmara em animação → aborta imediatamente ──
      if (lockInteraction.current) return;

      // Resolve o sufixo do próximo nível navegável
      const nextLevelKey = INVERSE_DICT[currentLevelRef.current + 1];
      if (!nextLevelKey) return; // Nível folha — sem sub-grupos para hover

      const target = e.target as Element;
      const group = target.closest<SVGElement>(`[id*="${nextLevelKey}" i]`);

      if (!group) {
        // Cursor fora de qualquer grupo válido → limpa hover
        clearHover();
        return;
      }

      // Guard: não aplicar hover no elemento já focado
      if (group.id === currentElementIdRef.current) return;

      // Mesmo grupo — evita spam de animações GSAP no mesmo pixel
      if (group.id === hoveredElementId.current) return;

      // ── NOVO GRUPO: actualiza rastreador e aplica efeitos visuais ──
      hoveredElementId.current = group.id;
      const theme = themeRef.current;

      // Grupo hovered → opacidade total
      gsap.to(group, {
        opacity: FOCUSED_OPACITY[theme],
        duration: halfDuration,
        ease: ANIMATION_EASE,
      });

      // Irmãos do mesmo nível → reduzidos (excluindo canvas wrappers)
      const notHovered = Array.from(
        svg.querySelectorAll(
          `[id*="${nextLevelKey}" i]:not([id="${group.id}"])`,
        ),
      ).filter((el) => isInteractiveNavigableId(el.id));
      if (notHovered.length > 0) {
        gsap.to(notHovered, {
          opacity: UNFOCUSED_OPACITY[theme],
          duration: halfDuration,
          ease: ANIMATION_EASE,
        });
      }
    }

    function handleMouseLeave(): void {
      clearHover();
    }

    svg.addEventListener("mousemove", handleMouseMove);
    svg.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      svg.removeEventListener("mousemove", handleMouseMove);
      svg.removeEventListener("mouseleave", handleMouseLeave);
      if (clearHoverRef) clearHoverRef.current = null;
    };
  }, [svgElement]); // eslint-disable-line react-hooks/exhaustive-deps
  // ↑ Regista os listeners apenas quando o SVG muda.
  //   lockInteraction, currentLevelRef, currentElementIdRef são refs estáveis.
  //   currentTheme é lido via themeRef — sem necessidade de re-registar.
}
