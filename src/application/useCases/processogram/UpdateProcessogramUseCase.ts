import { z } from 'zod';
import { ProcessogramModel } from '../../../infrastructure/models/ProcessogramModel';
import { SpecieModel } from '../../../infrastructure/models/SpecieModel';
import { ProductionModuleModel } from '../../../infrastructure/models/ProductionModuleModel';
import { getSvgProcessor } from '../../../infrastructure/services/svg';
import { getStorageService } from '../../../infrastructure/services/storage';
import { IRasterImage } from '../../../domain/interfaces/IProcessogram';

export const UpdateProcessogramSchema = z.object({
  name: z.string().min(3, 'Name must have at least 3 characters').optional(),
  description: z.string().optional(),
  specieId: z.string().optional(),
  productionModuleId: z.string().optional(),
});

export type UpdateProcessogramInput = z.infer<typeof UpdateProcessogramSchema>;

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

export class UpdateProcessogramUseCase {
  async execute(id: string, input: UpdateProcessogramInput, fileBuffer?: Buffer) {
    const data = UpdateProcessogramSchema.parse(input);

    const processogram = await ProcessogramModel.findById(id);
    if (!processogram) {
      throw new Error('Processogram not found');
    }

    // Resolve specieId and productionModuleId (use existing if not provided)
    const specieId = data.specieId || processogram.specieId;
    const productionModuleId = data.productionModuleId || processogram.productionModuleId;

    // Validate specie if changed
    if (data.specieId && data.specieId !== processogram.specieId) {
      const specie = await SpecieModel.findById(data.specieId);
      if (!specie) {
        throw new Error('Specie not found');
      }
    }

    // Validate production module if changed
    if (data.productionModuleId && data.productionModuleId !== processogram.productionModuleId) {
      const pm = await ProductionModuleModel.findById(data.productionModuleId);
      if (!pm) {
        throw new Error('Production module not found');
      }
      if (pm.specieId !== specieId) {
        throw new Error('Production module does not belong to the specified specie');
      }
    }

    // If name changed, regenerate slug and check uniqueness
    if (data.name && data.name !== processogram.name) {
      const newSlug = slugify(data.name);
      const existing = await ProcessogramModel.findOne({
        productionModuleId,
        slug: newSlug,
        _id: { $ne: id },
      });
      if (existing) {
        throw new Error('Processogram with this name already exists for this production module');
      }
    }

    // File replacement: clean old files from GCS and process new SVG
    if (fileBuffer) {
      const storage = getStorageService();

      // Clean old light SVG
      if (processogram.svg_url_light) {
        await storage.deleteByUrl(processogram.svg_url_light);
      }

      // Clean old light raster images
      if (processogram.raster_images_light) {
        const lightImages = processogram.raster_images_light instanceof Map
          ? processogram.raster_images_light
          : new Map(Object.entries(processogram.raster_images_light));
        for (const [, image] of lightImages) {
          await storage.deleteByUrl(image.src);
        }
      }

      // Resolve paths for upload
      const specie = await SpecieModel.findById(specieId);
      const pm = await ProductionModuleModel.findById(productionModuleId);
      const slug = data.name ? slugify(data.name) : processogram.slug;
      const basePath = `processograms/${specie!.pathname}/${pm!.slug}/${slug}`;

      // Process new SVG
      const svgProcessor = getSvgProcessor();
      const processedSvg = await svgProcessor.process(fileBuffer);

      // Upload optimized SVG
      const svgPath = `${basePath}/light/${slug}.svg`;
      const svgBuffer = Buffer.from(processedSvg.optimizedSvg, 'utf-8');
      const svgUrl = await storage.upload(svgBuffer, svgPath, 'image/svg+xml');

      // Upload raster images
      const rasterImagesLight: Record<string, IRasterImage> = {};

      for (const [elementId, rasterImage] of processedSvg.rasterImages) {
        const imageBuffer = (rasterImage as any)._buffer as Buffer;
        if (!imageBuffer) continue;

        const imagePath = `${basePath}/light/raster/${elementId}.png`;
        const imageUrl = await storage.upload(imageBuffer, imagePath, 'image/png');

        rasterImagesLight[elementId] = {
          src: imageUrl,
          bucket_key: imagePath,
          width: rasterImage.width,
          height: rasterImage.height,
          x: rasterImage.x,
          y: rasterImage.y,
        };
      }

      // Update file fields
      processogram.svg_url_light = svgUrl;
      processogram.svg_bucket_key_light = svgPath;
      processogram.original_name_light = `${slug}.svg`;
      processogram.original_size_light = fileBuffer.length;
      processogram.final_size_light = svgBuffer.length;
      processogram.raster_images_light = rasterImagesLight as any;
      processogram.status = 'ready';
    }

    // Update metadata fields
    if (data.name !== undefined) processogram.name = data.name;
    if (data.description !== undefined) processogram.description = data.description;
    if (data.specieId !== undefined) processogram.specieId = data.specieId;
    if (data.productionModuleId !== undefined) processogram.productionModuleId = data.productionModuleId;

    // Regenerate identifier if relationships or name changed
    if (data.name || data.specieId || data.productionModuleId) {
      const specie = await SpecieModel.findById(processogram.specieId);
      const pm = await ProductionModuleModel.findById(processogram.productionModuleId);
      if (specie && pm) {
        processogram.identifier = `${specie.pathname}-${pm.slug}-${processogram.slug}`;
      }
    }

    await processogram.save();

    return processogram;
  }
}
