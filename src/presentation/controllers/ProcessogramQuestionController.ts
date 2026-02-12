import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { ListProcessogramQuestionsUseCase } from '../../application/useCases/processogramQuestion/ListProcessogramQuestionsUseCase';
import { UpdateProcessogramQuestionUseCase } from '../../application/useCases/processogramQuestion/UpdateProcessogramQuestionUseCase';

export class ProcessogramQuestionController {
  static async listByProcessogram(req: Request, res: Response) {
    const useCase = new ListProcessogramQuestionsUseCase();
    try {
      const processogramId = req.params.processogramId as string;
      const questions = await useCase.execute(processogramId);
      return res.status(200).json(questions);
    } catch (error: any) {
      if (error.message === 'Processogram not found') {
        return res.status(404).json({ error: error.message });
      }
      console.error('ProcessogramQuestionController.listByProcessogram error:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async update(req: Request, res: Response) {
    const useCase = new UpdateProcessogramQuestionUseCase();
    try {
      const id = req.params.id as string;
      const result = await useCase.execute(id, req.body);
      return res.status(200).json(result);
    } catch (error: any) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: 'Validation Error', details: error.issues });
      }
      if (error.message === 'ProcessogramQuestion not found') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('correctAnswerIndex')) {
        return res.status(400).json({ error: error.message });
      }
      console.error('ProcessogramQuestionController.update error:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}
