import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { CreateProcessogramUseCase } from '../../application/useCases/processogram/CreateProcessogramUseCase';
import { ListProcessogramsUseCase } from '../../application/useCases/processogram/ListProcessogramsUseCase';
import { GetProcessogramUseCase } from '../../application/useCases/processogram/GetProcessogramUseCase';
import { UpdateProcessogramUseCase } from '../../application/useCases/processogram/UpdateProcessogramUseCase';
import { DeleteProcessogramUseCase } from '../../application/useCases/processogram/DeleteProcessogramUseCase';
import { UPLOAD_ERRORS } from '../../infrastructure/config/upload';

export class ProcessogramController {
  static async create(req: Request, res: Response) {
    const useCase = new CreateProcessogramUseCase();

    try {
      if (!req.file) {
        return res.status(400).json({ error: UPLOAD_ERRORS.NO_FILE });
      }

      const creatorId = req.user?.id;
      if (!creatorId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const processogram = await useCase.execute(
        {
          name: req.body.name,
          description: req.body.description,
          specieId: req.body.specieId,
          productionModuleId: req.body.productionModuleId,
          creatorId,
        },
        req.file.buffer
      );

      return res.status(201).json(processogram);
    } catch (error: any) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: 'Validation Error',
          details: error.issues,
        });
      }

      if (
        error.message === 'Specie not found' ||
        error.message === 'Production module not found'
      ) {
        return res.status(404).json({ error: error.message });
      }

      if (
        error.message.includes('already exists') ||
        error.message.includes('does not belong')
      ) {
        return res.status(409).json({ error: error.message });
      }

      if (error.message.includes('File too large')) {
        return res.status(413).json({ error: UPLOAD_ERRORS.FILE_TOO_LARGE });
      }

      if (error.message.includes('Invalid file type')) {
        return res.status(415).json({ error: UPLOAD_ERRORS.INVALID_TYPE });
      }

      console.error('ProcessogramController.create error:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async list(req: Request, res: Response) {
    const useCase = new ListProcessogramsUseCase();
    try {
      const processograms = await useCase.execute({
        specieId: req.query.specieId as string | undefined,
        productionModuleId: req.query.productionModuleId as string | undefined,
      });
      return res.status(200).json(processograms);
    } catch (error: any) {
      console.error('ProcessogramController.list error:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async show(req: Request, res: Response) {
    const useCase = new GetProcessogramUseCase();
    try {
      const id = req.params.id as string;
      const processogram = await useCase.execute(id);
      return res.status(200).json(processogram);
    } catch (error: any) {
      if (error.message === 'Processogram not found') {
        return res.status(404).json({ error: error.message });
      }
      console.error('ProcessogramController.show error:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async delete(req: Request, res: Response) {
    const useCase = new DeleteProcessogramUseCase();
    try {
      const id = req.params.id as string;
      const result = await useCase.execute(id);
      return res.status(200).json(result);
    } catch (error: any) {
      if (error.message === 'Processogram not found') {
        return res.status(404).json({ error: error.message });
      }
      console.error('ProcessogramController.delete error:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async update(req: Request, res: Response) {
    const useCase = new UpdateProcessogramUseCase();
    try {
      const id = req.params.id as string;
      const processogram = await useCase.execute(
        id,
        req.body,
        req.file?.buffer
      );
      return res.status(200).json(processogram);
    } catch (error: any) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: 'Validation Error',
          details: error.issues,
        });
      }
      if (error.message === 'Processogram not found') {
        return res.status(404).json({ error: error.message });
      }
      if (
        error.message === 'Specie not found' ||
        error.message === 'Production module not found'
      ) {
        return res.status(404).json({ error: error.message });
      }
      if (
        error.message.includes('already exists') ||
        error.message.includes('does not belong')
      ) {
        return res.status(409).json({ error: error.message });
      }
      console.error('ProcessogramController.update error:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}
