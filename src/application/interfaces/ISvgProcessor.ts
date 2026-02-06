import { IRasterImage } from '../../domain/interfaces/IProcessogram';

export interface SvgMetadata {
  width: number;
  height: number;
  viewbox: string;
}

export interface ProcessedSvgOutput {
  optimizedSvg: string;
  rasterImages: Map<string, IRasterImage>;
  metadata: SvgMetadata;
}

/**
 * Interface for SVG Processing Service
 * 
 * This service is responsible for:
 * 1. Optimizing SVG files (SVGO)
 * 2. Extracting raster images from SVG using Puppeteer
 * 3. Calculating coordinates for each extracted image
 * 
 * Implementation will use:
 * - SVGO for SVG optimization
 * - JSDOM for SVG parsing
 * - Puppeteer for screenshot generation
 * - Sharp for image processing
 */
export interface ISvgProcessor {
  /**
   * Process an SVG buffer and extract rasterized images with coordinates
   * @param buffer - Raw SVG file buffer
   * @returns Processed SVG data including optimized SVG, raster images map, and metadata
   */
  process(buffer: Buffer): Promise<ProcessedSvgOutput>;
}

/**
 * Interface for individual image extraction result
 * Used internally by the SVG processor
 */
export interface ExtractedImageData {
  elementId: string;
  buffer: Buffer;
  width: number;
  height: number;
  x: number;
  y: number;
}
