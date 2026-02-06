import type { CustomPlugin } from 'svgo';

/**
 * SVGO Plugin: Remove Bx Attributes
 * 
 * Removes editor-specific attributes from SVG elements.
 * These attributes are added by vector editors like Boxy SVG and BoxySVG
 * and are not needed for the final output.
 * 
 * Attributes removed:
 * - bx:* (Boxy SVG specific)
 * - data-bx-* (Boxy SVG data attributes)
 * - sodipodi:* (Inkscape specific)
 * - inkscape:* (Inkscape specific)
 */

const EDITOR_PREFIXES = ['bx:', 'data-bx-', 'sodipodi:', 'inkscape:'];

export const removeBxAttributesPlugin: CustomPlugin = {
  name: 'removeBxAttributes',
  fn: () => {
    return {
      element: {
        enter: (node) => {
          const attributesToRemove: string[] = [];

          // Find all editor-specific attributes
          for (const attr of Object.keys(node.attributes)) {
            for (const prefix of EDITOR_PREFIXES) {
              if (attr.startsWith(prefix)) {
                attributesToRemove.push(attr);
                break;
              }
            }
          }

          // Remove the identified attributes
          for (const attr of attributesToRemove) {
            delete node.attributes[attr];
          }
        },
      },
    };
  },
};

export default removeBxAttributesPlugin;
