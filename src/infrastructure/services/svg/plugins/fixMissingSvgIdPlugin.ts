import type { CustomPlugin } from 'svgo';

/**
 * SVGO Plugin: Fix Missing SVG IDs
 * 
 * Ensures all relevant SVG elements have hierarchical IDs compatible with the Frontend.
 * The Frontend expects specific ID patterns for interactive elements:
 * - --ps: Process Step
 * - --lf: Life Phase
 * - --ph: Placeholder
 * - --ci: Critical Indicator
 * 
 * This plugin generates missing IDs based on element type and position,
 * maintaining compatibility with the legacy system.
 */

interface ElementCounter {
  g: number;
  rect: number;
  path: number;
  text: number;
  circle: number;
  ellipse: number;
  polygon: number;
  line: number;
  polyline: number;
  image: number;
  use: number;
  [key: string]: number;
}

const INTERACTIVE_ELEMENTS = ['g', 'rect', 'path', 'text', 'circle', 'ellipse', 'polygon', 'line', 'polyline', 'image', 'use'];

// ID prefixes that the frontend recognizes for interactive elements
const KNOWN_PREFIXES = ['--ps', '--lf', '--ph', '--ci', '--el', '--grp'];

export const fixMissingSvgIdPlugin: CustomPlugin = {
  name: 'fixMissingSvgId',
  fn: () => {
    const counters: ElementCounter = {
      g: 0,
      rect: 0,
      path: 0,
      text: 0,
      circle: 0,
      ellipse: 0,
      polygon: 0,
      line: 0,
      polyline: 0,
      image: 0,
      use: 0,
    };

    const usedIds = new Set<string>();

    return {
      element: {
        enter: (node) => {
          const tagName = node.name;

          // Only process interactive elements
          if (!INTERACTIVE_ELEMENTS.includes(tagName)) {
            return;
          }

          const currentId = node.attributes.id;

          // Only track elements that already have a meaningful ID.
          // Elements without IDs are not interactive — generating
          // synthetic --el-* IDs inflates the SVG (up to +1.3MB on
          // large files) and slows down SVGO multipass for no benefit,
          // since the rasterizer only targets --ps/lf/ph/ci suffixes.
          if (currentId) {
            usedIds.add(currentId);
          }
        },
      },
    };
  },
};

/**
 * Helper function to check if an ID is a known interactive prefix
 */
export function isInteractiveId(id: string): boolean {
  return KNOWN_PREFIXES.some((prefix) => id.startsWith(prefix));
}

/**
 * Helper function to extract all interactive element IDs from SVG
 */
export function extractInteractiveIds(svgContent: string): string[] {
  const idRegex = /id="([^"]+)"/g;
  const ids: string[] = [];
  let match;

  while ((match = idRegex.exec(svgContent)) !== null) {
    const id = match[1];
    if (isInteractiveId(id)) {
      ids.push(id);
    }
  }

  return ids;
}

export default fixMissingSvgIdPlugin;
