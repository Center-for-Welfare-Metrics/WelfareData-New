import { SpecieModel } from '../../../infrastructure/models/SpecieModel';

export class ListSpeciesUseCase {
  async execute() {
    const species = await SpecieModel.find().sort({ name: 1 });

    return species.map((specie) => ({
      _id: specie._id.toString(),
      name: specie.name,
      pathname: specie.pathname,
      description: specie.description,
      creatorId: specie.creatorId,
      createdAt: specie.createdAt,
      updatedAt: specie.updatedAt,
    }));
  }
}
