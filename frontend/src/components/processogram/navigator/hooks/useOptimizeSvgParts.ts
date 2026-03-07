/**
 * ═══════════════════════════════════════════════════════════════════════
 * SVG Navigator — Motor de Swap O(1) (LOD via PNG Swap — Etapa 3)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Substitui grupos SVG complexos (`<g>`) por imagens PNG pré-renderizadas
 * pelo backend, usando metadados `RasterImage` (coordenadas + URL) e
 * lookup O(1) no cache de prefetch.
 *
 * ANTES (ADR-004 v1 — Canvas client-side):
 *   getBBox → XMLSerializer → Blob → ObjectURL → Image.onload
 *     → Canvas (devicePixelRatio) → base64 PNG → <image>
 *   Custo: ~30-80ms por elemento (serialização + Canvas + encoding)
 *
 * AGORA (ADR-004 v2 — LOD via PNG Swap):
 *   imageCache.has(id) → rasterImages[id].{x,y,w,h,src} → <image>
 *   Custo: ~0.1ms por elemento (lookup no Map + criação de 1 nó DOM)
 *
 * ESTRATÉGIA DOM (display:none + insertBefore):
 *   O <g> original NÃO é removido do DOM — é ocultado com display:none
 *   e um <image data-rasterized-for="id"> é inserido como sibling.
 *   Isto preserva as referências internas do GSAP (tweens de filter
 *   aplicados pelo outOfFocusAnimation em useNavigator) e permite
 *   restauro atómico sem perda de state visual.
 *
 * ASYNC BATCHING (Time-Slicing via rAF):
 *   O swap dos outOfFocusElements é dividido em chunks de CHUNK_SIZE
 *   elementos, cada chunk processado num requestAnimationFrame separado.
 *   Isto distribui os ~60ms de DOM mutations (para 1200+ elementos)
 *   em ~3 frames de ~20ms, libertando budget para o GSAP animar o
 *   viewBox a 60 FPS sem frame drops perceptíveis.
 *
 * SEGURANÇA CONTRA RACE CONDITIONS:
 *   - Epoch counter: cada chamada a optimizeLevelElements incrementa
 *     o epoch. Se o utilizador navega antes de todos os chunks serem
 *     processados, o callback rAF verifica o epoch e aborta.
 *   - restoreAllRasterized() é chamado no início de cada changeLevelTo
 *     (useNavigator:153), garantindo DOM consistente antes de qualquer
 *     querySelector.
 *
 * GRACEFUL DEGRADATION:
 *   Se uma imagem não está no imageCache (decode() pendente ou falhou),
 *   rasterizeElement faz skip silencioso — o <g> permanece vectorial.
 *   O utilizador não nota: os grupos estão escurecidos de qualquer forma.
 *
 * Referência: ADR-004 — Rasterização Dinâmica (LOD via PNG Swap)
 * ═══════════════════════════════════════════════════════════════════════
 */

"use client";

import { type RefObject, useCallback, useEffect, useRef } from "react";
import type { RasterImage } from "@/types/processogram";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Número de elementos processados por frame de rAF.
 * 400 × ~0.05ms/elemento ≈ 20ms — dentro do budget de 16.6ms
 * com margem para o GSAP tick (~2ms) no mesmo frame.
 * Em SVGs com 1200 elementos: 3 frames × 400 = swap completo.
 */
const CHUNK_SIZE = 400;

// ─── Props do Hook ─────────────────────────────────────────────────────

export interface UseOptimizeSvgPartsProps {
  /** Referência ao `<svg>` DOM injetado pelo react-inlinesvg. */
  svgElement: SVGElement | null;

  /** Metadados de rasterização vindos da API (key = elementId). */
  rasterImages: Record<string, RasterImage> | undefined;

  /**
   * Cache de imagens pré-carregadas pelo usePrefetchRaster.
   * Usado como sinal de "readiness" — se `imageCache.current.has(id)`
   * é false, o swap é adiado e o <g> permanece vectorial.
   */
  imageCache: RefObject<Map<string, HTMLImageElement>>;
}

// ─── Return Type ───────────────────────────────────────────────────────

export interface UseOptimizeSvgPartsReturn {
  /**
   * Orquestra a otimização do nível actual:
   *   - Garante que `currentElement` permanece 100% vectorial (nítido no zoom).
   *   - Adia o swap dos `outOfFocusElements` para o próximo tick via setTimeout(0),
   *     libertando o frame actual para o GSAP animar o viewBox sem bloqueios.
   */
  optimizeLevelElements: (
    currentElement: SVGElement,
    outOfFocusElements: NodeListOf<Element>,
  ) => void;

  /**
   * Restaura todos os elementos rasterizados de volta para `<g>` vectorial.
   * Chamado no início de cada transição por `useNavigator`.
   */
  restoreAllRasterized: () => void;
}

// ─── Hook ──────────────────────────────────────────────────────────────

