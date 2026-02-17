import { z } from 'zod';
import { ProductionModuleModel } from '../../../infrastructure/models/ProductionModuleModel';

export const UpdateProductionModuleSchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  description: z.string().optional(),
});

export type UpdateProductionModuleInput = z.infer<typeof UpdateProductionModuleSchema>;

export class UpdateProductionModuleUseCase {
  async execute(id: string, input: UpdateProductionModuleInput) {
    const data = UpdateProductionModuleSchema.parse(input);

    const module = await ProductionModuleModel.findById(id);
    if (!module) {
      throw new Error('Production module not found');
    }

    if ('slug' in input) {
      throw new Error('Cannot update slug: it is immutable after creation to preserve file integrity');
    }

    if (data.name && data.name !== module.name) {
      const exists = await ProductionModuleModel.findOne({
        name: data.name,
        specieId: module.specieId,
      });
      if (exists) {
        throw new Error('Production module with this name already exists for this specie');
      }
    }

    const updated = await ProductionModuleModel.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true, runValidators: true }
    );

    if (!updated) {
      throw new Error('Failed to update production module');
    }

    return {
      _id: updated._id.toString(),
      name: updated.name,
      slug: updated.slug,
      description: updated.description,
      specieId: updated.specieId,
      creatorId: updated.creatorId,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }
}
