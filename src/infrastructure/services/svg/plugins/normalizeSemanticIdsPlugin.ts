import type { CustomPlugin } from 'svgo';

/**
 * SVGO Plugin: Normalize Semantic IDs
 *
 * Normaliza IDs de elementos SVG para a convenção esperada pelo frontend:
 *
 *   {slug}--{alias}       (sem número)
 *   {slug}--{alias}-{num} (com número)
 *
 * Onde alias ∈ { ps, lf, ph, ci }.
 *
 * Alguns SVGs exportados do Illustrator/Inkscape usam underscore como
 * separador entre slug e alias:
 *
 *   sow_lf            → sow--lf
 *   pig_ci_54_         → pig--ci-54
 *   sow--focus_ci_1_   → sow--focus--ci-1
 *   conventional--intensive_ps → conventional--intensive--ps
 *   growing_ph_1_      → growing--ph-1
 *
 * IDs que já seguem a convenção (contêm --(ps|lf|ph|ci)) são ignorados.
 *
 * A regex captura o ÚLTIMO _(alias) seguido opcionalmente de _número_ no
 * final do ID, garantindo que underscores no slug não são afetados.
 */

const ALIASES = ['ps', 'lf', 'ph', 'ci'] as const;

/**
 * Matches the LAST occurrence of _(ps|lf|ph|ci) optionally followed by _digits_
 * at the end of the string.
 *
 * Examples:
 *   "sow_lf"                      → match: "_lf"           → "sow--lf"
 *   "pig_ci_54_"                   → match: "_ci_54_"       → "pig--ci-54"
 *   "sow--focus_ci_1_"            → match: "_ci_1_"        → "sow--focus--ci-1"
 *   "conventional--intensive_ps"  → match: "_ps"           → "conventional--intensive--ps"
 *   "growing_ph_1_"               → match: "_ph_1_"        → "growing--ph-1"
 *   "piglet_ci"                    → match: "_ci"           → "piglet--ci"
 */
const UNDERSCORE_ALIAS_PATTERN = /_(ps|lf|ph|ci)(?:_(\d+)_?)?$/;

/**
 * IDs that already use the correct convention are skipped.
 * Matches --(ps|lf|ph|ci) anywhere in the ID.
 */
const ALREADY_NORMALIZED_PATTERN = /--(ps|lf|ph|ci)(?:[^a-zA-Z]|$)/;

export const normalizeSemanticIdsPlugin: CustomPlugin = {
  name: 'normalizeSemanticIds',
  fn: () => {
    const renamedIds = new Map<string, string>();

    return {
      element: {
        enter: (node) => {
          const currentId = node.attributes.id;
          if (!currentId) return;

          // Already uses --(ps|lf|ph|ci) → skip
          if (ALREADY_NORMALIZED_PATTERN.test(currentId)) return;

          // Check if the ID ends with _(alias) or _(alias)_(digits)_
          const match = currentId.match(UNDERSCORE_ALIAS_PATTERN);
          if (!match) return;

          const alias = match[1];       // ps, lf, ph, or ci
          const digits = match[2];      // optional number (e.g. "54")

          // Build the normalized suffix
          const normalizedSuffix = digits
            ? `--${alias}-${digits}`
            : `--${alias}`;

          // Replace the matched portion at the end
          let newId = currentId.replace(UNDERSCORE_ALIAS_PATTERN, normalizedSuffix);

          // Collapse any remaining "--" in the slug portion to "-".
          // Designers sometimes use "--" as a word separator inside the slug
          // (e.g. "sow--focus", "gestation--crate"). After appending the
          // semantic "--alias", the ID would have multiple "--" which breaks
          // the frontend's indexOf("--") parser. We convert slug "--" to "-"
          // so the ONLY "--" in the final ID is the semantic separator.
          //
          // Example: "conventional--intensive--ps" → "conventional-intensive--ps"
          //          "sow--focus--ci-1"            → "sow-focus--ci-1"
          const lastDoubleDash = newId.lastIndexOf('--');
          if (lastDoubleDash > 0) {
            const slug = newId.slice(0, lastDoubleDash);
            const suffix = newId.slice(lastDoubleDash);
            newId = slug.replace(/--/g, '-') + suffix;
          }

          node.attributes.id = newId;
          renamedIds.set(currentId, newId);
        },
      },
    };
  },
};

export default normalizeSemanticIdsPlugin;
