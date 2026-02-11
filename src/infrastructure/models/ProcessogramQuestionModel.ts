import { Schema, model, Document } from 'mongoose';
import { IProcessogramQuestion } from '../../domain/interfaces/IProcessogramQuestion';

export interface IProcessogramQuestionDocument extends IProcessogramQuestion, Document {}

const ProcessogramQuestionSchema = new Schema<IProcessogramQuestionDocument>(
  {
    processogramId: { type: String, required: true, ref: 'Processogram', index: true },
    elementId: { type: String, required: true, index: true },
    question: { type: String, required: true },
    options: { type: [String], required: true },
    correctAnswerIndex: { type: Number, required: true },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

ProcessogramQuestionSchema.index({ processogramId: 1, elementId: 1 });

export const ProcessogramQuestionModel = model<IProcessogramQuestionDocument>(
  'ProcessogramQuestion',
  ProcessogramQuestionSchema
);
