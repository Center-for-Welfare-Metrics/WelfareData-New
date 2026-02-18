import { z } from 'zod';
import { ProcessogramModel } from '../../../infrastructure/models/ProcessogramModel';
import { SpecieModel } from '../../../infrastructure/models/SpecieModel';
import { ProductionModuleModel } from '../../../infrastructure/models/ProductionModuleModel';
import { getSvgProcessor } from '../../../infrastructure/services/svg';
import { getStorageService } from '../../../infrastructure/services/storage';
import { IRasterImage } from '../../../domain/interfaces/IProcessogram';

export const CreateProcessogramSchema = z.object({
  name: z.string().min(3, 'Name must have at least 3 characters'),
  description: z.string().optional(),
  specieId: z.string(),
  productionModuleId: z.string(),
  creatorId: z.string(),
});

export type CreateProcessogramInput = z.infer<typeof CreateProcessogramSchema>;

/**
 * Helper function to generate slug from name
 */
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

export class CreateProcessogramUseCase {
  async execute(input: CreateProcessogramInput, fileBuffer: Buffer) {
    // Step 1: Validate input
    const data = CreateProcessogramSchema.parse(input);

    // Step 2: Verify Specie exists
    const specie = await SpecieModel.findById(data.specieId);
    if (!specie) {
      throw new Error('Specie not found');
    }

    // Step 3: Verify ProductionModule exists and belongs to the specie
    const productionModule = await ProductionModuleModel.findById(data.productionModuleId);
    if (!productionModule) {
      throw new Error('Production module not found');
    }
    if (productionModule.specieId !== data.specieId) {
      throw new Error('Production module does not belong to the specified specie');
    }

    // Step 4: Generate slug and check uniqueness
    const slug = slugify(data.name);
    const existingProcessogram = await ProcessogramModel.findOne({
      productionModuleId: data.productionModuleId,
      slug,
    });
    if (existingProcessogram) {
      throw new Error('Processogram with this name already exists for this production module');
    }

    // Step 5: Process SVG
    const svgProcessor = getSvgProcessor();
    const processedSvg = await svgProcessor.process(fileBuffer);

    // Step 6: Get storage service
    const storage = getStorageService();

    // Build base path for storage: processograms/{specie-slug}/{module-slug}/{processogram-slug}
    const basePath = `processograms/${specie.pathname}/${productionModule.slug}/${slug}`;

    // Step 7: Upload optimized SVG
    const svgPath = `${basePath}/light/${slug}.svg`;
    const svgBuffer = Buffer.from(processedSvg.optimizedSvg, 'utf-8');
    const svgUrl = await storage.upload(svgBuffer, svgPath, 'image/svg+xml');

    // Step 8: Upload raster images
    const rasterImagesLight: Record<string, IRasterImage> = {};

    for (const [elementId, rasterImage] of processedSvg.rasterImages) {
      const imageBuffer = (rasterImage as any)._buffer as Buffer;
      if (!imageBuffer) {
        console.warn(`No buffer found for element ${elementId}, skipping...`);
        continue;
      }

      // Upload PNG to GCS
      const imagePath = `${basePath}/light/raster/${elementId}.png`;
      const imageUrl = await storage.upload(imageBuffer, imagePath, 'image/png');

      // Build final raster image object (without buffer)
      rasterImagesLight[elementId] = {
        src: imageUrl,
        bucket_key: imagePath,
        width: rasterImage.width,
        height: rasterImage.height,
        x: rasterImage.x,
        y: rasterImage.y,
      };
    }

    // Step 9: Generate unique identifier
    const identifier = `${specie.pathname}-${productionModule.slug}-${slug}`;

    // Step 10: Create Processogram document
    const processogram = await ProcessogramModel.create({
      identifier,
      name: data.name,
      slug,
      description: data.description,
      specieId: data.specieId,
      productionModuleId: data.productionModuleId,
      status: 'ready',

      // Light theme files
      svg_url_light: svgUrl,
      svg_bucket_key_light: svgPath,
      original_name_light: `${slug}.svg`,
      original_size_light: fileBuffer.length,
      final_size_light: svgBuffer.length,

      // Raster images for light theme
      raster_images_light: rasterImagesLight,

      // Dark theme (empty for now - can be processed separately)
      raster_images_dark: {},

      // Creator
      creatorId: data.creatorId,
    });

    // Step 11: Return created document
    return {
      _id: processogram._id.toString(),
      identifier: processogram.identifier,
      name: processogram.name,
      slug: processogram.slug,
      description: processogram.description,
      specieId: processogram.specieId,
      productionModuleId: processogram.productionModuleId,
      status: processogram.status,
      svg_url_light: processogram.svg_url_light,
      raster_images_count: Object.keys(rasterImagesLight).length,
      metadata: processedSvg.metadata,
      createdAt: processogram.createdAt,
      updatedAt: processogram.updatedAt,
    };
  }
}