export function useOptimizeSvgParts({
  svgElement,
  rasterImages,
  imageCache,
}: UseOptimizeSvgPartsProps): UseOptimizeSvgPartsReturn {
  /**
   * IDs cujos `<g>` estão actualmente ocultos com `<image>` sibling.
   * Permite iterar em `restoreAllRasterized` sem varrer todo o DOM.
   */
  const rasterizedIds = useRef<Set<string>>(new Set());

  /**
   * Epoch counter para invalidar setTimeout stale.
   * Cada chamada a `optimizeLevelElements` incrementa o epoch.
   * Quando o setTimeout de uma navegação anterior dispara, compara
   * o epoch capturado com o actual e aborta se diferente.
   */
  const epochRef = useRef(0);

  /**
   * Ref estável para rasterImages — evita que rasterizeElement
   * seja recriado a cada mudança de rasterImages, o que causaria
   * uma cadeia de re-criação: rasterizeElement → optimizeLevelElements
   * → changeLevelTo → handleClick → window event listener.
   *
   * Sincronizado via useEffect (não no render path) para
   * compatibilidade com React Compiler (react-hooks/refs).
   */
  const rasterImagesRef = useRef(rasterImages);
  useEffect(() => {
    rasterImagesRef.current = rasterImages;
  }, [rasterImages]);

  // ─── restoreElement ────────────────────────────────────────────────

  /**
   * Restaura um único `<g>` rasterizado para o estado vectorial.
   *
   * Seguro de chamar mesmo que o elemento nunca tenha sido rasterizado
   * (nesse caso, opera em no-op silencioso).
   */
  const restoreElement = useCallback((element: SVGGElement): void => {
    const id = element.id;
    if (!id) return;

    // Remove do tracking
    rasterizedIds.current.delete(id);

    // Remove <image> correspondente, se já inserida
    const imageEl = element.parentNode?.querySelector<Element>(
      `[data-rasterized-for="${CSS.escape(id)}"]`,
    );
    imageEl?.remove();

    // Restaura visibilidade do <g> original
    element.style.display = "";
  }, []);

  // ─── restoreAllRasterized ──────────────────────────────────────────

  const restoreAllRasterized = useCallback((): void => {
    if (!svgElement) return;

    for (const id of Array.from(rasterizedIds.current)) {
      const el = svgElement.querySelector<SVGGElement>(`#${CSS.escape(id)}`);
      if (el) restoreElement(el);
    }

    // Limpa <image> órfãos (segurança extra para estados inconsistentes)
    svgElement
      .querySelectorAll("[data-rasterized-for]")
      .forEach((img) => img.remove());

    rasterizedIds.current.clear();
  }, [svgElement, restoreElement]);

  // ─── rasterizeElement ─────────────────────────────────────────────

  /**
   * Swap O(1): oculta o `<g>` original e insere um `<image>` sibling
   * com as coordenadas exactas calculadas pelo backend.
   *
   * Pipeline:
   *   1. Guard: já rasterizado? skip.
   *   2. Guard: rasterImages tem coordenadas para este id? skip se não.
   *   3. Guard: imageCache tem a imagem decoded? skip se não (graceful).
   *   4. Criar <image> SVG com href + x/y/width/height do backend.
   *   5. Troca atómica: display:none no <g>, insertBefore do <image>.
   */
  const rasterizeElement = useCallback(
    (element: SVGGElement): void => {
      if (!svgElement) return;

      const id = element.id;
      if (!id) return;

      // Já rasterizado — skip
      if (rasterizedIds.current.has(id)) return;

      // Coordenadas do backend
      const data = rasterImagesRef.current?.[id];
      if (!data) return;

      // Readiness check: imagem pré-carregada e decoded?
      // Se não, o <g> permanece vectorial (graceful degradation).
      if (!imageCache.current.has(id)) return;

      rasterizedIds.current.add(id);

      // ── Troca atómica: oculta <g>, insere <image> ──────────────
      // Ambas as operações no mesmo microtask → sem flicker visível.
      const imageEl = document.createElementNS(SVG_NS, "image");
      imageEl.setAttribute("href", data.src);
      imageEl.setAttribute("x", String(data.x));
      imageEl.setAttribute("y", String(data.y));
      imageEl.setAttribute("width", String(data.width));
      imageEl.setAttribute("height", String(data.height));
      imageEl.setAttribute("data-rasterized-for", id);

      element.style.display = "none";
      element.parentNode?.insertBefore(imageEl, element.nextSibling);
    },
    [svgElement, imageCache],
  );

  // ─── optimizeLevelElements ─────────────────────────────────────────

  const optimizeLevelElements = useCallback(
    (
      currentElement: SVGElement,
      outOfFocusElements: NodeListOf<Element>,
    ): void => {
      // Incrementa epoch — invalida chunks rAF de navegações anteriores
      const currentEpoch = ++epochRef.current;

      // PASSO A: garante que o alvo está 100% vectorial (defensivo).
      // Na prática é no-op porque restoreAllRasterized() já correu
      // em useNavigator:153, mas protege contra chamadas futuras
      // fora do fluxo standard.
      restoreElement(currentElement as SVGGElement);

      // PASSO B: Time-slicing via requestAnimationFrame.
      // Divide os outOfFocusElements em chunks de CHUNK_SIZE,
      // processando cada chunk num frame separado. O GSAP anima
      // o viewBox no mesmo frame sem competição pela Main Thread.
      const elements = Array.from(outOfFocusElements) as SVGGElement[];
      let index = 0;

      function processChunk() {
        // Epoch mudou → navegação stale → abortar toda a cadeia rAF
        if (epochRef.current !== currentEpoch) return;

        const end = Math.min(index + CHUNK_SIZE, elements.length);
        for (let i = index; i < end; i++) {
          rasterizeElement(elements[i]);
        }

        index = end;
        if (index < elements.length) {
          requestAnimationFrame(processChunk);
        }
      }

      // Primeiro chunk no próximo frame — liberta o frame actual
      // para o GSAP iniciar a animação do viewBox limpa.
      requestAnimationFrame(processChunk);
    },
    [restoreElement, rasterizeElement],
  );

  // ─── Cleanup no unmount ────────────────────────────────────────────

  useEffect(() => {
    const ids = rasterizedIds.current;
    return () => {
      ids.clear();
      epochRef.current = 0;
    };
  }, []);

  return { optimizeLevelElements, restoreAllRasterized };
}
