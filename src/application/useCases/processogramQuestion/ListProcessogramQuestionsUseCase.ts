import { ProcessogramQuestionModel } from '../../../infrastructure/models/ProcessogramQuestionModel';
import { ProcessogramModel } from '../../../infrastructure/models/ProcessogramModel';

export class ListProcessogramQuestionsUseCase {
  async execute(processogramId: string) {
    const processogram = await ProcessogramModel.findById(processogramId);
    if (!processogram) {
      throw new Error('Processogram not found');
    }

    const questions = await ProcessogramQuestionModel.find({ processogramId }).sort({
      elementId: 1,
      createdAt: 1,
    });

    return questions.map((q) => ({
      id: q._id.toString(),
      processogramId: q.processogramId,
      elementId: q.elementId,
      question: q.question,
      options: q.options,
      correctAnswerIndex: q.correctAnswerIndex,
      createdAt: q.createdAt,
      updatedAt: q.updatedAt,
    }));
  }
}
