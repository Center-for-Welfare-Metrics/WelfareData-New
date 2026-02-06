import puppeteer, { Browser, Page } from 'puppeteer';
import { optimize } from 'svgo';
import { JSDOM } from 'jsdom';
import sharp from 'sharp';

import {
  ISvgProcessor,
  ProcessedSvgOutput,
  SvgMetadata,
  ExtractedImageData,
} from '../../../application/interfaces/ISvgProcessor';
import { IRasterImage } from '../../../domain/interfaces/IProcessogram';
import {
  fixMissingSvgIdPlugin,
  removeBxAttributesPlugin,
  extractInteractiveIds,
} from './plugins';

// ID prefixes that should be rasterized for the frontend zoom feature
const RASTERIZABLE_PREFIXES = ['--ps', '--lf', '--ph', '--ci'];

/**
 * Browser-injectable script for calculating real bounding boxes
 * This adapts the legacy rasterizeSvg.ts logic for accurate coordinate extraction
 */
const BBOX_EXTRACTION_SCRIPT = `
  window.getTransformedBBox = function(elementId) {
    const element = document.getElementById(elementId);
    if (!element) return null;

    try {
      // Get the SVG root element
      const svg = document.querySelector('svg');
      if (!svg) return null;

      // Get the bounding box in SVG coordinate space
      const bbox = element.getBBox();
      
      // Get the transformation matrix from element to screen
      const ctm = element.getCTM();
      const svgCtm = svg.getCTM();
      
      if (!ctm || !svgCtm) {
        // Fallback to basic bbox if CTM is not available
        return {
          x: bbox.x,
          y: bbox.y,
          width: bbox.width,
          height: bbox.height
        };
      }

      // Calculate the inverse of SVG's CTM to get coordinates relative to SVG viewport
      const svgPoint = svg.createSVGPoint();
      
      // Transform all four corners of the bounding box
      const corners = [
        { x: bbox.x, y: bbox.y },
        { x: bbox.x + bbox.width, y: bbox.y },
        { x: bbox.x + bbox.width, y: bbox.y + bbox.height },
        { x: bbox.x, y: bbox.y + bbox.height }
      ];

      const transformedCorners = corners.map(corner => {
        svgPoint.x = corner.x;
        svgPoint.y = corner.y;
        const transformed = svgPoint.matrixTransform(ctm);
        return { x: transformed.x, y: transformed.y };
      });

      // Calculate bounding box of transformed corners
      const minX = Math.min(...transformedCorners.map(c => c.x));
      const maxX = Math.max(...transformedCorners.map(c => c.x));
      const minY = Math.min(...transformedCorners.map(c => c.y));
      const maxY = Math.max(...transformedCorners.map(c => c.y));

      return {
        x: Math.round(minX),
        y: Math.round(minY),
        width: Math.round(maxX - minX),
        height: Math.round(maxY - minY)
      };
    } catch (error) {
      console.error('Error calculating bbox for', elementId, error);
      return null;
    }
  };

  window.getAllRasterizableElements = function() {
    const prefixes = ['--ps', '--lf', '--ph', '--ci'];
    const elements = [];
    
    document.querySelectorAll('[id]').forEach(el => {
      const id = el.id;
      if (prefixes.some(prefix => id.startsWith(prefix))) {
        const bbox = window.getTransformedBBox(id);
        if (bbox && bbox.width > 0 && bbox.height > 0) {
          elements.push({
            id: id,
            ...bbox
          });
        }
      }
    });
    
    return elements;
  };
`;

export class SvgProcessorService implements ISvgProcessor {
  private browser: Browser | null = null;

  constructor() {}

  /**
   * Get SVGO configuration
   */
  private getSvgoConfig() {
    return {
      multipass: true,
      plugins: [
        'preset-default',
        fixMissingSvgIdPlugin,
        removeBxAttributesPlugin,
      ] as any[],
    };
  }

