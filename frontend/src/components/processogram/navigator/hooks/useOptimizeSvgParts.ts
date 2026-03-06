/**
 * ═══════════════════════════════════════════════════════════════════════
 * SVG Navigator — Motor de Rasterização Dinâmica (Otimização Nível 2)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Converte grupos SVG complexos (`<g>`) em imagens bitmap (`<image>`)
 * em tempo de execução via Canvas, para aliviar a carga de GPU durante
 * animações GSAP de viewBox.
 *
 * PRINCÍPIO:
 *   Antes de um drill-down, os grupos que ficam fora de foco são trocados
 *   por um único PNG cada. Em vez de o browser recalcular milhares de nós
 *   vectoriais por frame durante o zoom, recalcula apenas pixels já
 *   "cozinhados". O efeito visual é idêntico — os grupos estão escurecidos
 *   (`brightness 0.3` / `grayscale 1`) de qualquer forma.
 *
 * FLUXO POR TRANSIÇÃO (integrado em `useNavigator.changeLevelTo`):
 *   1. `restoreAllRasterized()`       → DOM limpo antes de qualquer querySelector
 *   2. `outOfFocusAnimation` (GSAP)   → escurece os elementos fora de foco
 *   3. `optimizeLevelElements(...)`   → agenda rasterização (setTimeout 0)
 *   4. `gsap.to(svgElement, viewBox)` → animação da câmara (frame limpo)
 *   5. setTimeout fires:
 *        a. `restoreElement(target)`    — target permanece 100% vectorial
 *        b. `rasterizeElement(sibling)` — async: Blob → Image → Canvas → PNG
 *        c. Troca atómica: oculta `<g>`, insere `<image>`
 *
 * CACHE:
 *   `rasterCache: Map<id, "pending" | base64>`
 *     `"pending"` → serialização em curso (img.src definido)
 *     `string`    → base64 PNG pronto (evita re-rasterização em naveg. repetidas)
 *
 * SEGURANÇA CONTRA RACE CONDITIONS:
 *   - Se `restoreElement()` é chamado durante load assíncrono:
 *     elimina a entrada `"pending"` do cache → `onload` verifica e aborta.
 *   - Se o utilizador navega antes da rasterização terminar:
 *     `restoreAllRasterized()` é chamado no início do próximo `changeLevelTo`,
 *     antes de qualquer querySelector, garantindo DOM consistente.
 *
 * Referência: ADR-004 — Rasterização Dinâmica
 * ═══════════════════════════════════════════════════════════════════════
 */

"use client";

import { useCallback, useRef } from "react";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Margem em unidades SVG para evitar corte de arestas na serialização. */
const RASTER_PADDING = 2;

// ─── Props do Hook ─────────────────────────────────────────────────────

export interface UseOptimizeSvgPartsProps {
  /** Referência ao `<svg>` DOM injetado pelo react-inlinesvg. */
  svgElement: SVGElement | null;
}

// ─── Return Type ───────────────────────────────────────────────────────

export interface UseOptimizeSvgPartsReturn {
  /**
   * Orquestra a otimização do nível actual:
   *   - Garante que `currentElement` permanece 100% vectorial (nítido no zoom).
   *   - Adia a rasterização dos `outOfFocusElements` para o próximo tick,
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
}: UseOptimizeSvgPartsProps): UseOptimizeSvgPartsReturn {
  /**
   * Cache de rasterização.
   * `"pending"` → serialização em curso.
   * `string`    → base64 PNG já gerado.
   */
  const rasterCache = useRef<Map<string, string>>(new Map());

  /**
   * IDs cujos `<g>` estão actualmente substituídos por `<image>`.
   * Permite iterar em `restoreAllRasterized` sem varrer todo o DOM.
   */
  const rasterizedIds = useRef<Set<string>>(new Set());

  // ─── restoreElement ────────────────────────────────────────────────

  /**
   * Restaura um único `<g>` rasterizado para o estado vectorial.
   *
   * Seguro de chamar mesmo que o elemento nunca tenha sido rasterizado
   * (nesse caso, opera em no-op silencioso).
   *
   * Cancela qualquer `onload` pendente: ao eliminar `"pending"` do cache,
   * o callback verificará `get(id) !== "pending"` e abortará.
   */
  const restoreElement = useCallback((element: SVGGElement): void => {
    const id = element.id;
    if (!id) return;

    // Remove do tracking — cancela onload pendente se houver
    rasterCache.current.delete(id);
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

    rasterCache.current.clear();
    rasterizedIds.current.clear();
  }, [svgElement, restoreElement]);

