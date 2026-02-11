import { GoogleGenerativeAI } from '@google/generative-ai';

interface ElementAnalysis {
  elementId: string;
  description: string;
  questions: {
    question: string;
    options: string[];
    correctAnswerIndex: number;
  }[];
}

export interface BulkAnalysisResult {
  elements: ElementAnalysis[];
}

export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private modelName = 'gemini-1.5-flash';

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('FATAL: Missing GEMINI_API_KEY environment variable');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async generateBulkAnalysis(
    context: string,
    elementIds: string[]
  ): Promise<BulkAnalysisResult> {
    const model = this.genAI.getGenerativeModel({
      model: this.modelName,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.4,
      },
    });

    const prompt = `Você é um especialista veterinário em bem-estar animal e sistemas de produção pecuária.

Dado o contexto do processograma abaixo e a lista de IDs de elementos técnicos, gere um JSON com a análise de cada elemento.

CONTEXTO DO PROCESSOGRAMA:
${context}

LISTA DE ELEMENT IDs PARA ANALISAR:
${JSON.stringify(elementIds)}

REGRAS:
- Cada "description" deve ser técnica, concisa e ter no máximo 60 palavras, explicando a função ou fase que o elemento representa no fluxo de bem-estar animal.
- Cada elemento deve ter exatamente 3 perguntas de quiz técnico (múltipla escolha com 4 opções).
- "correctAnswerIndex" é o índice (0-3) da resposta correta no array "options".
- Se o ID do elemento não for reconhecível, deduza pelo padrão: "--ps" = processo/etapa, "--lf" = fluxo lógico, "--ph" = fase, "--ci" = indicador crítico.
- Responda APENAS com o JSON, sem texto adicional.

FORMATO DE SAÍDA (JSON):
{
  "elements": [
    {
      "elementId": "string",
      "description": "string (max 60 palavras)",
      "questions": [
        {
          "question": "string",
          "options": ["string", "string", "string", "string"],
          "correctAnswerIndex": 0
        }
      ]
    }
  ]
}`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    try {
      return JSON.parse(text) as BulkAnalysisResult;
    } catch {
      throw new Error(`Gemini returned invalid JSON: ${text.slice(0, 200)}`);
    }
  }
}

let geminiInstance: GeminiService | null = null;

export function getGeminiService(): GeminiService {
  if (!geminiInstance) {
    geminiInstance = new GeminiService();
  }
  return geminiInstance;
}
