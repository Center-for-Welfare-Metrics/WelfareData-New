import { ProcessogramDataModel } from '../../../infrastructure/models/ProcessogramDataModel';
import { ProcessogramModel } from '../../../infrastructure/models/ProcessogramModel';

export class ListProcessogramDataUseCase {
  async execute(processogramId: string) {
    const processogram = await ProcessogramModel.findById(processogramId);
    if (!processogram) {
      throw new Error('Processogram not found');
    }

    const data = await ProcessogramDataModel.find({ processogramId }).sort({ elementId: 1 });

    return data.map((item) => ({
      id: item._id.toString(),
      processogramId: item.processogramId,
      elementId: item.elementId,
      description: item.description,
      videoUrl: item.videoUrl,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));
  }
}
