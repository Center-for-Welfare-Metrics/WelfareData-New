import { useCallback, useMemo, useRef, useState } from "react";
import type {
  ProcessogramElement,
  ProcessogramQuestion,
  ElementLevel,
  BreadcrumbItem,
  ActiveElementData,
} from "@/types/processogram";

const ANALYZABLE_PATTERN = /(?:--|_)(ps|lf|ph|ci)(?:[_-]\d+[_-]?)?$/;

const LEVEL_MAP: Record<string, ElementLevel> = {
  ps: "production system",
  lf: "life-fate",
  ph: "phase",
  ci: "circumstance",
};

export function extractLevel(elementId: string): ElementLevel {
  const match = elementId.match(ANALYZABLE_PATTERN);
  return match ? LEVEL_MAP[match[1]] ?? "unknown" : "unknown";
}

export function extractCleanName(elementId: string): string {
  return elementId
    .replace(ANALYZABLE_PATTERN, "")
    .replace(/[-_]+$/, "")
    .replace(/--/g, "-")
    .replace(/[_-]/g, " ")
    .trim();
}

export function hierarchyRank(level: ElementLevel): number {
  switch (level) {
    case "production system":
      return 0;
    case "life-fate":
      return 1;
    case "phase":
      return 2;
    case "circumstance":
      return 3;
    default:
      return 99;
  }
}

export function isAnalyzableId(id: string): boolean {
  return ANALYZABLE_PATTERN.test(id);
}

function buildHierarchyFromDom(elementId: string): BreadcrumbItem[] {
  const svgContainer = document.querySelector(".processogram-svg-container");
  if (!svgContainer) return [];

  const target =
    svgContainer.querySelector(`#${CSS.escape(elementId)}`) ??
    svgContainer.querySelector(`[id="${elementId}"]`);
  if (!target) return [];

  const crumbs: BreadcrumbItem[] = [];
  let current = target.parentElement;
  while (current && current.tagName.toLowerCase() !== "svg") {
    const parentId = current.getAttribute("id");
    if (parentId && isAnalyzableId(parentId)) {
      crumbs.unshift({
        id: parentId,
        label: extractCleanName(parentId) || parentId,
        levelName: extractLevel(parentId),
      });
    }
    current = current.parentElement;
  }

  crumbs.push({
    id: elementId,
    label: extractCleanName(elementId) || elementId,
    levelName: extractLevel(elementId),
  });

  return crumbs;
}

export interface ProcessogramNavigationState {
  selectedElementId: string | null;
  activeElementData: ActiveElementData | null;
  breadcrumbPath: BreadcrumbItem[];
  activeLevelIndex: number;
  zoomTargetId: string | null;
}

export interface ProcessogramNavigationActions {
  handleDrilldown: (clickedId: string) => void;
  clearSelection: () => void;
  navigateUp: (levelIndex: number) => void;
}

export type UseProcessogramStateReturn = ProcessogramNavigationState &
  ProcessogramNavigationActions & {
    elementsMap: Map<string, ProcessogramElement>;
    questionsMap: Map<string, ProcessogramQuestion[]>;
    isAnalyzableElement: (id: string) => boolean;
  };

