/**
 * ═══════════════════════════════════════════════════════════════════════
 * SVG Navigator — Tipos
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Tipagens centrais do sistema de navegação hierárquica SVG.
 * Todas as interfaces que cruzam a fronteira entre módulos
 * (hooks, componentes, page) vivem aqui.
 *
 * Referência: GUIA_REPLICACAO_SVG_NAVIGATOR.md §1, §3
 * ═══════════════════════════════════════════════════════════════════════
 */

// ─── Hierarquia ────────────────────────────────────────────────────────

/**
 * Alias legível do nível hierárquico.
 * Extraído do sufixo `--xx` do ID SVG.
 */
export type LevelAlias = "ps" | "lf" | "ph" | "ci";

/**
 * Nível semântico legível (para UI / labels).
 */
export type LevelLabel =
  | "Production System"
  | "Life Fate"
  | "Phase"
  | "Circumstance";

/**
 * Item individual na hierarquia de breadcrumb.
 *
 * Exemplo: ao clicar em `heat-stress--ci1`, a hierarquia é:
 * ```
 * [
 *   { levelNumber: 0, level: "Production System", name: "Broiler", rawId: "broiler--ps" },
 *   { levelNumber: 1, level: "Life Fate",         name: "Growing", rawId: "growing--lf1" },
 *   { levelNumber: 2, level: "Phase",             name: "Feeding", rawId: "feeding--ph1" },
 *   { levelNumber: 3, level: "Circumstance",      name: "Heat Stress", rawId: "heat-stress--ci1" },
 * ]
 * ```
 */
export interface HierarchyItem {
  /** Índice numérico do nível (0 = root, 3 = folha). */
  levelNumber: number;
  /** Label legível do nível ("Life Fate", "Phase", etc.). */
  level: string;
  /** Nome legível do elemento (deslugificado). */
  name: string;
  /** Slug do nome (parte antes do `--`). */
  id: string;
  /** ID completo no SVG (ex: `growing--lf1`). */
  rawId: string;
}

// ─── Histórico de Navegação ────────────────────────────────────────────

/**
 * Mapa de histórico de drill-down.
 * Chave = nível numérico, valor = último ID visitado naquele nível.
 *
 * Usado para drill-up: ao clicar no vazio, o sistema consulta
 * `historyLevel[currentLevel - 1]` para saber para onde voltar.
 */
export type HistoryLevel = Record<number, { id: string }>;

// ─── EventBus ──────────────────────────────────────────────────────────

/** Tipos de evento que o bus suporta. */
export type EventBusType = "CHANGE_LEVEL" | "CLOSE";

/** Payload de um evento do bus. */
export interface EventBusPayload {
  type: EventBusType;
  payload: { id?: string };
}

/** Interface do publicador. */
export interface EventBus {
  publish: (event: EventBusPayload) => void;
}

/** Callback que recebe o bus para uso externo (breadcrumb, botão voltar). */
export type EventBusHandler = (eventBus: EventBus) => void;

// ─── Resultado do Parser de ID ─────────────────────────────────────────

/**
 * Resultado estruturado do parsing de um ID semântico SVG.
 *
 * Para `maternity--ph1`:
 * ```
 * {
 *   rawId:       "maternity--ph1",
 *   baseName:    "maternity",
 *   levelAlias:  "ph",
 *   levelNumber: 2,
 *   levelLabel:  "Phase",
 *   isNavigable: true,
 * }
 * ```
 */
export interface ParsedElementId {
  /** ID completo como aparece no SVG. */
  rawId: string;
  /** Nome-base antes do `--` (slug). */
  baseName: string;
  /** Alias curto do nível (`ps`, `lf`, `ph`, `ci`). */
  levelAlias: LevelAlias;
  /** Índice numérico do nível (0–3). */
  levelNumber: number;
  /** Label legível do nível. */
  levelLabel: string;
  /** `true` se o ID segue a convenção navegável (`--xx`). */
  isNavigable: true;
}

/**
 * Resultado para IDs que NÃO seguem a convenção navegável.
 * Esses elementos existem no SVG mas não participam do drill-down.
 */
export interface UnparsedElementId {
  rawId: string;
  baseName: string;
  levelAlias: null;
  levelNumber: -1;
  levelLabel: null;
  isNavigable: false;
}

/** Union type do resultado do parser. */
export type ElementIdInfo = ParsedElementId | UnparsedElementId;
