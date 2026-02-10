import { ProcessogramModel } from '../../../infrastructure/models/ProcessogramModel';
import { getStorageService } from '../../../infrastructure/services/storage';

export class DeleteProcessogramUseCase {
  async execute(id: string) {
    const processogram = await ProcessogramModel.findById(id);
    if (!processogram) {
      throw new Error('Processogram not found');
    }

    const storage = getStorageService();

    // Delete SVG files from storage
    if (processogram.svg_url_light) {
      await storage.deleteByUrl(processogram.svg_url_light);
    }
    if (processogram.svg_url_dark) {
      await storage.deleteByUrl(processogram.svg_url_dark);
    }

    // Delete all light raster images
    if (processogram.raster_images_light) {
      const lightImages = processogram.raster_images_light instanceof Map
        ? processogram.raster_images_light
        : new Map(Object.entries(processogram.raster_images_light));
      for (const [, image] of lightImages) {
        await storage.deleteByUrl(image.src);
      }
    }

    // Delete all dark raster images
    if (processogram.raster_images_dark) {
      const darkImages = processogram.raster_images_dark instanceof Map
        ? processogram.raster_images_dark
        : new Map(Object.entries(processogram.raster_images_dark));
      for (const [, image] of darkImages) {
        await storage.deleteByUrl(image.src);
      }
    }

    await processogram.deleteOne();

    return { message: 'Processogram and all associated files deleted successfully' };
  }
}
