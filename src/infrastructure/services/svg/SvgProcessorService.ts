import puppeteer, { Browser, Page } from 'puppeteer';
import { JSDOM } from 'jsdom';
import sharp from 'sharp';
import { Worker } from 'worker_threads';
import path from 'path';

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
  private getSvgoConfig(svgSize: number) {
    // Disable multipass for large SVGs (>1MB) — single pass already removes ~95%
    // of unnecessary data. Multipass on large files blocks the event loop for minutes.
    const useMultipass = svgSize < 1_000_000;

    return {
      multipass: useMultipass,
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
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
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

  /**
   * Run SVGO in a Worker Thread to avoid blocking the event loop.
   * The optimize() call is pure CPU (string → string) with no I/O,
   * making it a perfect candidate for worker_threads.
   */
  private optimizeSvg(svgContent: string): Promise<string> {
    const useMultipass = svgContent.length < 1_000_000;
    console.log(`⏱️ [SvgProcessor] SVGO config: multipass=${useMultipass}, inputSize=${svgContent.length}`);
    console.log(`⏱️ [SvgProcessor] SVGO optimize() STARTING in Worker Thread...`);
    const startMs = Date.now();

    // Resolve worker path — ts-node-dev transpiles .ts on-the-fly
    const workerPath = path.resolve(__dirname, 'svgo.worker.ts');

    return new Promise((resolve, reject) => {
      const worker = new Worker(workerPath, {
        execArgv: ['--require', 'ts-node/register/transpile-only'],
      });

      // Safety timeout: kill worker if SVGO takes too long (5 min)
      const timeout = setTimeout(() => {
        worker.terminate();
        reject(new Error(`SVGO worker timed out after ${PROCESS_TIMEOUT_MS / 1000}s`));
      }, PROCESS_TIMEOUT_MS);

      worker.on('message', (msg: { success: boolean; data?: string; error?: string }) => {
        clearTimeout(timeout);
        worker.terminate();
        if (msg.success) {
          console.log(`⏱️ [SvgProcessor] SVGO optimize() FINISHED in ${Date.now() - startMs}ms, output=${msg.data!.length} bytes`);
          resolve(msg.data!);
        } else {
          console.error(`🔴 [SvgProcessor] SVGO optimize() FAILED in ${Date.now() - startMs}ms:`, msg.error);
          reject(new Error(`SVGO optimization failed: ${msg.error}`));
        }
      });

      worker.on('error', (err: Error) => {
        clearTimeout(timeout);
        console.error(`🔴 [SvgProcessor] SVGO Worker error after ${Date.now() - startMs}ms:`, err.message);
        reject(err);
      });

      worker.on('exit', (code) => {
        if (code !== 0 && code !== 1) {
          clearTimeout(timeout);
          reject(new Error(`SVGO Worker exited with code ${code}`));
        }
      });

      // Send only serializable data — the Worker reconstructs the full
      // SVGO config with plugins internally
      worker.postMessage({ svgContent, multipass: useMultipass, svgSize: svgContent.length });
    });
  }

  private extractMetadata(svgContent: string): SvgMetadata {
    const dom = new JSDOM(svgContent, { contentType: 'image/svg+xml' });
    const svgElement = dom.window.document.querySelector('svg');

    if (!svgElement) {
      throw new Error('Invalid SVG: No SVG element found');
    }

    const viewBox = svgElement.getAttribute('viewBox') || '0 0 1920 1080';
    const viewBoxParts = viewBox.split(/\s+|,/).map(parseFloat);

    const width = parseFloat(svgElement.getAttribute('width')!) || viewBoxParts[2] || 1920;
    const height = parseFloat(svgElement.getAttribute('height')!) || viewBoxParts[3] || 1080;

    return {
      width,
      height,
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
    console.log(`⏱️ [SvgProcessor] process() ENTERED, buffer size: ${buffer.length}`);
    const svgContent = buffer.toString('utf-8');
    console.log(`⏱️ [SvgProcessor] Input SVG: ${svgContent.length} chars`);
    console.log(`⏱️ [SvgProcessor] Calling optimizeSvg()...`);

    console.time('svgo');
    const optimizedSvg = await this.optimizeSvg(svgContent);
    console.timeEnd('svgo');
    console.log(`⏱️ [SvgProcessor] Optimized SVG: ${optimizedSvg.length} bytes`);

    const metadata = this.extractMetadata(optimizedSvg);
    console.log(`⏱️ [SvgProcessor] Metadata: ${JSON.stringify(metadata)}`);

    let browser: Browser | null = null;

    const doProcess = async (): Promise<ProcessedSvgOutput> => {
      console.time('browserLaunch');
      browser = await this.launchBrowser();
      console.timeEnd('browserLaunch');

      const page = await browser.newPage();

      try {
        await page.setViewport({
          width: Math.ceil(metadata.width),
          height: Math.ceil(metadata.height),
          deviceScaleFactor: 2,
        });
        console.log(`⏱️ [SvgProcessor] Viewport: ${Math.ceil(metadata.width)}x${Math.ceil(metadata.height)} @2x`);

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

        console.time('setContent');
        await page.setContent(htmlContent, {
          waitUntil: 'domcontentloaded',
          timeout: PAGE_CONTENT_TIMEOUT_MS,
        });
        console.timeEnd('setContent');

        await page.evaluate(BBOX_EXTRACTION_SCRIPT);

        const elements = await page.evaluate(() => {
          return (window as any).getAllRasterizableElements();
        });

        console.log(`[SvgProcessor] Found ${elements.length} rasterizable elements`);
        console.time('rasterizeAll');

        const rasterImages = new Map<string, IRasterImage>();
        let rasterCount = 0;

        for (const element of elements) {
          try {
            rasterCount++;
            // Sanitize dots in element IDs — Mongoose Map keys cannot contain "."
            const safeId = element.id.replace(/\./g, '_');
            if (rasterCount % 25 === 0 || rasterCount === 1) {
              console.log(`⏱️ [SvgProcessor] Rasterizing ${rasterCount}/${elements.length}: ${safeId}`);
            }
            const screenshotBuffer = await this.rasterizeElement(page, element.id, {
              x: element.x,
              y: element.y,
              width: element.width,
              height: element.height,
            });

            const processedBuffer = await sharp(screenshotBuffer)
              .png({ compressionLevel: 6 })
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
            rasterImages.set(safeId, rasterImage);
          } catch (error) {
            console.error(`[SvgProcessor] Failed to rasterize element ${element.id}:`, error);
          }
        }

        console.timeEnd('rasterizeAll');
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
