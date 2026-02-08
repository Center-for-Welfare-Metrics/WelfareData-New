import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { CreateProcessogramUseCase } from '../../application/useCases/processogram/CreateProcessogramUseCase';
import { UPLOAD_ERRORS } from '../../infrastructure/config/upload';

export class ProcessogramController {
  static async create(req: Request, res: Response) {
    const useCase = new CreateProcessogramUseCase();

    try {
      // Validate file presence
      if (!req.file) {
        return res.status(400).json({ error: UPLOAD_ERRORS.NO_FILE });
      }

      // Get creator ID from authenticated user
      const creatorId = req.user?.id;
      if (!creatorId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Execute use case
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
      // Handle Zod validation errors
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: 'Validation Error',
          details: error.issues,
        });
      }

      // Handle not found errors
      if (
        error.message === 'Specie not found' ||
        error.message === 'Production module not found'
      ) {
        return res.status(404).json({ error: error.message });
      }

      // Handle conflict errors
      if (
        error.message.includes('already exists') ||
        error.message.includes('does not belong')
      ) {
        return res.status(409).json({ error: error.message });
      }

      // Handle multer errors
      if (error.message.includes('File too large')) {
        return res.status(413).json({ error: UPLOAD_ERRORS.FILE_TOO_LARGE });
      }

      if (error.message.includes('Invalid file type')) {
        return res.status(415).json({ error: UPLOAD_ERRORS.INVALID_TYPE });
      }

      // Log unexpected errors
      console.error('ProcessogramController.create error:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}
