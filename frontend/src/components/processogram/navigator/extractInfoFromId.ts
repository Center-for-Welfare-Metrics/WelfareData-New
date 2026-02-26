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

// ─── Helpers internos de parsing ───────────────────────────────────────
//
// Abordagem: split("--") → remove tudo que não é letra → lookup no LEVELS_DICT.
// Funciona com TODOS os formatos de ID reais:
//   "laying_hen--lf"       → split → "lf"       → "lf"  → nível 1  ✅
//   "fan--ci008"            → split → "ci008"    → "ci"  → nível 3  ✅
//   "hen--ci-42"            → split → "ci-42"    → "ci"  → nível 3  ✅
//   "egg_belt--ci-58"       → split → "ci-58"    → "ci"  → nível 3  ✅
//   "some-random-id"        → sem "--" → não navegável

/**
 * Extrai o alias de nível puro (só letras) da parte após `--`.
 * Retorna `null` se o ID não contém `--` ou o alias não é reconhecido.
 */
function extractAlias(id: string): LevelAlias | null {
  const separatorIndex = id.indexOf("--");
  if (separatorIndex === -1) return null;

  const afterSeparator = id.slice(separatorIndex + 2);
  const lettersOnly = afterSeparator.replace(/[^a-zA-Z]/g, "");

  return lettersOnly in LEVEL_LABELS ? (lettersOnly as LevelAlias) : null;
}

/**
 * Extrai o baseName (tudo antes do `--`).
 */
function extractBaseName(id: string): string {
  const separatorIndex = id.indexOf("--");
  return separatorIndex !== -1 ? id.slice(0, separatorIndex) : id;
}

// ─── Validação Rápida ──────────────────────────────────────────────────

/**
 * Verifica se um ID segue a convenção navegável.
 *
 * @example
 * isNavigableId("growing--lf1")   // true
 * isNavigableId("hen--ci-42")     // true
 * isNavigableId("some-random-id") // false
 */
export function isNavigableId(id: string): boolean {
  return extractAlias(id) !== null;
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
 * // Formato com hífen antes do número (real nos SVGs):
 * const ci = parseElementId("hen--ci-42");
 * // {
 * //   rawId:       "hen--ci-42",
 * //   baseName:    "hen",
 * //   levelAlias:  "ci",
 * //   levelNumber: 3,
 * //   levelLabel:  "Circumstance",
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
  const alias = extractAlias(id);

  if (!alias) {
    return {
      rawId: id,
      baseName: id,
      levelAlias: null,
      levelNumber: -1,
      levelLabel: null,
      isNavigable: false,
    } satisfies UnparsedElementId;
  }

  const baseName = extractBaseName(id);
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
