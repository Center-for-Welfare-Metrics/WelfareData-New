/**
 * ═══════════════════════════════════════════════════════════════════════
 * SVG Navigator — Cálculo do ViewBox (Motor de Câmera)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * O browser é um motor de câmera embutido: alterar o atributo `viewBox`
 * de um `<svg>` faz o browser recalcular toda a projeção automaticamente.
 * Este módulo calcula a string `viewBox` ideal para enquadrar qualquer
 * elemento SVG na viewport, com compensação de aspect ratio e padding
 * adaptativo.
 *
 * Fluxo:
 *   1. `getBBox()` do elemento → coordenadas no espaço SVG
 *   2. Compensação de aspect ratio (tela vs. elemento)
 *   3. Padding adaptativo baseado no tamanho relativo
 *   4. Retorna `"x y width height"` — a string que o GSAP interpolará
 *
 * Referência: GUIA_REPLICACAO_SVG_NAVIGATOR.md §5
 * ═══════════════════════════════════════════════════════════════════════
 */

// ─── Helpers Internos ──────────────────────────────────────────────────

/**
 * Sobe na árvore DOM até encontrar o `<svg>` pai.
 *
 * Limitado a 10 iterações para proteger contra loops infinitos
 * em DOMs profundamente aninhados ou corrompidos.
 *
 * @param el - Qualquer elemento dentro do SVG.
 * @returns O `<svg>` ancestral mais próximo.
 * @throws Se não encontrar um `<svg>` dentro do limite.
 */
function getSvgParent(el: Element): SVGSVGElement {
  let current: Element | null = el;
  let limit = 0;

  while (current && current.tagName.toLowerCase() !== "svg" && limit++ <= 10) {
    current = current.parentElement;
  }

  if (!current || current.tagName.toLowerCase() !== "svg") {
    throw new Error(
      "[getElementViewBox] Não foi possível encontrar o <svg> ancestral.",
    );
  }

  return current as SVGSVGElement;
}

/**
 * Calcula qual porcentagem da área total do SVG o elemento ocupa.
 *
 * Usado para decidir quanto "respiro" (padding) dar ao zoom:
 * elementos que ocupam uma fração minúscula do SVG total precisam
 * de mais espaço ao redor para não ficarem visualmente "colados"
 * nas bordas da viewport.
 *
 * @param element - Elemento SVG cujo tamanho relativo será calculado.
 * @returns Porcentagem de ocupação (0–100).
 */
function getPercentageSize(element: Element): number {
  const svgParent = getSvgParent(element);

  const svgBBox = (svgParent as unknown as SVGGraphicsElement).getBBox();
  const elBBox = (element as unknown as SVGGraphicsElement).getBBox();

  const svgArea = svgBBox.width * svgBBox.height;
  const elArea = elBBox.width * elBBox.height;

  // Protege contra divisão por zero (SVG vazio ou sem dimensões)
  if (svgArea === 0) return 0;

  return (elArea * 100) / svgArea;
}

/**
 * Retorna o multiplicador de padding com base no tamanho relativo
 * do elemento no SVG.
 *
 * Limiares (conforme o guia de replicação):
 *
 * | Tamanho relativo          | Padding | Racional                          |
 * |---------------------------|---------|-----------------------------------|
 * | Grande (> 40% da área)    | 0       | Já ocupa quase tudo — sem respiro |
 * | Médio (0.5% a 40%)        | 0.2     | 20% de margem — confortável       |
 * | Minúsculo (< 0.5%)       | 1.5     | 150% — zoom-out generoso          |
 *
 * @param percentageSize - Tamanho relativo do elemento (0–100).
 * @returns Multiplicador de padding (0, 0.2 ou 1.5).
 */
function getAdaptivePadding(percentageSize: number): number {
  if (percentageSize < 40 && percentageSize > 0.5) return 0.2;
  if (percentageSize <= 0.5) return 1.5;
  return 0;
}

// ─── Função Principal ──────────────────────────────────────────────────

