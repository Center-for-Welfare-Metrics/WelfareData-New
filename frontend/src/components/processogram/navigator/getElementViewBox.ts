/**
 * ═══════════════════════════════════════════════════════════════════════
 * SVG Navigator — Cálculo do ViewBox (Motor de Câmera)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * O browser é um motor de câmera embutido: alterar o atributo `viewBox`
 * de um `<svg>` faz o browser recalcular toda a projeção automaticamente.
 * Este módulo calcula a string `viewBox` ideal para enquadrar qualquer
 * elemento SVG na viewport, com zoom floor, padding adaptativo e
 * trava de aspect ratio.
 *
 * Pipeline:
 *   1. `getBBox()` do elemento + SVG pai
 *   2. Zoom Floor — tamanho mínimo absoluto (5% do SVG)
 *   3. Padding adaptativo — respiro visual (15–25%)
 *   4. Trava de Aspect Ratio — casa viewBox com a tela (bidirecional)
 *   5. Clamping — mantém dentro dos limites do SVG
 *   6. Retorna `"x y width height"` — a string que o GSAP interpolará
 *
 * Referência: GUIA_REPLICACAO_SVG_NAVIGATOR.md §5
 * ═══════════════════════════════════════════════════════════════════════
 */

import { ZOOM_FLOOR_RATIO } from "./consts";

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
 * @param elBBox    - BBox do elemento alvo (já extraída pelo caller).
 * @param parentBBox - BBox do SVG raiz (já extraída pelo caller).
 * @returns Porcentagem de ocupação (0–100).
 */
function getPercentageSize(
  elBBox: DOMRect,
  parentBBox: DOMRect,
): number {
  const svgArea = parentBBox.width * parentBBox.height;
  const elArea = elBBox.width * elBBox.height;

  // Protege contra divisão por zero (SVG vazio ou sem dimensões)
  if (svgArea === 0) return 0;

  return (elArea * 100) / svgArea;
}

/**
 * Retorna o multiplicador de padding com base no tamanho relativo
 * do elemento no SVG.
 *
 * Limiares (pós Zoom Floor — o floor garante o tamanho mínimo,
 * o padding agora é apenas "respiro visual"):
 *
 * | Tamanho relativo          | Padding | Racional                          |
 * |---------------------------|---------|-----------------------------------|
 * | Grande (> 40% da área)    | 0       | Já ocupa quase tudo — sem respiro |
 * | Médio (0.5% a 40%)        | 0.15    | 15% de margem — confortável       |
 * | Minúsculo (≤ 0.5%)        | 0.25    | 25% — respiro sobre o Zoom Floor  |
 *
 * Nota: o antigo valor de 1.5 (150%) para micro-elementos era uma
 * muleta para compensar a ausência de Zoom Floor. Com o floor ativo
 * (Etapa 2), basta um padding moderado de 25%.
 *
 * @param percentageSize - Tamanho relativo do elemento (0–100).
 * @returns Multiplicador de padding (0, 0.15 ou 0.25).
 */
function getAdaptivePadding(percentageSize: number): number {
  if (percentageSize > 40) return 0;
  if (percentageSize > 0.5) return 0.15;
  return 0.25;
}

/**
 * Restringe o viewBox aos limites do SVG pai.
 *
 * O Zoom Floor e a Trava de AR podem empurrar o viewBox para fora
 * dos limites do SVG (ex: elemento no canto + expansão simétrica).
 * Este helper garante que:
 *   - width/height não excedam o SVG pai
 *   - x/y não fiquem antes da origem nem além do limite oposto
 *
 * @param vx - x do viewBox
 * @param vy - y do viewBox
 * @param vw - width do viewBox
 * @param vh - height do viewBox
 * @param p  - BBox do SVG pai (limites absolutos)
 * @returns Tupla [x, y, width, height] clampada.
 */
function clampViewBox(
  vx: number,
  vy: number,
  vw: number,
  vh: number,
  p: DOMRect,
): [number, number, number, number] {
  // Não pode ser maior que o SVG inteiro
  const w = Math.min(vw, p.width);
  const h = Math.min(vh, p.height);

  // Não pode sair dos limites
  const xMin = p.x;
  const xMax = p.x + p.width - w;
  const yMin = p.y;
  const yMax = p.y + p.height - h;

  const x = Math.max(xMin, Math.min(vx, xMax));
  const y = Math.max(yMin, Math.min(vy, yMax));

  return [x, y, w, h];
}

// ─── Função Principal ──────────────────────────────────────────────────

