import { ProductionModuleModel } from '../../../infrastructure/models/ProductionModuleModel';

export class ListProductionModulesUseCase {
  async execute(specieId?: string) {
    const filter = specieId ? { specieId } : {};
    const modules = await ProductionModuleModel.find(filter).sort({ name: 1 });

    return modules.map((module) => ({
      id: module._id.toString(),
      name: module.name,
      slug: module.slug,
      description: module.description,
      specieId: module.specieId,
      creatorId: module.creatorId,
      createdAt: module.createdAt,
      updatedAt: module.updatedAt,
    }));
  }
}
