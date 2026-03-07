import { ProcessogramModel } from '../../../infrastructure/models/ProcessogramModel';

/**
 * Converte um Mongoose Map para plain object.
 * @see GetProcessogramUseCase.ts — mesma razão.
 */
function mapToRecord(value: unknown): Record<string, unknown> {
  if (value instanceof Map) {
    return Object.fromEntries(value);
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export class ListProcessogramsUseCase {
  async execute(filters: { specieId?: string; productionModuleId?: string } = {}) {
    const query: Record<string, string> = {};

    if (filters.specieId) {
      query.specieId = filters.specieId;
    }
    if (filters.productionModuleId) {
      query.productionModuleId = filters.productionModuleId;
    }

    const processograms = await ProcessogramModel.find(query)
      .populate('specieId', 'name pathname')
      .populate('productionModuleId', 'name slug')
      .sort({ createdAt: -1 })
      .lean();

    return processograms.map((doc) => ({
      ...doc,
      raster_images_light: mapToRecord(doc.raster_images_light),
      raster_images_dark: mapToRecord(doc.raster_images_dark),
    }));
  }
}