  /**
   * Initialize the headless browser
   */
  private async initBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
        ],
      });
    }
    return this.browser;
  }

  /**
   * Close the browser when done
   */
  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Optimize SVG using SVGO with custom plugins
   */
  private optimizeSvg(svgContent: string): string {
    const result = optimize(svgContent, this.getSvgoConfig());
    return result.data;
  }

  /**
   * Extract SVG metadata (dimensions, viewbox)
   */
  private extractMetadata(svgContent: string): SvgMetadata {
    const dom = new JSDOM(svgContent, { contentType: 'image/svg+xml' });
    const svgElement = dom.window.document.querySelector('svg');

    if (!svgElement) {
      throw new Error('Invalid SVG: No SVG element found');
    }

    const viewBox = svgElement.getAttribute('viewBox') || '0 0 1920 1080';
    const width = parseFloat(svgElement.getAttribute('width') || '1920');
    const height = parseFloat(svgElement.getAttribute('height') || '1080');

    // Parse viewBox to get actual dimensions if width/height not specified
    const viewBoxParts = viewBox.split(/\s+|,/).map(parseFloat);
    const actualWidth = width || viewBoxParts[2] || 1920;
    const actualHeight = height || viewBoxParts[3] || 1080;

    return {
      width: actualWidth,
      height: actualHeight,
      viewbox: viewBox,
    };
  }

  /**
   * Rasterize an SVG element by taking a screenshot
   */
  private async rasterizeElement(
    page: Page,
    elementId: string,
    bbox: { x: number; y: number; width: number; height: number }
  ): Promise<Buffer> {
    // Add padding to prevent clipping
    const padding = 2;
    const clip = {
      x: Math.max(0, bbox.x - padding),
      y: Math.max(0, bbox.y - padding),
      width: bbox.width + padding * 2,
      height: bbox.height + padding * 2,
    };

    const screenshot = await page.screenshot({
      type: 'png',
      clip,
      omitBackground: true,
    });

    return screenshot as Buffer;
  }

  /**
   * Process an SVG buffer and extract rasterized images with coordinates
   */
  async process(buffer: Buffer): Promise<ProcessedSvgOutput> {
    const svgContent = buffer.toString('utf-8');

    // Step 1: Optimize SVG
    const optimizedSvg = this.optimizeSvg(svgContent);

    // Step 2: Extract metadata
    const metadata = this.extractMetadata(optimizedSvg);

    // Step 3: Initialize browser and create page
    const browser = await this.initBrowser();
    const page = await browser.newPage();

    try {
      // Set viewport to match SVG dimensions
      await page.setViewport({
        width: Math.ceil(metadata.width),
        height: Math.ceil(metadata.height),
        deviceScaleFactor: 2, // High DPI for better quality
      });

      // Create HTML wrapper for the SVG
      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body { background: transparent; overflow: hidden; }
              svg { display: block; }
            </style>
          </head>
          <body>
            ${optimizedSvg}
          </body>
        </html>
      `;

      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

      // Step 4: Inject bbox extraction script
      await page.evaluate(BBOX_EXTRACTION_SCRIPT);

      // Step 5: Get all rasterizable elements with their bounding boxes
      const elements = await page.evaluate(() => {
        return (window as any).getAllRasterizableElements();
      });

      // Step 6: Rasterize each element
      const rasterImages = new Map<string, IRasterImage>();

      for (const element of elements) {
        try {
          const screenshotBuffer = await this.rasterizeElement(page, element.id, {
            x: element.x,
            y: element.y,
            width: element.width,
            height: element.height,
          });

          // Process with sharp for optimization
          const processedBuffer = await sharp(screenshotBuffer)
            .png({ compressionLevel: 9 })
            .toBuffer();

          // The actual upload to GCS and URL generation will happen in the UseCase
          // Here we store the buffer data as base64 temporarily
          const rasterImage: IRasterImage = {
            src: '', // Will be filled after upload
            bucket_key: '', // Will be filled after upload
            width: element.width,
            height: element.height,
            x: element.x,
            y: element.y,
          };

          // Store buffer in a temporary property for later processing
          (rasterImage as any)._buffer = processedBuffer;

          rasterImages.set(element.id, rasterImage);
        } catch (error) {
          console.error(`Failed to rasterize element ${element.id}:`, error);
          // Continue with other elements
        }
      }

      return {
        optimizedSvg,
        rasterImages,
        metadata,
      };
    } finally {
      await page.close();
    }
  }

  /**
   * Process SVG for a specific theme (light/dark)
   * This is a convenience method that wraps process()
   */
  async processForTheme(
    buffer: Buffer,
    theme: 'light' | 'dark'
  ): Promise<ProcessedSvgOutput> {
    // For dark theme, we might need to apply color transformations
    // This can be extended based on requirements
    return this.process(buffer);
  }
}

// Singleton instance for reuse
let processorInstance: SvgProcessorService | null = null;

export function getSvgProcessor(): SvgProcessorService {
  if (!processorInstance) {
    processorInstance = new SvgProcessorService();
  }
  return processorInstance;
}

export async function shutdownSvgProcessor(): Promise<void> {
  if (processorInstance) {
    await processorInstance.closeBrowser();
    processorInstance = null;
  }
}
