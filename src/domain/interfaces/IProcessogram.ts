export interface IRasterImage {
  src: string;
  bucket_key: string;
  width: number;
  height: number;
  x: number;
  y: number;
}

export type ProcessogramStatus = 'processing' | 'ready' | 'error' | 'generating';

export interface IProcessogram {
  identifier: string;
  name: string;
  slug: string;
  description?: string;

  // Relationships
  specieId: string;
  productionModuleId: string;

  // Status
  status: ProcessogramStatus;

  // Light Theme Files
  svg_url_light?: string;
  svg_bucket_key_light?: string;
  original_name_light?: string;
  original_size_light?: number;
  final_size_light?: number;

  // Dark Theme Files
  svg_url_dark?: string;
  svg_bucket_key_dark?: string;
  original_name_dark?: string;
  original_size_dark?: number;
  final_size_dark?: number;

  // Raster Images Map (key = element ID, value = image data with coordinates)
  raster_images_light: Record<string, IRasterImage>;
  raster_images_dark: Record<string, IRasterImage>;

  // Creator & Timestamps
  creatorId: string;
  createdAt: Date;
  updatedAt: Date;
}
