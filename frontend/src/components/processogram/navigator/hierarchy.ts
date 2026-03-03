/**
 * ═══════════════════════════════════════════════════════════════════════
 * SVG Navigator — Hierarquia & Breadcrumb
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Dado qualquer elemento SVG clicado, monta o caminho hierárquico
 * completo subindo na árvore DOM via `closest()`.
 *
 * Exemplo: ao clicar em `heat-stress--ci1`, retorna:
 *   [
 *     { level: "Production System", name: "Broiler",      rawId: "broiler--ps"       },
 *     { level: "Life Fate",         name: "Growing",      rawId: "growing--lf1"      },
 *     { level: "Phase",             name: "Feeding",      rawId: "feeding--ph1"      },
 *     { level: "Circumstance",      name: "Heat Stress",  rawId: "heat-stress--ci1"  },
 *   ]
 *
 * A hierarquia é determinada pelo **aninhamento DOM** — não por atributos.
 * `closest("[id*='--lf']")` sobe até encontrar o `<g>` Life Fate pai.
 *
 * Referência: GUIA_REPLICACAO_SVG_NAVIGATOR.md §6
 * ═══════════════════════════════════════════════════════════════════════
 */

import {
  getLevelAliasFromId,
  deslugify,
  parseElementId,
} from "./extractInfoFromId";
import type { HierarchyItem } from "./types";

// ─── Lookup local ──────────────────────────────────────────────────────
// Mapas alias→número para lookup rápido sem reconstruir a cada chamada.

const ALIAS_TO_NUMBER: Record<string, number> = {
  ps: 0,
  lf: 1,
  ph: 2,
  ci: 3,
};

const NUMBER_TO_ALIAS: Record<number, string> = {
  0: "ps",
  1: "lf",
  2: "ph",
  3: "ci",
};

// ─── Hierarquia ────────────────────────────────────────────────────────

/**
 * Resultado de `getHierarchy()`.
 *
 * - `hierarchy`: ancestrais do elemento (sem incluir o próprio).
 * - `hierarchyPath`: ancestrais + o próprio elemento (breadcrumb completo).
 */
export interface HierarchyResult {
  hierarchy: HierarchyItem[];
  hierarchyPath: HierarchyItem[];
}

/**
 * Dado um elemento SVG, sobe na árvore DOM usando `closest()` para
 * montar o caminho completo de hierarquia até o root.
 *
 * @param element - O elemento SVG (geralmente um `<g>` com ID semântico).
 * @returns Objeto com `hierarchy` (ancestrais) e `hierarchyPath` (ancestrais + self).
 *
 * @example
 * ```ts
 * const el = svg.querySelector("#heat-stress--ci1");
 * const { hierarchy, hierarchyPath } = getHierarchy(el);
 *
 * // hierarchy (sem o próprio):
 * // [
 * //   { level: "Production System", name: "Broiler", rawId: "broiler--ps" },
 * //   { level: "Life Fate",         name: "Growing", rawId: "growing--lf1" },
 * //   { level: "Phase",             name: "Feeding", rawId: "feeding--ph1" },
 * // ]
 * //
 * // hierarchyPath (com o próprio):
 * // [ ...hierarchy, { level: "Circumstance", name: "Heat Stress", rawId: "heat-stress--ci1" } ]
 * ```
 */
export function getHierarchy(element: Element): HierarchyResult {
  const alias = getLevelAliasFromId(element.id);
  const levelNumber = alias !== null ? ALIAS_TO_NUMBER[alias] : undefined;

  if (levelNumber === undefined) {
    return { hierarchy: [], hierarchyPath: [] };
  }

  let prevLevel = levelNumber - 1;
  const hierarchy: HierarchyItem[] = [];
  let current: Element = element;

  // Sobe nível por nível usando closest()
  while (current && prevLevel >= 0) {
    const levelStr = NUMBER_TO_ALIAS[prevLevel];
    if (!levelStr) break;

    const closest = current.closest(`[id*="--${levelStr}" i]`);
    if (!closest) break;

    const info = parseElementId(closest.id);
    const name = info.baseName;
    const levelLabel = info.isNavigable ? info.levelLabel : levelStr;

    hierarchy.push({
      levelNumber: prevLevel,
      level: levelLabel,
      name: deslugify(name),
      id: name,
      rawId: closest.id,
    });

    current = closest;
    prevLevel--;
  }

  // Inverte: veio do nível mais próximo ao mais distante → queremos root→folha
  const reversed = hierarchy.reverse();

  // O elemento clicado em si
  const selfInfo = parseElementId(element.id);
  const selfName = selfInfo.baseName;
  const selfLevel = selfInfo.isNavigable
    ? selfInfo.levelLabel
    : String(levelNumber);

  return {
    hierarchy: reversed,
    hierarchyPath: [
      ...reversed,
      {
        levelNumber,
        level: selfLevel,
        name: deslugify(selfName),
        id: selfName,
        rawId: element.id,
      },
    ],
  };
}

// ─── Identificador Hierárquico ─────────────────────────────────────────

/**
 * Monta um identificador hierárquico único a partir do ID do elemento
 * e sua hierarquia de ancestrais.
 *
 * Usado para gerar chaves únicas e paths legíveis.
 *
 * @example
 * ```ts
 * const hierarchy = [
 *   { id: "broiler", levelNumber: 0, ... },
 *   { id: "growing", levelNumber: 1, ... },
 * ];
 * getElementIdentifier("feeding--ph1", hierarchy);
 * // "broiler.growing.feeding"
 * ```
 */
export function getElementIdentifier(
  id: string,
  hierarchy: HierarchyItem[],
): string {
  const info = parseElementId(id);
  const name = info.baseName;

  if (hierarchy.length === 0) return name;

  const path = [...hierarchy]
    .sort((a, b) => a.levelNumber - b.levelNumber)
    .map((item) => item.id)
    .join(".");

  return `${path}.${name}`;
}
