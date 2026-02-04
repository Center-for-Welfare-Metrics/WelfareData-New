import { Schema, model, Document } from 'mongoose';
import { ISpecie } from '../../domain/interfaces/ISpecie';

export interface ISpecieDocument extends ISpecie, Document {}

const SpecieSchema = new Schema<ISpecieDocument>(
  {
    name: { type: String, required: true, trim: true, index: true },
    pathname: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    description: { type: String, trim: true },
    creatorId: { type: String, required: true },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

export const SpecieModel = model<ISpecieDocument>('Specie', SpecieSchema);
