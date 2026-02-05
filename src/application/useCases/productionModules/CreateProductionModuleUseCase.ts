import { z } from 'zod';
import { ProductionModuleModel } from '../../../infrastructure/models/ProductionModuleModel';
import { SpecieModel } from '../../../infrastructure/models/SpecieModel';

export const CreateProductionModuleSchema = z.object({
  name: z.string().min(3, 'Name must have at least 3 characters'),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers and hyphens'),
  description: z.string().optional(),
  specieId: z.string(),
  creatorId: z.string(),
});

export type CreateProductionModuleInput = z.infer<typeof CreateProductionModuleSchema>;

export class CreateProductionModuleUseCase {
  async execute(input: CreateProductionModuleInput) {
    const data = CreateProductionModuleSchema.parse(input);

    // Verify specie exists
    const specie = await SpecieModel.findById(data.specieId);
    if (!specie) {
      throw new Error('Specie not found');
    }

    // Check if slug already exists for this specie (compound unique)
    const exists = await ProductionModuleModel.findOne({
      slug: data.slug,
      specieId: data.specieId,
    });
    if (exists) {
      throw new Error('Production module with this slug already exists for this specie');
    }

    const module = await ProductionModuleModel.create({
      name: data.name,
      slug: data.slug,
      description: data.description,
      specieId: data.specieId,
      creatorId: data.creatorId,
    });

    return {
      id: module._id.toString(),
      name: module.name,
      slug: module.slug,
      description: module.description,
      specieId: module.specieId,
      creatorId: module.creatorId,
      createdAt: module.createdAt,
    };
  }
}
