import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { ListProcessogramDataUseCase } from '../../application/useCases/processogramData/ListProcessogramDataUseCase';
import { UpdateProcessogramDataUseCase } from '../../application/useCases/processogramData/UpdateProcessogramDataUseCase';

export class ProcessogramDataController {
  static async listByProcessogram(req: Request, res: Response) {
    const useCase = new ListProcessogramDataUseCase();
    try {
      const processogramId = req.params.processogramId as string;
      const data = await useCase.execute(processogramId);
      return res.status(200).json(data);
    } catch (error: any) {
      if (error.message === 'Processogram not found') {
        return res.status(404).json({ error: error.message });
      }
      console.error('ProcessogramDataController.listByProcessogram error:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async update(req: Request, res: Response) {
    const useCase = new UpdateProcessogramDataUseCase();
    try {
      const id = req.params.id as string;
      const result = await useCase.execute(id, req.body);
      return res.status(200).json(result);
    } catch (error: any) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: 'Validation Error', details: error.issues });
      }
      if (error.message === 'ProcessogramData not found') {
        return res.status(404).json({ error: error.message });
      }
      console.error('ProcessogramDataController.update error:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}
