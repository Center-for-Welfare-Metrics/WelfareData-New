import { SpecieModel } from '../../../infrastructure/models/SpecieModel';
import { ProductionModuleModel } from '../../../infrastructure/models/ProductionModuleModel';

export class DeleteSpecieUseCase {
  async execute(id: string) {
    const specie = await SpecieModel.findById(id);
    if (!specie) {
      throw new Error('Specie not found');
    }

    // CRITICAL: Check if ProductionModules exist for this specie
    // This prevents orphaned modules in the system
    const hasModules = await ProductionModuleModel.exists({ specieId: id });
    if (hasModules) {
      throw new Error('Cannot delete specie with associated production modules');
    }

    await SpecieModel.findByIdAndDelete(id);

    return {
      message: 'Specie deleted successfully',
      _id: id,
    };
  }
}
