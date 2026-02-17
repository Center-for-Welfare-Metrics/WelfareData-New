import { z } from 'zod';
import { ProductionModuleModel } from '../../../infrastructure/models/ProductionModuleModel';
import { SpecieModel } from '../../../infrastructure/models/SpecieModel';

function toSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export const CreateProductionModuleSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  specieId: z.string().min(1, 'specieId is required'),
  creatorId: z.string(),
});

export type CreateProductionModuleInput = z.infer<typeof CreateProductionModuleSchema>;

export class CreateProductionModuleUseCase {
  async execute(input: CreateProductionModuleInput) {
    const data = CreateProductionModuleSchema.parse(input);

    const specie = await SpecieModel.findById(data.specieId);
    if (!specie) {
      throw new Error('Specie not found');
    }

    const slug = toSlug(data.name);

    const exists = await ProductionModuleModel.findOne({
      slug,
      specieId: data.specieId,
    });
    if (exists) {
      throw new Error('Production module with this slug already exists for this specie');
    }

    const module = await ProductionModuleModel.create({
      name: data.name,
      slug,
      description: data.description,
      specieId: data.specieId,
      creatorId: data.creatorId,
    });

    return {
      _id: module._id.toString(),
      name: module.name,
      slug: module.slug,
      description: module.description,
      specieId: module.specieId,
      creatorId: module.creatorId,
      createdAt: module.createdAt,
      updatedAt: module.updatedAt,
    };
  }
}
