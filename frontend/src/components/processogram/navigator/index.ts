/**
 * SVG Navigator — Barrel Export
 *
 * Ponto de entrada único para o módulo de navegação hierárquica.
 * Importações externas devem usar:
 *
 *   import { parseElementId, isNavigableId, ... } from "@/components/processogram/navigator";
 */

// Constantes
export {
  ANIMATION_DURATION,
  ANIMATION_EASE,
  FOCUSED_FILTER,
  UNFOCUSED_FILTER,
  LEVELS_DICT,
  INVERSE_DICT,
  MAX_LEVEL,
  LEVEL_LABELS,
} from "./consts";

// Tipos
export type {
  LevelAlias,
  LevelLabel,
  HierarchyItem,
  HistoryLevel,
  EventBusType,
  EventBusPayload,
  EventBus,
  EventBusHandler,
  ParsedElementId,
  UnparsedElementId,
  ElementIdInfo,
} from "./types";

// Parser de IDs
export {
  isNavigableId,
  parseElementId,
  getElementNameFromId,
  getLevelAliasFromId,
  getLevelNumberById,
  getElementLevelFromId,
  getSelectorForLevel,
  isMaxLevel,
  deslugify,
} from "./extractInfoFromId";
