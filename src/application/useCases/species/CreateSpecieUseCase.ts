import { z } from 'zod';
import { SpecieModel } from '../../../infrastructure/models/SpecieModel';

export const CreateSpecieSchema = z.object({
  name: z.string().min(3, 'Name must have at least 3 characters'),
  pathname: z.string().regex(/^[a-z-]+$/, 'Pathname must contain only lowercase letters and hyphens'),
  description: z.string().optional(),
  creatorId: z.string(),
});

export type CreateSpecieInput = z.infer<typeof CreateSpecieSchema>;

export class CreateSpecieUseCase {
  async execute(input: CreateSpecieInput) {
    const data = CreateSpecieSchema.parse(input);

    const exists = await SpecieModel.findOne({ pathname: data.pathname });
    if (exists) {
      throw new Error('Specie with this pathname already exists');
    }

    const specie = await SpecieModel.create({
      name: data.name,
      pathname: data.pathname,
      description: data.description,
      creatorId: data.creatorId,
    });

    return {
      id: specie._id.toString(),
      name: specie.name,
      pathname: specie.pathname,
      description: specie.description,
      creatorId: specie.creatorId,
      createdAt: specie.createdAt,
    };
  }
}
