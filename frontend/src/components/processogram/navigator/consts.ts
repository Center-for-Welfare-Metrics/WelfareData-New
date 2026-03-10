/**
 * ═══════════════════════════════════════════════════════════════════════
 * SVG Navigator — Constantes
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Centraliza todos os valores de configuração do sistema de navegação
 * hierárquica por viewBox. Nenhum magic number deve existir fora deste
 * ficheiro.
 *
 * Referência: GUIA_REPLICACAO_SVG_NAVIGATOR.md §1
 * ═══════════════════════════════════════════════════════════════════════
 */

// ─── Animação ──────────────────────────────────────────────────────────

/** Duração padrão da transição de viewBox (segundos). */
export const ANIMATION_DURATION = 0.7;

/** Curva de easing para a transição de viewBox. */
export const ANIMATION_EASE = "power1.inOut" as const;

// ─── Motor de Câmera (ViewBox) ─────────────────────────────────────────

/**
 * Tamanho mínimo da câmera como fração do SVG total.
 *
 * Impede zoom excessivo em micro-elementos: a largura e altura
 * do viewBox NUNCA serão menores que `parentBBox * ZOOM_FLOOR_RATIO`.
 *
 * 0.05 = 5% do SVG total.
 */
export const ZOOM_FLOOR_RATIO = 0.05;

// ─── Isolamento Visual (Focus / Mute) ──────────────────────────────────
//
// Utiliza `opacity` CSS para isolamento visual — propriedade de
// composição pura na GPU, sem re-rasterização por elemento.
//
// dark:  0.15 → elementos fora de foco quase invisíveis
// light: 0.2  → levemente mais visíveis em fundo claro

export const FOCUSED_OPACITY = {
  dark:  1,
  light: 1,
} as const;

export const UNFOCUSED_OPACITY = {
  dark:  0.15,
  light: 0.2,
} as const;

// ─── Dicionário de Níveis Hierárquicos ─────────────────────────────────
//
// Mapeia os sufixos de ID do SVG (após `--`) para o índice numérico
// de profundidade. Esta é a ÚNICA fonte de verdade para a hierarquia.
//
// Contrato do SVG:
//   <g id="broiler--ps">        → nível 0 (Production System — raiz)
//     <g id="growing--lf1">     → nível 1 (Life Fate)
//       <g id="feeding--ph1">   → nível 2 (Phase)
//         <g id="heat--ci1">    → nível 3 (Circumstance — folha)

export const LEVELS_DICT: Record<string, number> = {
  "--ps": 0,
  "--lf": 1,
  "--ph": 2,
  "--ci": 3,
} as const;

/** Inversão: índice numérico → sufixo de nível. */
export const INVERSE_DICT = Object.fromEntries(
  Object.entries(LEVELS_DICT).map(([key, value]) => [value, key]),
) as Record<number, string>;

/** Índice máximo navegável (folha da árvore). */
export const MAX_LEVEL = Math.max(...Object.values(LEVELS_DICT));

/** Labels legíveis para cada alias de nível. */
export const LEVEL_LABELS: Record<string, string> = {
  ps: "Production System",
  lf: "Life Fate",
  ph: "Phase",
  ci: "Circumstance",
} as const;
