import { z } from 'zod';
import { ProcessogramQuestionModel } from '../../../infrastructure/models/ProcessogramQuestionModel';

export const UpdateProcessogramQuestionSchema = z
  .object({
    question: z.string().min(1, 'Question must not be empty').optional(),
    options: z.array(z.string().min(1)).min(2, 'At least 2 options required').optional(),
    correctAnswerIndex: z.number().int().min(0).optional(),
  })
  .refine(
    (data) => {
      if (data.options && data.correctAnswerIndex !== undefined) {
        return data.correctAnswerIndex < data.options.length;
      }
      return true;
    },
    { message: 'correctAnswerIndex must be within options range', path: ['correctAnswerIndex'] }
  );

export type UpdateProcessogramQuestionInput = z.infer<typeof UpdateProcessogramQuestionSchema>;

export class UpdateProcessogramQuestionUseCase {
  async execute(id: string, input: UpdateProcessogramQuestionInput) {
    const data = UpdateProcessogramQuestionSchema.parse(input);

    const record = await ProcessogramQuestionModel.findById(id);
    if (!record) {
      throw new Error('ProcessogramQuestion not found');
    }

    if (data.correctAnswerIndex !== undefined && !data.options) {
      if (data.correctAnswerIndex >= record.options.length) {
        throw new Error('correctAnswerIndex must be within existing options range');
      }
    }

    const updatePayload: Record<string, unknown> = {};
    if (data.question !== undefined) updatePayload.question = data.question;
    if (data.options !== undefined) updatePayload.options = data.options;
    if (data.correctAnswerIndex !== undefined) updatePayload.correctAnswerIndex = data.correctAnswerIndex;

    const updated = await ProcessogramQuestionModel.findByIdAndUpdate(
      id,
      { $set: updatePayload },
      { new: true, runValidators: true }
    );

    return {
      id: updated!._id.toString(),
      processogramId: updated!.processogramId,
      elementId: updated!.elementId,
      question: updated!.question,
      options: updated!.options,
      correctAnswerIndex: updated!.correctAnswerIndex,
      createdAt: updated!.createdAt,
      updatedAt: updated!.updatedAt,
    };
  }
}
