/**
 * ═══════════════════════════════════════════════════════════════════════
 * SVG Navigator — Prefetch de Raster (LOD via PNG Swap — Etapa 1+2)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Faz o download silencioso das imagens PNG pré-renderizadas pelo backend
 * para a RAM do navegador no momento da montagem do componente.
 *
 * PRINCÍPIO:
 *   O backend (SvgProcessorService) já rasteriza cada grupo interativo
 *   do SVG via Puppeteer + Sharp e faz upload para o GCS com coordenadas
 *   exactas em SVG-space (x, y, width, height).
 *
 *   Este hook consome os metadados `RasterImage` vindos da API e instancia
 *   `HTMLImageElement` para cada entrada, forçando o browser a descarregar
 *   e descodificar os PNGs em background via `img.decode()`.
 *
 *   Quando o motor de Swap O(1) (useOptimizeSvgParts) é activado,
 *   as imagens já estão na HTTP cache do browser — zero latência de rede.
 *
 * SEGURANÇA:
 *   - `img.decode()` garante descodificação GPU completa antes de marcar
 *     como pronto no Map.
 *   - Flag `aborted` previne callbacks stale após cleanup.
 *   - Cleanup no unmount aborta downloads pendentes via `img.src = ""`.
 *   - Cache limpo ao mudar de processograma ou tema.
 *
 * Referência: ADR-004 — Rasterização Dinâmica (LOD via PNG Swap)
 * ═══════════════════════════════════════════════════════════════════════
 */

"use client";

import { type RefObject, useEffect, useRef } from "react";
import type { RasterImage } from "@/types/processogram";

// ─── Return Type ───────────────────────────────────────────────────────

export interface UsePrefetchRasterReturn {
  /**
   * Map de imagens pré-carregadas: elementId → HTMLImageElement (decoded).
   * Consumido pelo motor de Swap O(1) como sinal de "readiness":
   * se `imageCache.current.has(id)` é true, a imagem está descodificada
   * e pronta para composição sem jank.
   */
  imageCache: RefObject<Map<string, HTMLImageElement>>;
}

// ─── Hook ──────────────────────────────────────────────────────────────

export function usePrefetchRaster(
  rasterImages: Record<string, RasterImage> | undefined,
): UsePrefetchRasterReturn {
  /**
   * Cofre de memória: elementId → HTMLImageElement (decoded).
   * useRef (não useState) para evitar re-renders — o motor de Swap
   * lê este Map imperativamente via `imageCache.current.get(id)`.
   */
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());

  useEffect(() => {
    if (!rasterImages || Object.keys(rasterImages).length === 0) return;

    /**
     * Flag de abort — capturada no closure de cada `decode().then()`.
     * Quando o cleanup desta effect dispara (unmount ou mudança de deps),
     * `aborted` torna-se true, impedindo callbacks stale de poluir
     * o cache já limpo.
     */
    let aborted = false;

    /** Referências locais para abort no cleanup. */
    const currentImages: HTMLImageElement[] = [];

    for (const [id, data] of Object.entries(rasterImages)) {
      // Já está no cache (ex: re-render sem mudança real de dados)
      if (imageCache.current.has(id)) continue;

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = data.src;
      currentImages.push(img);

      // decode() resolve quando a imagem está totalmente descodificada
      // e pronta para composição GPU — sem jank no primeiro render.
      img
        .decode()
        .then(() => {
          if (aborted) return;
          imageCache.current.set(id, img);
        })
        .catch(() => {
          // Decode falhou (tab em background, imagem corrompida, abort).
          // Não guardar no cache — o motor de Swap fará graceful skip
          // e o <g> permanece vectorial.
        });
    }

    return () => {
      // Sinaliza abort para callbacks de decode() pendentes
      aborted = true;

      // Cancela downloads HTTP em progresso
      for (const img of currentImages) {
        img.src = "";
      }

      // Limpa o cofre — novo ciclo de prefetch começará se deps mudarem
      imageCache.current.clear();
    };
  }, [rasterImages]);

  return { imageCache };
}
