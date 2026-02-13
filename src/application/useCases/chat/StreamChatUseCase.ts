import { z } from 'zod';
import { ProcessogramDataModel } from '../../../infrastructure/models/ProcessogramDataModel';
import { ProcessogramModel } from '../../../infrastructure/models/ProcessogramModel';
import { getGeminiService, ChatMessage } from '../../../infrastructure/services/ai';

const ChatMessageSchema = z.object({
  role: z.enum(['user', 'model']),
  parts: z.string().min(1),
});

export const StreamChatSchema = z.object({
  processogramId: z.string().min(1, 'processogramId is required'),
  message: z.string().min(1, 'message is required'),
  history: z.array(ChatMessageSchema).default([]),
});

export type StreamChatInput = z.infer<typeof StreamChatSchema>;

export class StreamChatUseCase {
  async execute(input: StreamChatInput) {
    const data = StreamChatSchema.parse(input);

    const processogram = await ProcessogramModel.findById(data.processogramId);
    if (!processogram) {
      throw new Error('Processogram not found');
    }

    const descriptions = await ProcessogramDataModel.find({
      processogramId: data.processogramId,
    }).sort({ elementId: 1 });

    let context: string;

    if (descriptions.length === 0) {
      context =
        'Você é um especialista em bem-estar animal e sistemas de produção. ' +
        'O usuário está visualizando um diagrama de processograma, mas ainda não há descrições técnicas geradas para os elementos. ' +
        'Informe educadamente que os dados ainda não foram processados e responda de forma genérica com base no seu conhecimento.';
    } else {
      const elementsList = descriptions
        .map((d) => `- [${d.elementId}]: ${d.description}`)
        .join('\n');

      context =
        'Você é um especialista em bem-estar animal e sistemas de produção. ' +
        'O usuário está visualizando um diagrama de processograma com os seguintes elementos técnicos:\n\n' +
        elementsList +
        '\n\nResponda com base nesses dados técnicos. Seja preciso, objetivo e cite os elementos pelo nome quando relevante. ' +
        'Se a pergunta do usuário não tiver relação com os dados do diagrama, responda educadamente que seu foco é auxiliar na compreensão do processograma.';
    }

    const gemini = getGeminiService();
    const history: ChatMessage[] = data.history.map((h) => ({
      role: h.role,
      parts: h.parts,
    }));

    return gemini.streamChat(context, data.message, history);
  }
}
