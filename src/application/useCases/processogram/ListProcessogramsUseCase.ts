import { ProcessogramModel } from '../../../infrastructure/models/ProcessogramModel';

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

    return processograms;
  }
}
