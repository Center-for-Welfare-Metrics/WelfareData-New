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
  normalizeSemanticIdsPlugin,
  fixMissingSvgIdPlugin,
  removeBxAttributesPlugin,
  extractInteractiveIds,
} from './plugins';

const PROCESS_TIMEOUT_MS = 300_000; // 5 min max per process() call
const BROWSER_LAUNCH_TIMEOUT_MS = 30_000;
const PAGE_CONTENT_TIMEOUT_MS = 120_000;
const PROTOCOL_TIMEOUT_MS = 180_000;

const BBOX_EXTRACTION_SCRIPT = `
  window.getTransformedBBox = function(elementId) {
    const element = document.getElementById(elementId);
    if (!element) return null;

    try {
      const svg = document.querySelector('svg');
      if (!svg) return null;

      const bbox = element.getBBox();
      const ctm = element.getCTM();
      const svgCtm = svg.getCTM();

      if (!ctm || !svgCtm) {
        return {
          x: bbox.x,
          y: bbox.y,
          width: bbox.width,
          height: bbox.height
        };
      }

      const svgPoint = svg.createSVGPoint();
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
    const suffixPattern = /(?:--|_)(ps|lf|ph|ci)(?:[_-]\\d+[_-]?)?$/;
    const elements = [];

    document.querySelectorAll('[id]').forEach(el => {
      const id = el.id;
      if (suffixPattern.test(id)) {
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
  private getSvgoConfig() {
    return {
      multipass: true,
      plugins: [
        {
          name: 'preset-default',
          params: {
            overrides: {
              cleanupIds: false,
            },
          },
        },
        normalizeSemanticIdsPlugin,
        fixMissingSvgIdPlugin,
        removeBxAttributesPlugin,
      ] as any[],
    };
  }

  private async launchBrowser(): Promise<Browser> {
    return puppeteer.launch({
      headless: true,
      protocolTimeout: PROTOCOL_TIMEOUT_MS,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
      ],
    });
  }

  private async destroyBrowser(browser: Browser | null): Promise<void> {
    if (!browser) return;
    try {
      await browser.close();
    } catch {
      try {
        browser.process()?.kill('SIGKILL');
      } catch {
        // noop
      }
    }
  }

  private optimizeSvg(svgContent: string): string {
    const result = optimize(svgContent, this.getSvgoConfig());
    return result.data;
  }

  private extractMetadata(svgContent: string): SvgMetadata {
    const dom = new JSDOM(svgContent, { contentType: 'image/svg+xml' });
    const svgElement = dom.window.document.querySelector('svg');

    if (!svgElement) {
      throw new Error('Invalid SVG: No SVG element found');
    }

    const viewBox = svgElement.getAttribute('viewBox') || '0 0 1920 1080';
    const width = parseFloat(svgElement.getAttribute('width') || '1920');
    const height = parseFloat(svgElement.getAttribute('height') || '1080');

    const viewBoxParts = viewBox.split(/\s+|,/).map(parseFloat);
    const actualWidth = width || viewBoxParts[2] || 1920;
    const actualHeight = height || viewBoxParts[3] || 1080;

    return {
      width: actualWidth,
      height: actualHeight,
      viewbox: viewBox,
    };
  }

  private async rasterizeElement(
    page: Page,
    elementId: string,
    bbox: { x: number; y: number; width: number; height: number }
  ): Promise<Buffer> {
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

  async process(buffer: Buffer): Promise<ProcessedSvgOutput> {
    const svgContent = buffer.toString('utf-8');

    const optimizedSvg = this.optimizeSvg(svgContent);
    const metadata = this.extractMetadata(optimizedSvg);

    let browser: Browser | null = null;

    const doProcess = async (): Promise<ProcessedSvgOutput> => {
      browser = await this.launchBrowser();
      const page = await browser.newPage();

      try {
        await page.setViewport({
          width: Math.ceil(metadata.width),
          height: Math.ceil(metadata.height),
          deviceScaleFactor: 2,
        });

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

        await page.setContent(htmlContent, {
          waitUntil: 'domcontentloaded',
          timeout: PAGE_CONTENT_TIMEOUT_MS,
        });

        await page.evaluate(BBOX_EXTRACTION_SCRIPT);

        const elements = await page.evaluate(() => {
          return (window as any).getAllRasterizableElements();
        });

        console.log(`[SvgProcessor] Found ${elements.length} rasterizable elements`);

        const rasterImages = new Map<string, IRasterImage>();

        for (const element of elements) {
          try {
            const screenshotBuffer = await this.rasterizeElement(page, element.id, {
              x: element.x,
              y: element.y,
              width: element.width,
              height: element.height,
            });

            const processedBuffer = await sharp(screenshotBuffer)
              .png({ compressionLevel: 9 })
              .toBuffer();

            const rasterImage: IRasterImage = {
              src: '',
              bucket_key: '',
              width: element.width,
              height: element.height,
              x: element.x,
              y: element.y,
            };

            (rasterImage as any)._buffer = processedBuffer;
            rasterImages.set(element.id, rasterImage);
          } catch (error) {
            console.error(`[SvgProcessor] Failed to rasterize element ${element.id}:`, error);
          }
        }

        console.log(`[SvgProcessor] Rasterized ${rasterImages.size}/${elements.length} elements`);

        return { optimizedSvg, rasterImages, metadata };
      } finally {
        await page.close().catch(() => {});
      }
    };

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(
          `SVG processing timed out after ${PROCESS_TIMEOUT_MS / 1000}s`
        )), PROCESS_TIMEOUT_MS);
      });

      const result = await Promise.race([doProcess(), timeoutPromise]);
      return result;
    } catch (error) {
      console.error('[SvgProcessor] Process failed, destroying browser:', error);
      throw error;
    } finally {
      await this.destroyBrowser(browser);
    }
  }
}

export function getSvgProcessor(): SvgProcessorService {
  return new SvgProcessorService();
}

export async function shutdownSvgProcessor(): Promise<void> {
  // noop — each process() now manages its own browser lifecycle
}
