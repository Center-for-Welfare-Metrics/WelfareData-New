export type ProcessogramStatus = "processing" | "ready" | "error" | "generating";

export type ElementLevel = "production system" | "life-fate" | "phase" | "circumstance" | "unknown";

export interface RasterImage {
  src: string;
  bucket_key: string;
  width: number;
  height: number;
  x: number;
  y: number;
}

export interface ProcessogramElement {
  id: string;
  processogramId: string;
  elementId: string;
  description: string;
  videoUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProcessogramQuestion {
  id: string;
  processogramId: string;
  elementId: string;
  question: string;
  options: string[];
  correctAnswerIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface BreadcrumbItem {
  id: string;
  label: string;
  levelName: ElementLevel;
}

export interface ActiveElementData {
  elementId: string;
  level: ElementLevel;
  label: string;
  description: string;
  parents: BreadcrumbItem[];
  questions: ProcessogramQuestion[];
}

export interface Processogram {
  _id: string;
  identifier: string;
  name: string;
  slug: string;
  description?: string;
  specieId: string;
  productionModuleId: string;
  status: ProcessogramStatus;
  svg_url_light?: string;
  svg_url_dark?: string;
  raster_images_light: Record<string, RasterImage>;
  raster_images_dark: Record<string, RasterImage>;
  creatorId: string;
  createdAt: string;
  updatedAt: string;
}
