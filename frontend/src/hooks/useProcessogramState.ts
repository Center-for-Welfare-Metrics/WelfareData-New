import { useCallback, useMemo, useState } from "react";
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

function extractLevel(elementId: string): ElementLevel {
  const match = elementId.match(ANALYZABLE_PATTERN);
  return match ? LEVEL_MAP[match[1]] ?? "unknown" : "unknown";
}

function extractCleanName(elementId: string): string {
  return elementId
    .replace(ANALYZABLE_PATTERN, "")
    .replace(/[-_]+$/, "")
    .replace(/--/g, "-")
    .replace(/[_-]/g, " ")
    .trim();
}

function parseParentsString(parents: string): BreadcrumbItem[] {
  if (!parents || parents === "none") return [];

  return parents.split(",").reduce<BreadcrumbItem[]>((acc, segment) => {
    const trimmed = segment.trim();
    if (!trimmed) return acc;

    const separatorIndex = trimmed.indexOf(" - ");
    if (separatorIndex === -1) return acc;

    const levelName = trimmed.slice(0, separatorIndex).trim() as ElementLevel;
    const label = trimmed.slice(separatorIndex + 3).trim();

    if (!label) return acc;

    acc.push({ id: `parent__${levelName}__${label}`, label, levelName });
    return acc;
  }, []);
}

export interface ProcessogramNavigationState {
  selectedElementId: string | null;
  activeElementData: ActiveElementData | null;
  breadcrumbPath: BreadcrumbItem[];
}

export interface ProcessogramNavigationActions {
  selectElement: (id: string) => void;
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
    (id: string) => elementsMap.has(id),
    [elementsMap]
  );

  const buildActiveData = useCallback(
    (elementId: string): ActiveElementData | null => {
      const element = elementsMap.get(elementId);
      if (!element) return null;

      const level = extractLevel(elementId);
      const label = extractCleanName(elementId) || elementId;
      const parentsBreadcrumb = parseParentsString(element.description ? "" : "");
      const elementQuestions = questionsMap.get(elementId) ?? [];

      return {
        elementId,
        level,
        label,
        description: element.description,
        parents: parentsBreadcrumb,
        questions: elementQuestions,
      };
    },
    [elementsMap, questionsMap]
  );

  const buildBreadcrumb = useCallback(
    (elementId: string, svgRoot?: Element | null): BreadcrumbItem[] => {
      const crumbs: BreadcrumbItem[] = [];
      const level = extractLevel(elementId);
      const label = extractCleanName(elementId) || elementId;

      if (svgRoot) {
        const target =
          svgRoot.querySelector(`#${CSS.escape(elementId)}`) ??
          svgRoot.querySelector(`[id="${elementId}"]`);

        if (target) {
          let current = target.parentElement;
          while (current && current.tagName.toLowerCase() !== "svg") {
            const parentId = current.getAttribute("id");
            if (parentId && ANALYZABLE_PATTERN.test(parentId)) {
              crumbs.unshift({
                id: parentId,
                label: extractCleanName(parentId) || parentId,
                levelName: extractLevel(parentId),
              });
            }
            current = current.parentElement;
          }
        }
      } else {
        const element = elementsMap.get(elementId);
        if (element) {
          const desc = element.description;
          const allElements = Array.from(elementsMap.values());
          const potentialParents = allElements.filter(
            (el) =>
              el.elementId !== elementId &&
              hierarchyRank(extractLevel(el.elementId)) <
                hierarchyRank(level)
          );

          for (const parent of potentialParents) {
            const parentLevel = extractLevel(parent.elementId);
            const parentLabel = extractCleanName(parent.elementId) || parent.elementId;

            if (
              desc.toLowerCase().includes(parentLabel.toLowerCase()) ||
              hierarchyRank(parentLevel) < hierarchyRank(level)
            ) {
              if (!crumbs.some((c) => c.id === parent.elementId)) {
                crumbs.push({
                  id: parent.elementId,
                  label: parentLabel,
                  levelName: parentLevel,
                });
              }
            }
          }

          crumbs.sort(
            (a, b) => hierarchyRank(a.levelName) - hierarchyRank(b.levelName)
          );
        }
      }

      crumbs.push({ id: elementId, label, levelName: level });
      return crumbs;
    },
    [elementsMap]
  );

  const selectElement = useCallback(
    (id: string) => {
      const svgContainer = document.querySelector(".processogram-svg-container");
      const breadcrumb = buildBreadcrumb(id, svgContainer);
      const data = buildActiveData(id);

      if (data) {
        data.parents = breadcrumb.slice(0, -1);
      }

      setSelectedElementId(id);
      setActiveElementData(data);
      setBreadcrumbPath(breadcrumb);
    },
    [buildBreadcrumb, buildActiveData]
  );

  const clearSelection = useCallback(() => {
    setSelectedElementId(null);
    setActiveElementData(null);
    setBreadcrumbPath([]);
  }, []);

  const navigateUp = useCallback(
    (levelIndex: number) => {
      if (levelIndex < 0 || levelIndex >= breadcrumbPath.length) return;

      const target = breadcrumbPath[levelIndex];

      if (levelIndex === breadcrumbPath.length - 1) return;

      if (target.id.startsWith("parent__")) {
        setBreadcrumbPath(breadcrumbPath.slice(0, levelIndex + 1));
        setSelectedElementId(null);
        setActiveElementData(null);
        return;
      }

      selectElement(target.id);
    },
    [breadcrumbPath, selectElement]
  );

  return {
    selectedElementId,
    activeElementData,
    breadcrumbPath,
    selectElement,
    clearSelection,
    navigateUp,
    elementsMap,
    questionsMap,
    isAnalyzableElement,
  };
}

function hierarchyRank(level: ElementLevel): number {
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
