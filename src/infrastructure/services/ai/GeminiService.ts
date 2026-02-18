import { GoogleGenerativeAI, Content } from '@google/generative-ai';
import { buildDescriptionPrompt, buildQuestionsPrompt } from './prompts';

export interface ElementInput {
  elementId: string;
  level: string;
  name: string;
  parents: string;
}

interface ElementAnalysis {
  elementId: string;
  description: string;
}

export interface BulkAnalysisResult {
  elements: ElementAnalysis[];
}

export interface ElementQuestion {
  elementId: string;
  question: string;
  options: string[];
  correctAnswerIndex: number;
}

export interface BulkQuestionsResult {
  questions: ElementQuestion[];
}

export interface ChatMessage {
  role: 'user' | 'model';
  parts: string;
}

export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private modelName = 'gemini-2.5-flash';

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('FATAL: Missing GEMINI_API_KEY environment variable');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async generateBulkAnalysis(elements: ElementInput[]): Promise<BulkAnalysisResult> {
    const model = this.genAI.getGenerativeModel({
      model: this.modelName,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.4,
      },
    });

    const elementsPayload = elements.map((el) => ({
      elementId: el.elementId,
      level: el.level,
      name: el.name,
      parents: el.parents,
    }));

    const prompt = buildDescriptionPrompt(elementsPayload);
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    try {
      return JSON.parse(text) as BulkAnalysisResult;
    } catch {
      throw new Error(`Gemini returned invalid JSON (descriptions): ${text.slice(0, 200)}`);
    }
  }

  async generateBulkQuestions(
    elementsWithDescriptions: {
      elementId: string;
      level: string;
      name: string;
      parents: string;
      description: string;
    }[]
  ): Promise<BulkQuestionsResult> {
    const model = this.genAI.getGenerativeModel({
      model: this.modelName,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.5,
      },
    });

    const prompt = buildQuestionsPrompt(elementsWithDescriptions);
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    try {
      return JSON.parse(text) as BulkQuestionsResult;
    } catch {
      throw new Error(`Gemini returned invalid JSON (questions): ${text.slice(0, 200)}`);
    }
  }

  async streamChat(context: string, userMessage: string, history: ChatMessage[]) {
    const model = this.genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { temperature: 0.3 },
      systemInstruction: context,
    });

    const chatHistory: Content[] = history.map((msg) => ({
      role: msg.role,
      parts: [{ text: msg.parts }],
    }));

    const chat = model.startChat({ history: chatHistory });
    const result = await chat.sendMessageStream(userMessage);
    return result;
  }
}

let geminiInstance: GeminiService | null = null;

export function getGeminiService(): GeminiService {
  if (!geminiInstance) {
    geminiInstance = new GeminiService();
  }
  return geminiInstance;
}