/**
 * Calcula o `viewBox` ideal para enquadrar um elemento SVG na viewport.
 *
 * Algoritmo:
 *   1. Extrai as coordenadas nativas do elemento via `getBBox()`
 *   2. Compensa a divergência de aspect ratio entre a viewport
 *      do browser e o bounding box do elemento (evita distorção)
 *   3. Aplica padding adaptativo — elementos menores recebem mais
 *      "respiro" proporcional
 *   4. Retorna a string `"x y width height"` pronta para ser
 *      atribuída ao atributo `viewBox` do `<svg>`
 *
 * @param element - O elemento SVG a enquadrar (qualquer `<g>`, `<path>`, etc.).
 * @returns String `viewBox` formatada, ou `null` se o cálculo falhar.
 *
 * @example
 * ```ts
 * const el = svg.querySelector("#growing--lf1");
 * const viewBox = getElementViewBox(el);
 * // "142.5 80 450 300"
 *
 * // O GSAP (etapa seguinte) usará assim:
 * // gsap.to(svgElement, { attr: { viewBox }, duration: 0.7 });
 * ```
 */
export function getElementViewBox(element: Element): string | null {
  try {
    // ═══════════════════════════════════════════════
    // 1. BOUNDING BOX NATIVA
    // ═══════════════════════════════════════════════
    // getBBox() retorna coordenadas no sistema de coordenadas
    // do espaço SVG (não pixels de tela).
    let { x, y, width, height } = (
      element as unknown as SVGGraphicsElement
    ).getBBox();

    // Proteção: BBox sem dimensões → impossível calcular viewBox
    if (width === 0 || height === 0) {
      console.warn(
        "[getElementViewBox] Elemento com BBox de dimensão zero:",
        element,
      );
      return null;
    }

    // ═══════════════════════════════════════════════
    // 2. COMPENSAÇÃO DE ASPECT RATIO
    // ═══════════════════════════════════════════════
    // Se a tela é landscape mas o elemento é portrait (ou vice-versa),
    // o viewBox resultante distorceria a projeção. Compensamos
    // alargando o viewBox horizontalmente.
    //
    //   screenRatio  = innerHeight / innerWidth  → <1 se landscape
    //   elementRatio = height / width            → >=1 se vertical
    //   ratioDiff    = divergência × 2 (fator de compensação)

    const screenRatio = window.innerHeight / window.innerWidth;
    const elementRatio = height / width;
    const ratioDiff = Math.abs(screenRatio - elementRatio) * 2;

    const isScreenHorizontal = screenRatio < 1;
    const isElementVertical = elementRatio >= 1;

    if (
      (isScreenHorizontal && isElementVertical) ||
      (!isScreenHorizontal && isElementVertical)
    ) {
      // Alarga horizontalmente para compensar a diferença
      x -= (width * ratioDiff) / 2;
      width += width * ratioDiff;
    }

    // ═══════════════════════════════════════════════
    // 3. PADDING ADAPTATIVO
    // ═══════════════════════════════════════════════
    // Elementos muito pequenos em relação ao SVG total precisam
    // de mais "respiro" ao redor para não ficarem colados nas bordas.
    //
    // O padding é aplicado simetricamente em ambos os eixos:
    //   - x recua em (width × padding) / 2
    //   - width cresce em width × padding
    //   - y recua em (height × padding) / 2
    //   - height cresce em height × padding

    const percentageSize = getPercentageSize(element);
    const padding = getAdaptivePadding(percentageSize);

    if (padding > 0) {
      x -= (width * padding) / 2;
      width += width * padding;
      y -= (height * padding) / 2;
      height += height * padding;
    }

    // ═══════════════════════════════════════════════
    // 4. STRING FINAL
    // ═══════════════════════════════════════════════
    return `${x} ${y} ${width} ${height}`;
  } catch (error) {
    // getBBox() pode falhar em elementos ocultos (display:none),
    // elementos ainda não montados no DOM, ou SVGs inline
    // que não foram completamente parseados.
    console.error("[getElementViewBox] Erro ao calcular viewBox:", error);
    return null;
  }
}
