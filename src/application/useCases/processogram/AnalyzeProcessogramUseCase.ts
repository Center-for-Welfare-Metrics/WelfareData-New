import * as cheerio from 'cheerio';
import { ProcessogramModel } from '../../../infrastructure/models/ProcessogramModel';
import { ProcessogramDataModel } from '../../../infrastructure/models/ProcessogramDataModel';
import { ProcessogramQuestionModel } from '../../../infrastructure/models/ProcessogramQuestionModel';
import { getStorageService } from '../../../infrastructure/services/storage';
import { getGeminiService } from '../../../infrastructure/services/ai';

const RASTERIZABLE_PREFIXES = ['--ps', '--lf', '--ph', '--ci'];

function isAnalyzableId(id: string): boolean {
  return RASTERIZABLE_PREFIXES.some((prefix) => id.startsWith(prefix));
}

export class AnalyzeProcessogramUseCase {
  async execute(processogramId: string) {
    // Step 1: Fetch processogram
    const processogram = await ProcessogramModel.findById(processogramId)
      .populate('specieId', 'name pathname')
      .populate('productionModuleId', 'name slug');

    if (!processogram) {
      throw new Error('Processogram not found');
    }

    if (!processogram.svg_url_light) {
      throw new Error('Processogram has no SVG file to analyze');
    }

    // Step 2: Download SVG from GCS
    const storage = getStorageService();
    const svgContent = await storage.downloadAsText(processogram.svg_url_light);

    // Step 3: Extract element IDs using Cheerio
    const $ = cheerio.load(svgContent, { xml: true });
    const elementIds: string[] = [];

    $('[id]').each((_, el) => {
      const id = $(el).attr('id');
      if (id && isAnalyzableId(id)) {
        elementIds.push(id);
      }
    });

    if (elementIds.length === 0) {
      return {
        processogramId,
        message: 'No analyzable elements found in SVG',
        elementsAnalyzed: 0,
        descriptionsUpserted: 0,
        questionsUpserted: 0,
      };
    }

    // Step 4: Build context for Gemini
    const specie = processogram.specieId as any;
    const module = processogram.productionModuleId as any;
    const context = [
      `Processograma: "${processogram.name}"`,
      `Espécie: ${specie?.name || 'N/A'}`,
      `Módulo de Produção: ${module?.name || 'N/A'}`,
      `Identificador: ${processogram.identifier}`,
      processogram.description ? `Descrição: ${processogram.description}` : '',
      `Total de elementos interativos: ${elementIds.length}`,
      `IDs dos elementos: ${elementIds.join(', ')}`,
    ]
      .filter(Boolean)
      .join('\n');

    // Step 5: Call Gemini for bulk analysis
    const gemini = getGeminiService();
    const analysis = await gemini.generateBulkAnalysis(context, elementIds);

    // Step 6: Bulk upsert descriptions
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

    // Step 7: Bulk upsert questions
    const questionOps: any[] = [];
    for (const el of analysis.elements) {
      if (!el.questions || el.questions.length === 0) continue;

      // Delete existing questions for this element, then insert fresh
      questionOps.push({
        deleteMany: {
          filter: { processogramId, elementId: el.elementId },
        },
      });

      for (const q of el.questions) {
        questionOps.push({
          insertOne: {
            document: {
              processogramId,
              elementId: el.elementId,
              question: q.question,
              options: q.options,
              correctAnswerIndex: q.correctAnswerIndex,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
        });
      }
    }

    if (questionOps.length > 0) {
      await ProcessogramQuestionModel.bulkWrite(questionOps);
    }

    // Step 8: Count results
    const descriptionsUpserted = analysis.elements.length;
    const questionsUpserted = analysis.elements.reduce(
      (acc, el) => acc + (el.questions?.length || 0),
      0
    );

    return {
      processogramId,
      message: `Analysis complete: ${elementIds.length} elements processed`,
      elementsFound: elementIds.length,
      elementsAnalyzed: analysis.elements.length,
      descriptionsUpserted,
      questionsUpserted,
    };
  }
}
