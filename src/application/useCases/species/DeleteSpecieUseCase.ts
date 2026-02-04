import { SpecieModel } from '../../../infrastructure/models/SpecieModel';

export class DeleteSpecieUseCase {
  async execute(id: string) {
    const specie = await SpecieModel.findById(id);
    if (!specie) {
      throw new Error('Specie not found');
    }

    await SpecieModel.findByIdAndDelete(id);

    return {
      message: 'Specie deleted successfully',
      id,
    };
  }
}