/**
 * Calcula o `viewBox` ideal para enquadrar um elemento SVG na viewport.
 *
 * Pipeline:
 *   1. BBox do elemento + SVG pai via `getBBox()`
 *   2. Zoom Floor — tamanho mínimo absoluto (5% do SVG)
 *   3. Padding adaptativo — respiro visual (15–25%)
 *   4. Trava de Aspect Ratio — casa viewBox com a tela (bidirecional)
 *   5. Clamping — mantém dentro dos limites do SVG
 *   6. Retorna `"x y width height"` — string que o GSAP interpolará
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
    // 1. BOUNDING BOXES (elemento + SVG pai)
    // ═══════════════════════════════════════════════
    // getBBox() retorna coordenadas no sistema de coordenadas
    // do espaço SVG (não pixels de tela).
    const elBBox = (element as unknown as SVGGraphicsElement).getBBox();
    let { x, y, width, height } = elBBox;

    // Proteção: BBox sem dimensões → impossível calcular viewBox
    if (width === 0 || height === 0) {
      console.warn(
        "[getElementViewBox] Elemento com BBox de dimensão zero:",
        element,
      );
      return null;
    }

    // BBox do SVG raiz — base para Zoom Floor, padding e clamping
    const svgParent = getSvgParent(element);
    const parentBBox = (
      svgParent as unknown as SVGGraphicsElement
    ).getBBox();

    // ═══════════════════════════════════════════════
    // 2. ZOOM FLOOR (tamanho mínimo absoluto de câmera)
    // ═══════════════════════════════════════════════
    // Em SVGs massivos, um CI pode ocupar 0.003% da área total.
    // Aplicar padding proporcional sobre dimensões minúsculas
    // resulta em viewBoxes ainda minúsculas (sem contexto visual).
    //
    // O Zoom Floor garante que a câmera NUNCA enquadre uma área
    // menor que ZOOM_FLOOR_RATIO (5%) do SVG total em cada eixo.
    // Se a BBox do elemento for menor que o floor, o viewBox é
    // expandido simetricamente a partir do centro do elemento.

    const minWidth = parentBBox.width * ZOOM_FLOOR_RATIO;
    const minHeight = parentBBox.height * ZOOM_FLOOR_RATIO;

    // Centro do elemento original (ponto de ancoragem para expansão)
    const centerX = elBBox.x + elBBox.width / 2;
    const centerY = elBBox.y + elBBox.height / 2;

    if (width < minWidth) {
      x = centerX - minWidth / 2;
      width = minWidth;
    }

    if (height < minHeight) {
      y = centerY - minHeight / 2;
      height = minHeight;
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

    const percentageSize = getPercentageSize(elBBox, parentBBox);
    const padding = getAdaptivePadding(percentageSize);

    if (padding > 0) {
      x -= (width * padding) / 2;
      width += width * padding;
      y -= (height * padding) / 2;
      height += height * padding;
    }

    // ═══════════════════════════════════════════════
    // 4. TRAVA DE ASPECT RATIO (bidirecional)
    // ═══════════════════════════════════════════════
    // Garante que o viewBox resultante tenha EXATAMENTE o mesmo
    // aspect ratio da viewport do browser. Sem isso, elementos
    // muito largos ou muito altos renderizam colados nas bordas.
    //
    // Fórmula:
    //   Se viewBox é mais alto que a tela  → expande width
    //   Se viewBox é mais largo que a tela → expande height
    //
    // A expansão é simétrica a partir do centro do viewBox atual,
    // mantendo o elemento alvo no ponto focal.

    const screenAR = window.innerWidth / window.innerHeight;
    const viewBoxAR = width / height;

    if (viewBoxAR < screenAR) {
      // viewBox mais alto que a tela → expandir largura
      const newWidth = height * screenAR;
      x -= (newWidth - width) / 2;
      width = newWidth;
    } else if (viewBoxAR > screenAR) {
      // viewBox mais largo que a tela → expandir altura
      const newHeight = width / screenAR;
      y -= (newHeight - height) / 2;
      height = newHeight;
    }

    // ═══════════════════════════════════════════════
    // 5. CLAMPING DE LIMITES
    // ═══════════════════════════════════════════════
    // Garante que o viewBox não saia dos limites do SVG pai.
    // Necessário porque Zoom Floor, Padding e Trava de AR
    // expandem simetricamente — podem ultrapassar as bordas
    // quando o elemento está próximo de um canto.

    [x, y, width, height] = clampViewBox(x, y, width, height, parentBBox);

    // ═══════════════════════════════════════════════
    // 6. STRING FINAL
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
