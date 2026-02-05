import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { CreateProductionModuleUseCase } from '../../application/useCases/productionModules/CreateProductionModuleUseCase';
import { ListProductionModulesUseCase } from '../../application/useCases/productionModules/ListProductionModulesUseCase';
import { UpdateProductionModuleUseCase } from '../../application/useCases/productionModules/UpdateProductionModuleUseCase';
import { DeleteProductionModuleUseCase } from '../../application/useCases/productionModules/DeleteProductionModuleUseCase';

export class ProductionModuleController {
  static async create(req: Request, res: Response) {
    const useCase = new CreateProductionModuleUseCase();
    try {
      const creatorId = req.user?.id;
      if (!creatorId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const module = await useCase.execute({
        ...req.body,
        creatorId,
      });

      return res.status(201).json(module);
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
      if (error.message.includes('already exists for this specie')) {
        return res.status(409).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async list(req: Request, res: Response) {
    const useCase = new ListProductionModulesUseCase();
    try {
      const specieId = req.query.specieId as string | undefined;
      const modules = await useCase.execute(specieId);
      return res.status(200).json(modules);
    } catch (error: any) {
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async update(req: Request, res: Response) {
    const useCase = new UpdateProductionModuleUseCase();
    try {
      const id = req.params.id as string;
      const module = await useCase.execute(id, req.body);
      return res.status(200).json(module);
    } catch (error: any) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: 'Validation Error',
          details: error.issues,
        });
      }
      if (error.message === 'Production module not found') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('already exists for this specie')) {
        return res.status(409).json({ error: error.message });
      }
      if (error.message.includes('Cannot update slug')) {
        return res.status(400).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async delete(req: Request, res: Response) {
    const useCase = new DeleteProductionModuleUseCase();
    try {
      const id = req.params.id as string;
      const result = await useCase.execute(id);
      return res.status(200).json(result);
    } catch (error: any) {
      if (error.message === 'Production module not found') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('Cannot delete production module with associated')) {
        return res.status(409).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}
