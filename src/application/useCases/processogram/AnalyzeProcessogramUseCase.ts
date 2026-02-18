import { ProcessogramModel } from '../../../infrastructure/models/ProcessogramModel';
import { getStorageService } from '../../../infrastructure/services/storage';
import { ProcessogramProcessor } from '../../services/ProcessogramProcessor';

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

    const processor = new ProcessogramProcessor();
    const result = await processor.execute(processogramId, svgContent);

    return {
      processogramId,
      message: result.elementsFound === 0
        ? 'No analyzable elements found in SVG'
        : `Analysis complete: ${result.elementsFound} elements processed`,
      elementsFound: result.elementsFound,
      descriptionsUpserted: result.descriptionsUpserted,
      questionsUpserted: result.questionsUpserted,
      errors: result.errors,
    };
  }
}
