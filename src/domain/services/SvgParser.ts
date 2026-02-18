import * as cheerio from 'cheerio';

const ANALYZABLE_PATTERN = /(?:--|_)(ps|lf|ph|ci)(?:[_-]\d+[_-]?)?$/;

const LEVEL_MAP: Record<string, string> = {
  ps: 'production system',
  lf: 'life-fate',
  ph: 'phase',
  ci: 'circumstance',
};

export interface ParsedElement {
  elementId: string;
  level: string;
  name: string;
  parents: string;
}

function isAnalyzableId(id: string): boolean {
  return ANALYZABLE_PATTERN.test(id);
}

function extractLevel(id: string): string {
  const match = id.match(ANALYZABLE_PATTERN);
  return match ? LEVEL_MAP[match[1]] || 'unknown' : 'unknown';
}

function extractName(id: string): string {
  return id
    .replace(ANALYZABLE_PATTERN, '')
    .replace(/[-_]+$/, '')
    .replace(/--/g, '-')
    .replace(/[_-]/g, ' ')
    .trim();
}

function buildParentString(parentIds: string[]): string {
  if (parentIds.length === 0) return 'none';
  return parentIds
    .map((pid) => `${extractLevel(pid)} - ${extractName(pid)}`)
    .join(', ');
}

export class SvgParser {
  parse(svgContent: string): ParsedElement[] {
    const $ = cheerio.load(svgContent, { xml: true });
    const elements: ParsedElement[] = [];

    $('[id]').each((_, el) => {
      const id = $(el).attr('id');
      if (!id || !isAnalyzableId(id)) return;

      const parentIds: string[] = [];
      let current = $(el).parent();
      while (current.length && current[0].type === 'tag' && (current[0] as any).name !== 'svg') {
        const parentId = current.attr('id');
        if (parentId && isAnalyzableId(parentId)) {
          parentIds.unshift(parentId);
        }
        current = current.parent();
      }

      elements.push({
        elementId: id,
        level: extractLevel(id),
        name: extractName(id),
        parents: buildParentString(parentIds),
      });
    });

    return elements;
  }
}
