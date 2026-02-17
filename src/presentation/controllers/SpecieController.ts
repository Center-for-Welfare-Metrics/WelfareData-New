import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { CreateSpecieUseCase } from '../../application/useCases/species/CreateSpecieUseCase';
import { ListSpeciesUseCase } from '../../application/useCases/species/ListSpeciesUseCase';
import { UpdateSpecieUseCase } from '../../application/useCases/species/UpdateSpecieUseCase';
import { DeleteSpecieUseCase } from '../../application/useCases/species/DeleteSpecieUseCase';

export class SpecieController {
  static async create(req: Request, res: Response) {
    const useCase = new CreateSpecieUseCase();
    try {
      const creatorId = req.user?.id;
      if (!creatorId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const specie = await useCase.execute({
        ...req.body,
        creatorId,
      });

      return res.status(201).json(specie);
    } catch (error: any) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: 'Validation Error',
          details: error.issues,
        });
      }
      if (error.message === 'Specie with this pathname already exists') {
        return res.status(409).json({ error: error.message });
      }
      console.error('[SpecieController.create]', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async list(_req: Request, res: Response) {
    const useCase = new ListSpeciesUseCase();
    try {
      const species = await useCase.execute();
      return res.status(200).json(species);
    } catch (error: any) {
      console.error('[SpecieController.list]', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async update(req: Request, res: Response) {
    const useCase = new UpdateSpecieUseCase();
    try {
      const id = req.params.id as string;
      const specie = await useCase.execute(id, req.body);
      return res.status(200).json(specie);
    } catch (error: any) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: 'Validation Error',
          details: error.issues,
        });
      }
      if (error.message === 'Specie not found') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message === 'Specie with this name already exists') {
        return res.status(409).json({ error: error.message });
      }
      if (error.message.includes('Cannot update pathname')) {
        return res.status(400).json({ error: error.message });
      }
      console.error('[SpecieController.update]', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async delete(req: Request, res: Response) {
    const useCase = new DeleteSpecieUseCase();
    try {
      const id = req.params.id as string;
      const result = await useCase.execute(id);
      return res.status(200).json(result);
    } catch (error: any) {
      if (error.message === 'Specie not found') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('Cannot delete specie with associated')) {
        return res.status(409).json({ error: error.message });
      }
      console.error('[SpecieController.delete]', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}
