import { ProcessogramModel } from '../../../infrastructure/models/ProcessogramModel';

export class GetProcessogramUseCase {
  async execute(id: string) {
    const processogram = await ProcessogramModel.findById(id)
      .populate('specieId', 'name pathname')
      .populate('productionModuleId', 'name slug')
      .lean();

    if (!processogram) {
      throw new Error('Processogram not found');
    }

    return processogram;
  }
}
