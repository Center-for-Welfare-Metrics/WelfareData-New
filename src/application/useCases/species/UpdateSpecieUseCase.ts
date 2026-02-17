import { z } from 'zod';
import { SpecieModel } from '../../../infrastructure/models/SpecieModel';

export const UpdateSpecieSchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  description: z.string().optional(),
});

export type UpdateSpecieInput = z.infer<typeof UpdateSpecieSchema>;

export class UpdateSpecieUseCase {
  async execute(id: string, input: UpdateSpecieInput) {
    const data = UpdateSpecieSchema.parse(input);

    const specie = await SpecieModel.findById(id);
    if (!specie) {
      throw new Error('Specie not found');
    }

    if ('pathname' in input) {
      throw new Error('Cannot update pathname: it is immutable after creation to preserve file integrity');
    }

    if (data.name && data.name !== specie.name) {
      const exists = await SpecieModel.findOne({ name: data.name });
      if (exists) {
        throw new Error('Specie with this name already exists');
      }
    }

    const updated = await SpecieModel.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true, runValidators: true }
    );

    if (!updated) {
      throw new Error('Failed to update specie');
    }

    return {
      _id: updated._id.toString(),
      name: updated.name,
      pathname: updated.pathname,
      description: updated.description,
      creatorId: updated.creatorId,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }
}
