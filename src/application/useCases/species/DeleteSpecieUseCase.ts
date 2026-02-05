import { SpecieModel } from '../../../infrastructure/models/SpecieModel';

export class DeleteSpecieUseCase {
  async execute(id: string) {
    const specie = await SpecieModel.findById(id);
    if (!specie) {
      throw new Error('Specie not found');
    }

    // TODO: Check if ProductionModules exist for this specie. 
    // If yes, throw Error("Cannot delete specie with associated modules").
    // This is CRITICAL for referential integrity - the system cannot have orphaned modules.
    // Implement this check when ProductionModule model is created:
    // 
    // const hasModules = await ProductionModuleModel.exists({ specieId: id });
    // if (hasModules) {
    //   throw new Error('Cannot delete specie with associated production modules');
    // }

    await SpecieModel.findByIdAndDelete(id);

    return {
      message: 'Specie deleted successfully',
      id,
    };
  }
}