  // ─── rasterizeElement ─────────────────────────────────────────────

  /**
   * Serializa um `<g>` SVG para um blob, desenha-o num Canvas e troca-o
   * por um `<image>` bitmap. Toda a operação é assíncrona (via `Image.onload`).
   *
   * Pipeline:
   *   getBBox() → XMLSerializer → Blob → ObjectURL → Image.onload
   *     → Canvas (devicePixelRatio) → base64 PNG
   *     → Troca atómica: hide `<g>`, insert `<image data-rasterized-for>`
   */
  const rasterizeElement = useCallback(
    (element: SVGGElement): void => {
      if (!svgElement) return;

      const id = element.id;
      if (!id) return;

      // Já no cache (pending ou pronto) → não reprocessar
      if (rasterCache.current.has(id)) return;

      const bbox = element.getBBox();
      if (bbox.width === 0 || bbox.height === 0) return;

      // Marca como pending imediatamente (guard contra double-start)
      rasterCache.current.set(id, "pending");

      const svgRoot = svgElement as SVGSVGElement;
      const serializer = new XMLSerializer();

      // Inclui <defs> do SVG raiz (gradientes, patterns, símbolos)
      // para que o bitmap reflicta correctamente os recursos partilhados.
      const defsEl = svgRoot.querySelector("defs");
      const defsString = defsEl ? serializer.serializeToString(defsEl) : "";

      const gString = serializer.serializeToString(element);

      const vx = bbox.x - RASTER_PADDING;
      const vy = bbox.y - RASTER_PADDING;
      const vw = bbox.width + RASTER_PADDING * 2;
      const vh = bbox.height + RASTER_PADDING * 2;

      // SVG autónomo válido — xmlns obrigatório ou o Canvas recebe branco
      const svgString = [
        `<svg xmlns="${SVG_NS}" xmlns:xlink="http://www.w3.org/1999/xlink"`,
        ` viewBox="${vx} ${vy} ${vw} ${vh}"`,
        ` width="${vw}" height="${vh}">`,
        defsString,
        gString,
        `</svg>`,
      ].join("");

      const blob = new Blob([svgString], {
        type: "image/svg+xml;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const img = new Image();

      img.onload = () => {
        URL.revokeObjectURL(url);

        // Abortado por restoreElement durante o carregamento assíncrono
        if (rasterCache.current.get(id) !== "pending") return;

        // Multiplica pelo devicePixelRatio para ecrãs Retina/HiDPI
        const dpr = Math.max(window.devicePixelRatio ?? 1, 1);
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(vw * dpr);
        canvas.height = Math.ceil(vh * dpr);

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          rasterCache.current.delete(id);
          return;
        }

        ctx.scale(dpr, dpr);
        ctx.drawImage(img, 0, 0, vw, vh);

        const base64 = canvas.toDataURL("image/png");

        // Segunda verificação: pode ter sido restaurado durante drawImage
        if (rasterCache.current.get(id) !== "pending") return;

        rasterCache.current.set(id, base64);
        rasterizedIds.current.add(id);

        // ── Troca atómica: oculta <g>, insere <image> ──────────────
        // Ambas as operações no mesmo microtask → sem flicker visível.
        const imageEl = document.createElementNS(SVG_NS, "image");
        imageEl.setAttribute("href", base64);
        imageEl.setAttribute("x", String(vx));
        imageEl.setAttribute("y", String(vy));
        imageEl.setAttribute("width", String(vw));
        imageEl.setAttribute("height", String(vh));
        imageEl.setAttribute("data-rasterized-for", id);

        element.style.display = "none";
        element.parentNode?.insertBefore(imageEl, element.nextSibling);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        // Permite nova tentativa em navegações futuras
        rasterCache.current.delete(id);
      };

      img.src = url;
    },
    [svgElement],
  );

  // ─── optimizeLevelElements ─────────────────────────────────────────

  const optimizeLevelElements = useCallback(
    (
      currentElement: SVGElement,
      outOfFocusElements: NodeListOf<Element>,
    ): void => {
      // Garante que o alvo do zoom fica 100% vectorial (nítido)
      restoreElement(currentElement as SVGGElement);

      // setTimeout(0) liberta o frame actual para o GSAP animar o viewBox
      // sem bloqueios de serialização/canvas.
      setTimeout(() => {
        outOfFocusElements.forEach((el) => {
          rasterizeElement(el as SVGGElement);
        });
      }, 0);
    },
    [restoreElement, rasterizeElement],
  );

  return { optimizeLevelElements, restoreAllRasterized };
}
