import { Schema, model, Document } from 'mongoose';
import { IProcessogramData } from '../../domain/interfaces/IProcessogramData';

export interface IProcessogramDataDocument extends IProcessogramData, Document {}

const ProcessogramDataSchema = new Schema<IProcessogramDataDocument>(
  {
    processogramId: { type: String, required: true, ref: 'Processogram', index: true },
    elementId: { type: String, required: true, index: true },
    description: { type: String, required: true },
    videoUrl: { type: String },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

ProcessogramDataSchema.index({ processogramId: 1, elementId: 1 }, { unique: true });

export const ProcessogramDataModel = model<IProcessogramDataDocument>(
  'ProcessogramData',
  ProcessogramDataSchema
);
