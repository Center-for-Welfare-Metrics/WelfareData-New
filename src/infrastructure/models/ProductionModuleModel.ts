import { Schema, model, Document, Types } from 'mongoose';
import { IProductionModule } from '../../domain/interfaces/IProductionModule';

export interface IProductionModuleDocument extends IProductionModule, Document {}

const ProductionModuleSchema = new Schema<IProductionModuleDocument>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    description: { type: String, trim: true },
    specieId: { type: String, required: true, ref: 'Specie', index: true },
    creatorId: { type: String, required: true },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Compound unique index: same slug can exist for different species, but not duplicated within same specie
ProductionModuleSchema.index({ slug: 1, specieId: 1 }, { unique: true });

export const ProductionModuleModel = model<IProductionModuleDocument>('ProductionModule', ProductionModuleSchema);
