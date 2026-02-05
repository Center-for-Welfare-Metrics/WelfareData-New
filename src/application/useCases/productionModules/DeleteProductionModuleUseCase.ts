import { ProductionModuleModel } from '../../../infrastructure/models/ProductionModuleModel';

export class DeleteProductionModuleUseCase {
  async execute(id: string) {
    const module = await ProductionModuleModel.findById(id);
    if (!module) {
      throw new Error('Production module not found');
    }

    // TODO: Check if Processograms exist for this production module.
    // If yes, throw Error("Cannot delete production module with associated processograms").
    // This is CRITICAL for referential integrity - the system cannot have orphaned processograms.
    // Implement this check when Processogram model is created:
    // 
    // const hasProcessograms = await ProcessogramModel.exists({ productionModuleId: id });
    // if (hasProcessograms) {
    //   throw new Error('Cannot delete production module with associated processograms');
    // }

    await ProductionModuleModel.findByIdAndDelete(id);

    return {
      message: 'Production module deleted successfully',
      id,
    };
  }
}
