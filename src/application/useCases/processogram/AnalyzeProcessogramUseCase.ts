import * as cheerio from 'cheerio';
import { ProcessogramModel } from '../../../infrastructure/models/ProcessogramModel';
import { ProcessogramDataModel } from '../../../infrastructure/models/ProcessogramDataModel';
import { getStorageService } from '../../../infrastructure/services/storage';
import { getGeminiService, ElementInput } from '../../../infrastructure/services/ai';

const ANALYZABLE_PATTERN = /(?:--|_)(ps|lf|ph|ci)(?:[_-]\d+[_-]?)?$/;

const LEVEL_MAP: Record<string, string> = {
  ps: 'production system',
  lf: 'life-fate',
  ph: 'phase',
  ci: 'circumstance',
};

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

function buildParentString(
  parentIds: string[]
): string {
  if (parentIds.length === 0) return 'none';
  return parentIds
    .map((pid) => `${extractLevel(pid)} - ${extractName(pid)}`)
    .join(', ');
}

export class AnalyzeProcessogramUseCase {
  async execute(processogramId: string) {
    const processogram = await ProcessogramModel.findById(processogramId)
      .populate('specieId', 'name pathname')
      .populate('productionModuleId', 'name slug');

    if (!processogram) {
      throw new Error('Processogram not found');
    }

    if (!processogram.svg_url_light) {
      throw new Error('Processogram has no SVG file to analyze');
    }

    const storage = getStorageService();
    const svgContent = await storage.downloadAsText(processogram.svg_url_light);

    const $ = cheerio.load(svgContent, { xml: true });

    const elements: ElementInput[] = [];

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

    if (elements.length === 0) {
      return {
        processogramId,
        message: 'No analyzable elements found in SVG',
        elementsAnalyzed: 0,
        descriptionsUpserted: 0,
      };
    }

    const gemini = getGeminiService();
    const analysis = await gemini.generateBulkAnalysis(elements);

    const dataOps = analysis.elements.map((el) => ({
      updateOne: {
        filter: { processogramId, elementId: el.elementId },
        update: {
          $set: {
            description: el.description,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            processogramId,
            elementId: el.elementId,
            createdAt: new Date(),
          },
        },
        upsert: true,
      },
    }));

    if (dataOps.length > 0) {
      await ProcessogramDataModel.bulkWrite(dataOps);
    }

    return {
      processogramId,
      message: `Analysis complete: ${elements.length} elements processed`,
      elementsFound: elements.length,
      elementsAnalyzed: analysis.elements.length,
      descriptionsUpserted: analysis.elements.length,
    };
  }
}
