import { z } from 'zod';
import { ProcessogramDataModel } from '../../../infrastructure/models/ProcessogramDataModel';

export const UpdateProcessogramDataSchema = z.object({
  description: z.string().min(1, 'Description must not be empty').optional(),
  videoUrl: z.string().url('videoUrl must be a valid URL').optional().or(z.literal('')),
});

export type UpdateProcessogramDataInput = z.infer<typeof UpdateProcessogramDataSchema>;

export class UpdateProcessogramDataUseCase {
  async execute(id: string, input: UpdateProcessogramDataInput) {
    const data = UpdateProcessogramDataSchema.parse(input);

    const record = await ProcessogramDataModel.findById(id);
    if (!record) {
      throw new Error('ProcessogramData not found');
    }

    const updatePayload: Record<string, unknown> = {};
    if (data.description !== undefined) updatePayload.description = data.description;
    if (data.videoUrl !== undefined) {
      if (data.videoUrl === '') {
        updatePayload.videoUrl = undefined;
      } else {
        updatePayload.videoUrl = data.videoUrl;
      }
    }

    const updated = await ProcessogramDataModel.findByIdAndUpdate(
      id,
      { $set: updatePayload },
      { new: true, runValidators: true }
    );

    return {
      id: updated!._id.toString(),
      processogramId: updated!.processogramId,
      elementId: updated!.elementId,
      description: updated!.description,
      videoUrl: updated!.videoUrl,
      createdAt: updated!.createdAt,
      updatedAt: updated!.updatedAt,
    };
  }
}
