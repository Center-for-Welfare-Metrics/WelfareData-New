/**
 * ═══════════════════════════════════════════════════════════════════════
 * ProcessogramViewer — Shell para SVG Inline
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Renderiza o SVG como DOM real via `react-inlinesvg`.
 * Expõe a ref do <svg> para os hooks de câmera e interação.
 *
 * Etapa 1: Shell puro — sem câmera, sem pan/zoom, sem HUD.
 * O motor GSAP de viewBox será adicionado na Etapa 2.
 *
 * Decisão arquitetural (ver docs/frontend/svg_navigation_architecture.md):
 *   Antes: dangerouslySetInnerHTML + react-zoom-pan-pinch + hooks manuais
 *   Agora: react-inlinesvg + GSAP viewBox nativo (a implementar)
 * ═══════════════════════════════════════════════════════════════════════
 */

"use client";

import { useCallback } from "react";
import SVG from "react-inlinesvg";
import { motion } from "framer-motion";

// ─── Tipos ─────────────────────────────────────────────────────────────

interface ProcessogramViewerProps {
  /**
   * URL do SVG a renderizar.
   * O `react-inlinesvg` faz fetch e injeta como DOM real.
   */
  svgUrl: string;

  /**
   * Callback que recebe a ref do <svg> DOM após carregamento.
   * Os hooks de câmera e interação usam esta ref para manipular
   * viewBox, getBBox, querySelector, etc.
   */
  onSvgReady?: (svgElement: SVGSVGElement) => void;
}

// ─── Componente ────────────────────────────────────────────────────────

export function ProcessogramViewer({
  svgUrl,
  onSvgReady,
}: ProcessogramViewerProps) {
  /**
   * O react-inlinesvg chama `innerRef` com o <svg> DOM real
   * após o carregamento e injeção no DOM. É por aqui que o
   * sistema inteiro ganha acesso ao SVG para:
   *   - Manipular `viewBox` (câmera GSAP)
   *   - Chamar `getBBox()` (cálculo de enquadramento)
   *   - Usar `querySelector`/`closest` (resolução de cliques)
   */
  const handleSvgRef = useCallback(
    (node: SVGElement | null) => {
      if (!node) return;

      const svgEl = node as SVGSVGElement;

      // Sanitiza: garante viewBox e remove dimensões fixas
      sanitizeSvgElement(svgEl);

      onSvgReady?.(svgEl);
    },
    [onSvgReady],
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="processogram-svg-container relative size-full overflow-visible bg-background"
    >
      <SVG
        src={svgUrl}
        innerRef={handleSvgRef}
        className="size-full"
        title="Processogram SVG"
      />
    </motion.div>
  );
}

// ─── Sanitização do SVG ────────────────────────────────────────────────

/**
 * Garante que o <svg> injetado está pronto para o sistema de câmera:
 *
 * 1. Se não tem `viewBox`, cria um a partir de `width`/`height`
 * 2. Substitui atributos `width`/`height` fixos por `"100%"` (dimensões relativas)
 * 3. Define `preserveAspectRatio="xMidYMid meet"` para enquadramento
 * 4. Define `overflow="visible"` para não cortar durante animações
 */
function sanitizeSvgElement(svgEl: SVGSVGElement): void {
  // Captura viewBox existente ou cria a partir de dimensões
  const existingViewBox = svgEl.getAttribute("viewBox");

  if (!existingViewBox) {
    const w = svgEl.getAttribute("width");
    const h = svgEl.getAttribute("height");
    if (w && h) {
      const wNum = parseFloat(w);
      const hNum = parseFloat(h);
      if (!Number.isNaN(wNum) && !Number.isNaN(hNum) && wNum > 0 && hNum > 0) {
        svgEl.setAttribute("viewBox", `0 0 ${wNum} ${hNum}`);
      }
    }
  }

  // Substitui dimensões fixas por relativas — o SVG ocupa 100% do container pai.
  // Usar setAttribute (não CSS) garante que o SVG tem dimensões intrínsecas
  // relativas mesmo se a cadeia de height:100% CSS falhar.
  svgEl.setAttribute("width", "100%");
  svgEl.setAttribute("height", "100%");

  // Enquadramento proporcional centralizado
  svgEl.setAttribute("preserveAspectRatio", "xMidYMid meet");

  // Overflow visível para não cortar durante transições de viewBox
  svgEl.style.overflow = "visible";
}
