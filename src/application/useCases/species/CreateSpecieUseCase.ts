import { z } from 'zod';
import { SpecieModel } from '../../../infrastructure/models/SpecieModel';

function toPathname(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export const CreateSpecieSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  creatorId: z.string(),
});

export type CreateSpecieInput = z.infer<typeof CreateSpecieSchema>;

export class CreateSpecieUseCase {
  async execute(input: CreateSpecieInput) {
    const data = CreateSpecieSchema.parse(input);

    const pathname = toPathname(data.name);

    const exists = await SpecieModel.findOne({ pathname });
    if (exists) {
      throw new Error('Specie with this pathname already exists');
    }

    const specie = await SpecieModel.create({
      name: data.name,
      pathname,
      description: data.description,
      creatorId: data.creatorId,
    });

    return {
      _id: specie._id.toString(),
      name: specie.name,
      pathname: specie.pathname,
      description: specie.description,
      creatorId: specie.creatorId,
      createdAt: specie.createdAt,
      updatedAt: specie.updatedAt,
    };
  }
}