export function useProcessogramState(
  elements: ProcessogramElement[],
  questions: ProcessogramQuestion[]
): UseProcessogramStateReturn {
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [activeElementData, setActiveElementData] = useState<ActiveElementData | null>(null);
  const [breadcrumbPath, setBreadcrumbPath] = useState<BreadcrumbItem[]>([]);
  const [activeLevelIndex, setActiveLevelIndex] = useState<number>(-1);
  const [zoomTargetId, setZoomTargetId] = useState<string | null>(null);

  const pendingTargetRef = useRef<string | null>(null);

  const elementsMap = useMemo(() => {
    const map = new Map<string, ProcessogramElement>();
    for (const el of elements) {
      map.set(el.elementId, el);
    }
    return map;
  }, [elements]);

  const questionsMap = useMemo(() => {
    const map = new Map<string, ProcessogramQuestion[]>();
    for (const q of questions) {
      const existing = map.get(q.elementId) ?? [];
      existing.push(q);
      map.set(q.elementId, existing);
    }
    return map;
  }, [questions]);

  const isAnalyzableElement = useCallback(
    (id: string) => elementsMap.has(id) || isAnalyzableId(id),
    [elementsMap]
  );

  const buildActiveData = useCallback(
    (elementId: string): ActiveElementData | null => {
      const element = elementsMap.get(elementId);
      if (!element) return null;

      const level = extractLevel(elementId);
      const label = extractCleanName(elementId) || elementId;
      const elementQuestions = questionsMap.get(elementId) ?? [];

      return {
        elementId,
        level,
        label,
        description: element.description,
        parents: [],
        questions: elementQuestions,
      };
    },
    [elementsMap, questionsMap]
  );

  const applyLevelState = useCallback(
    (path: BreadcrumbItem[], levelIdx: number) => {
      const targetCrumb = path[levelIdx];
      if (!targetCrumb) return;

      setActiveLevelIndex(levelIdx);
      setZoomTargetId(targetCrumb.id);
      setSelectedElementId(targetCrumb.id);

      const data = buildActiveData(targetCrumb.id);
      if (data) {
        data.parents = path.slice(0, levelIdx);
      }
      setActiveElementData(data);
    },
    [buildActiveData]
  );

  const handleDrilldown = useCallback(
    (clickedId: string) => {
      if (!isAnalyzableId(clickedId)) return;

      const fullPath = buildHierarchyFromDom(clickedId);
      if (fullPath.length === 0) return;

      if (pendingTargetRef.current === clickedId && breadcrumbPath.length > 0) {
        const currentIdx = activeLevelIndex;
        const targetFinalIdx = fullPath.findIndex((c) => c.id === clickedId);

        if (targetFinalIdx === -1) {
          setBreadcrumbPath(fullPath);
          applyLevelState(fullPath, fullPath.length - 1);
          pendingTargetRef.current = null;
          return;
        }

        const nextIdx = Math.min(currentIdx + 1, targetFinalIdx);

        if (nextIdx <= currentIdx) {
          pendingTargetRef.current = null;
          return;
        }

        setBreadcrumbPath(fullPath);
        applyLevelState(fullPath, nextIdx);

        if (nextIdx >= targetFinalIdx) {
          pendingTargetRef.current = null;
        }
        return;
      }

      pendingTargetRef.current = clickedId;
      setBreadcrumbPath(fullPath);

      const clickedIdx = fullPath.findIndex((c) => c.id === clickedId);

      if (clickedIdx <= 0) {
        applyLevelState(fullPath, 0);
        if (clickedIdx === 0) pendingTargetRef.current = null;
      } else {
        applyLevelState(fullPath, 0);
      }
    },
    [breadcrumbPath, activeLevelIndex, applyLevelState]
  );

  const clearSelection = useCallback(() => {
    setSelectedElementId(null);
    setActiveElementData(null);
    setBreadcrumbPath([]);
    setActiveLevelIndex(-1);
    setZoomTargetId(null);
    pendingTargetRef.current = null;
  }, []);

  const navigateUp = useCallback(
    (levelIndex: number) => {
      if (levelIndex < 0 || levelIndex >= breadcrumbPath.length) return;
      if (levelIndex === activeLevelIndex) return;

      applyLevelState(breadcrumbPath, levelIndex);
      pendingTargetRef.current = null;
    },
    [breadcrumbPath, activeLevelIndex, applyLevelState]
  );

  return {
    selectedElementId,
    activeElementData,
    breadcrumbPath,
    activeLevelIndex,
    zoomTargetId,
    handleDrilldown,
    clearSelection,
    navigateUp,
    elementsMap,
    questionsMap,
    isAnalyzableElement,
  };
}
