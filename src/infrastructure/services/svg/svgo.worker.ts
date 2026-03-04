/**
 * SVGO Worker Thread
 *
 * Runs SVGO optimize() in a separate thread to avoid blocking the main
 * event loop. This is critical for large SVGs (>1MB) where a single
 * optimize() call can take 30-120s of pure CPU, which would otherwise
 * block Express from responding to TCP keepalives (causing ECONNRESET).
 *
 * Protocol:
 *   parentPort receives: { svgContent: string, multipass: boolean }
 *   parentPort posts:    { success: true, data: string } | { success: false, error: string }
 */

import { parentPort } from 'worker_threads';
import { optimize } from 'svgo';
import {
  normalizeSemanticIdsPlugin,
  fixMissingSvgIdPlugin,
} from './plugins';
import { removeBxAttributesPlugin } from './plugins/removeBxAttributesPlugin';

if (!parentPort) {
  throw new Error('This file must be run as a Worker Thread');
}

parentPort.on('message', (msg: { svgContent: string; multipass: boolean; svgSize: number }) => {
  try {
    const isLarge = msg.svgSize > 1_000_000; // 1 MB

    // For large SVGs (>1MB), preset-default is computationally inviable
    // because plugins like convertPathData, mergePaths, convertTransform
    // iterate over every <path> node (45K+ in salmon.svg) doing heavy
    // math.  We use a hand-picked lightweight set instead.
    const plugins: any[] = isLarge
      ? [
          // ── Lightweight cleanup-only plugins (no geometry math) ──
          'removeDoctype',
          'removeXMLProcInst',
          'removeComments',
          'removeMetadata',
          'removeEditorsNSData',
          'cleanupAttrs',
          'removeEmptyAttrs',
          'removeEmptyContainers',
          'removeUnusedNS',
          'removeDesc',
          'removeTitle',
          // ── Custom project plugins ──
          normalizeSemanticIdsPlugin,
          fixMissingSvgIdPlugin,
          removeBxAttributesPlugin,
        ]
      : [
          // ── Full optimization for normal-sized SVGs ──
          {
            name: 'preset-default' as const,
            params: {
              overrides: {
                cleanupIds: false,
              },
            },
          },
          normalizeSemanticIdsPlugin,
          fixMissingSvgIdPlugin,
          removeBxAttributesPlugin,
        ];

    const config = {
      multipass: msg.multipass,
      plugins,
    };

    const result = optimize(msg.svgContent, config);
    parentPort!.postMessage({ success: true, data: result.data });
  } catch (err: any) {
    parentPort!.postMessage({ success: false, error: err.message || String(err) });
  }
});
