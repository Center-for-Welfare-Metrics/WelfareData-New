import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { StreamChatUseCase } from '../../application/useCases/chat/StreamChatUseCase';

export class ChatController {
  static async stream(req: Request, res: Response) {
    const useCase = new StreamChatUseCase();

    let input;
    try {
      input = {
        processogramId: req.body.processogramId,
        message: req.body.message,
        history: req.body.history ?? [],
      };
    } catch {
      return res.status(400).json({ error: 'Invalid request body' });
    }

    let streamResult;
    try {
      streamResult = await useCase.execute(input);
    } catch (error: any) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: 'Validation Error', details: error.issues });
      }
      if (error.message === 'Processogram not found') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('GEMINI_API_KEY')) {
        return res.status(503).json({ error: 'AI service not configured' });
      }
      console.error('ChatController.stream error:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    let clientDisconnected = false;
    req.on('close', () => {
      clientDisconnected = true;
    });

    try {
      for await (const chunk of streamResult.stream) {
        if (clientDisconnected) break;
        const text = chunk.text();
        if (text) {
          res.write(`data: ${JSON.stringify({ text })}\n\n`);
        }
      }

      if (!clientDisconnected) {
        res.write('data: [DONE]\n\n');
      }
    } catch (error: any) {
      if (!clientDisconnected) {
        console.error('ChatController.stream streaming error:', error);
        res.write(`data: ${JSON.stringify({ error: 'Stream interrupted' })}\n\n`);
      }
    } finally {
      if (!clientDisconnected) {
        res.end();
      }
    }
  }
}
