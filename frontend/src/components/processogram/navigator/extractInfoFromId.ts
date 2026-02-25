/**
 * ═══════════════════════════════════════════════════════════════════════
 * SVG Navigator — Parser de IDs Semânticos
 * ═══════════════════════════════════════════════════════════════════════
 *
 * O sistema inteiro de drill-down depende de uma convenção de IDs
 * nos elementos `<g>` do SVG:
 *
 *   `{nome-slugificado}--{alias-de-nivel}[dígitos opcionais]`
 *
 * Exemplos:
 *   "broiler--ps"        → nível 0, nome "broiler"
 *   "growing--lf1"       → nível 1, nome "growing"
 *   "feeding--ph2"       → nível 2, nome "feeding"
 *   "heat-stress--ci1"   → nível 3, nome "heat-stress"
 *
 * Este módulo é o ÚNICO responsável por decodificar essa convenção.
 * Nenhum outro ficheiro deve fazer split("--") manualmente.
 *
 * Referência: GUIA_REPLICACAO_SVG_NAVIGATOR.md §4
 * ═══════════════════════════════════════════════════════════════════════
 */

import { LEVELS_DICT, LEVEL_LABELS, MAX_LEVEL, INVERSE_DICT } from "./consts";
import type {
  LevelAlias,
  ParsedElementId,
  UnparsedElementId,
  ElementIdInfo,
} from "./types";

// ─── RegExp central ────────────────────────────────────────────────────
//
// Captura dois grupos:
//   1. Tudo ANTES do último `--` → baseName
//   2. O alias de nível (ps|lf|ph|ci) após o `--`, seguido de dígitos opcionais
//
// Exemplos de match:
//   "growing--lf1"       → groups: ["growing", "lf"]
//   "heat-stress--ci3"   → groups: ["heat-stress", "ci"]
//   "broiler--ps"        → groups: ["broiler", "ps"]
//   "some-random-id"     → NO MATCH

const NAVIGABLE_ID_REGEX = /^(.+)--(ps|lf|ph|ci)\d*$/;

// ─── Validação Rápida ──────────────────────────────────────────────────

/**
 * Verifica se um ID segue a convenção navegável.
 * Mais rápido que `parseElementId` quando só se precisa de um boolean.
 *
 * @example
 * isNavigableId("growing--lf1")   // true
 * isNavigableId("some-random-id") // false
 */
export function isNavigableId(id: string): boolean {
  return NAVIGABLE_ID_REGEX.test(id);
}

// ─── Parser Principal ──────────────────────────────────────────────────

/**
 * Faz o parse completo de um ID de elemento SVG.
 *
 * Retorna um objeto tipado com discriminated union:
 * - `isNavigable: true`  → tem todos os campos de nível preenchidos
 * - `isNavigable: false` → ID não segue a convenção; campos de nível são `null`/`-1`
 *
 * @example
 * const info = parseElementId("maternity--ph1");
 * // {
 * //   rawId:       "maternity--ph1",
 * //   baseName:    "maternity",
 * //   levelAlias:  "ph",
 * //   levelNumber: 2,
 * //   levelLabel:  "Phase",
 * //   isNavigable: true,
 * // }
 *
 * const unknown = parseElementId("random-element");
 * // {
 * //   rawId:       "random-element",
 * //   baseName:    "random-element",
 * //   levelAlias:  null,
 * //   levelNumber: -1,
 * //   levelLabel:  null,
 * //   isNavigable: false,
 * // }
 */
export function parseElementId(id: string): ElementIdInfo {
  const match = id.match(NAVIGABLE_ID_REGEX);

  if (!match) {
    return {
      rawId: id,
      baseName: id,
      levelAlias: null,
      levelNumber: -1,
      levelLabel: null,
      isNavigable: false,
    } satisfies UnparsedElementId;
  }

  const baseName = match[1];
  const alias = match[2] as LevelAlias;
  const levelNumber = LEVELS_DICT[`--${alias}`] ?? -1;
  const levelLabel = LEVEL_LABELS[alias] ?? alias;

  return {
    rawId: id,
    baseName,
    levelAlias: alias,
    levelNumber,
    levelLabel,
    isNavigable: true,
  } satisfies ParsedElementId;
}

// ─── Atalhos de Extração ───────────────────────────────────────────────
// Mantidos por conveniência (o sistema legado usa chamadas separadas).
// Todos delegam para `parseElementId` internamente.

/**
 * Extrai o nome legível (deslugificado) do ID.
 *
 * @example
 * getElementNameFromId("heat-stress--ci1") // "heat stress"
 */
export function getElementNameFromId(id: string): string {
  const { baseName } = parseElementId(id);
  return deslugify(baseName);
}

/**
 * Extrai o alias de nível do ID.
 *
 * @example
 * getLevelAliasFromId("growing--lf1") // "lf"
 * getLevelAliasFromId("random")       // null
 */
export function getLevelAliasFromId(id: string): LevelAlias | null {
  const info = parseElementId(id);
  return info.isNavigable ? info.levelAlias : null;
}

/**
 * Retorna o número do nível a partir do ID.
 *
 * @example
 * getLevelNumberById("growing--lf1") // 1
 * getLevelNumberById(null)           // -1
 */
export function getLevelNumberById(id: string | null): number {
  if (!id) return -1;
  return parseElementId(id).levelNumber;
}

/**
 * Retorna o label legível do nível.
 *
 * @example
 * getElementLevelFromId("growing--lf1") // "Life Fate"
 */
export function getElementLevelFromId(id: string): string | null {
  const info = parseElementId(id);
  return info.isNavigable ? info.levelLabel : null;
}

/**
 * Retorna o sufixo CSS-selector para um dado nível numérico.
 *
 * @example
 * getSelectorForLevel(1) // "--lf"
 * getSelectorForLevel(5) // undefined
 */
export function getSelectorForLevel(level: number): string | undefined {
  return INVERSE_DICT[level];
}

/**
 * Verifica se o nível dado é a folha máxima da hierarquia.
 */
export function isMaxLevel(level: number): boolean {
  return level >= MAX_LEVEL;
}

// ─── Utilitários internos ──────────────────────────────────────────────

/**
 * Converte slug para texto legível.
 *
 * @example
 * deslugify("heat-stress") // "Heat Stress"
 * deslugify("growing")     // "Growing"
 */
export function deslugify(slug: string): string {
  return slug
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
