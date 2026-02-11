import { Request, Response } from 'express';
import { AnalyzeProcessogramUseCase } from '../../application/useCases/processogram/AnalyzeProcessogramUseCase';

export class ProcessogramAIController {
  static async analyze(req: Request, res: Response) {
    const useCase = new AnalyzeProcessogramUseCase();
    try {
      const id = req.params.id as string;
      const result = await useCase.execute(id);
      return res.status(200).json(result);
    } catch (error: any) {
      if (error.message === 'Processogram not found') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message === 'Processogram has no SVG file to analyze') {
        return res.status(400).json({ error: error.message });
      }
      if (error.message.includes('GEMINI_API_KEY')) {
        return res.status(503).json({ error: 'AI service not configured' });
      }
      if (error.message.includes('Gemini returned invalid JSON')) {
        return res.status(502).json({ error: 'AI service returned invalid response' });
      }
      console.error('ProcessogramAIController.analyze error:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}
