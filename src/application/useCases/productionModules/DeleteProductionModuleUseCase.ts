import { ProductionModuleModel } from '../../../infrastructure/models/ProductionModuleModel';
import { ProcessogramModel } from '../../../infrastructure/models/ProcessogramModel';

export class DeleteProductionModuleUseCase {
  async execute(id: string) {
    const module = await ProductionModuleModel.findById(id);
    if (!module) {
      throw new Error('Production module not found');
    }

    // CRITICAL: Check if Processograms exist for this production module
    // This prevents orphaned processograms in the system
    const hasProcessograms = await ProcessogramModel.exists({ productionModuleId: id });
    if (hasProcessograms) {
      throw new Error('Cannot delete production module with associated processograms');
    }

    await ProductionModuleModel.findByIdAndDelete(id);

    return {
      message: 'Production module deleted successfully',
      id,
    };
  }
}
