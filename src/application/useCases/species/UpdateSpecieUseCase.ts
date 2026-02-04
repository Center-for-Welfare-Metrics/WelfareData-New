import { z } from 'zod';
import { SpecieModel } from '../../../infrastructure/models/SpecieModel';

export const UpdateSpecieSchema = z.object({
  name: z.string().min(3, 'Name must have at least 3 characters').optional(),
  pathname: z.string().regex(/^[a-z-]+$/, 'Pathname must contain only lowercase letters and hyphens').optional(),
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

    if (data.pathname && data.pathname !== specie.pathname) {
      const exists = await SpecieModel.findOne({ pathname: data.pathname });
      if (exists) {
        throw new Error('Specie with this pathname already exists');
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
      id: updated._id.toString(),
      name: updated.name,
      pathname: updated.pathname,
      description: updated.description,
      creatorId: updated.creatorId,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }
}
