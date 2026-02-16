export type ProcessogramStatus = "processing" | "ready" | "error" | "generating";

export interface RasterImage {
  src: string;
  bucket_key: string;
  width: number;
  height: number;
  x: number;
  y: number;
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
