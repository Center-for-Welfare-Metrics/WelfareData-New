import { Schema, model, Document } from 'mongoose';
import { IProcessogram, IRasterImage, ProcessogramStatus } from '../../domain/interfaces/IProcessogram';

export interface IProcessogramDocument extends IProcessogram, Document {}

// Sub-schema for raster images
const RasterImageSchema = new Schema<IRasterImage>(
  {
    src: { type: String, required: true },
    bucket_key: { type: String, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
  },
  { _id: false }
);

const ProcessogramSchema = new Schema<IProcessogramDocument>(
  {
    identifier: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    description: { type: String, trim: true },

    // Relationships
    specieId: { type: String, required: true, ref: 'Specie', index: true },
    productionModuleId: { type: String, required: true, ref: 'ProductionModule', index: true },

    // Status
    status: {
      type: String,
      enum: ['processing', 'ready', 'error', 'generating'] as ProcessogramStatus[],
      default: 'processing',
      required: true,
    },

    // Light Theme Files
    svg_url_light: { type: String },
    svg_bucket_key_light: { type: String },
    original_name_light: { type: String },
    original_size_light: { type: Number },
    final_size_light: { type: Number },

    // Dark Theme Files
    svg_url_dark: { type: String },
    svg_bucket_key_dark: { type: String },
    original_name_dark: { type: String },
    original_size_dark: { type: Number },
    final_size_dark: { type: Number },

    // Raster Images Maps (key = element ID)
    raster_images_light: { type: Map, of: RasterImageSchema, default: {} },
    raster_images_dark: { type: Map, of: RasterImageSchema, default: {} },

    // Creator
    creatorId: { type: String, required: true },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Compound unique index: same slug can exist for different production modules
ProcessogramSchema.index({ productionModuleId: 1, slug: 1 }, { unique: true });

// Helper function to generate slug from name
function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

// Pre-save hook: generate slug from name if name is modified
ProcessogramSchema.pre('save', function () {
  if (this.isModified('name') || this.isNew) {
    this.slug = slugify(this.name);
  }
});

export const ProcessogramModel = model<IProcessogramDocument>('Processogram', ProcessogramSchema);
