import { SvgParser, ParsedElement } from '../../domain/services/SvgParser';
import { ProcessogramDataModel } from '../../infrastructure/models/ProcessogramDataModel';
import { ProcessogramQuestionModel } from '../../infrastructure/models/ProcessogramQuestionModel';
import { getGeminiService } from '../../infrastructure/services/ai';

export interface ProcessingResult {
  processogramId: string;
  elementsFound: number;
  descriptionsUpserted: number;
  questionsUpserted: number;
  errors: string[];
}

export class ProcessogramProcessor {
  private svgParser = new SvgParser();

  async execute(processogramId: string, svgContent: string): Promise<ProcessingResult> {
    const errors: string[] = [];

    const elements = this.svgParser.parse(svgContent);

    if (elements.length === 0) {
      return {
        processogramId,
        elementsFound: 0,
        descriptionsUpserted: 0,
        questionsUpserted: 0,
        errors: [],
      };
    }

    const gemini = getGeminiService();
    let descriptionsUpserted = 0;
    let questionsUpserted = 0;

    let descriptionsMap = new Map<string, string>();

    try {
      const analysis = await gemini.generateBulkAnalysis(elements);

      const dataOps = analysis.elements.map((el) => ({
        updateOne: {
          filter: { processogramId, elementId: el.elementId },
          update: {
            $set: {
              description: el.description,
              updatedAt: new Date(),
            },
            $setOnInsert: {
              processogramId,
              elementId: el.elementId,
              createdAt: new Date(),
            },
          },
          upsert: true,
        },
      }));

      if (dataOps.length > 0) {
        await ProcessogramDataModel.bulkWrite(dataOps);
        descriptionsUpserted = dataOps.length;
      }

      for (const el of analysis.elements) {
        descriptionsMap.set(el.elementId, el.description);
      }
    } catch (err: any) {
      errors.push(`Description generation failed: ${err.message}`);
    }

    if (descriptionsMap.size > 0) {
      try {
        const elementsWithDescriptions = elements
          .filter((el) => descriptionsMap.has(el.elementId))
          .map((el) => ({
            elementId: el.elementId,
            level: el.level,
            name: el.name,
            parents: el.parents,
            description: descriptionsMap.get(el.elementId)!,
          }));

        const questionsResult = await gemini.generateBulkQuestions(elementsWithDescriptions);

        const questionOps = questionsResult.questions
          .filter((q) => q.options?.length === 4 && typeof q.correctAnswerIndex === 'number')
          .map((q) => ({
            updateOne: {
              filter: { processogramId, elementId: q.elementId },
              update: {
                $set: {
                  question: q.question,
                  options: q.options,
                  correctAnswerIndex: q.correctAnswerIndex,
                  updatedAt: new Date(),
                },
                $setOnInsert: {
                  processogramId,
                  elementId: q.elementId,
                  createdAt: new Date(),
                },
              },
              upsert: true,
            },
          }));

        if (questionOps.length > 0) {
          await ProcessogramQuestionModel.bulkWrite(questionOps);
          questionsUpserted = questionOps.length;
        }
      } catch (err: any) {
        errors.push(`Question generation failed: ${err.message}`);
      }
    }

    return {
      processogramId,
      elementsFound: elements.length,
      descriptionsUpserted,
      questionsUpserted,
      errors,
    };
  }
}
