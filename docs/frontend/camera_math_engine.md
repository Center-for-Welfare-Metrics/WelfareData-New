# 📐 Motor de Cálculo de Câmera — `getElementViewBox`

> **Módulo:** `navigator/getElementViewBox.ts`  
> **Etapa:** 2 de 5  
> **Referência:** `GUIA_REPLICACAO_SVG_NAVIGATOR.md` §5  

---

## Visão Geral

O browser já é um motor de câmera embutido: ao alterar o atributo `viewBox` de um `<svg>`, o browser recalcula toda a projeção automaticamente. O módulo `getElementViewBox` calcula a string `viewBox` exata que enquadra qualquer elemento SVG na viewport com precisão — e é essa string que o GSAP interpolará nas etapas seguintes para criar a animação suave de "zoom".

```
getElementViewBox(element, originalViewBox?)  →  "142.5 80 450 300"
                                                   │     │   │    │
                                                   x     y   w    h  (coordenadas SVG)
```

- `element` — Qualquer elemento SVG a enquadrar
- `originalViewBox?` — ViewBox original do `<svg>` (capturado na injeção, antes de animações GSAP). Quando fornecido, o módulo faz um **swap síncrono** temporário do viewBox antes de chamar `getCTM()`, garantindo coordenadas estáveis independentemente do estado de animação.

---

## Arquitetura do Módulo

```
getElementViewBox.ts
├── getSvgParent()          Sobe na árvore DOM até o <svg>
├── getTransformedBBox()    BBox via CTM composta (svgCTM⁻¹ × elCTM)
├── getPercentageSize()     Área do elemento ÷ Área do SVG total
├── getAdaptivePadding()    Limiares de respiro
├── clampViewBox()          Restringe viewBox aos limites do SVG
└── getElementViewBox()     Função principal exportada
```

---

## Algoritmo Passo a Passo (Pipeline de 7 etapas)

### 0. Swap Síncrono do ViewBox (estabiliza getCTM)

O GSAP anima o atributo `viewBox` do `<svg>`. Isso faz com que `getCTM()` retorne coordenadas relativas ao viewBox **animado**, não ao original. Para o cálculo de BBox ser correto em qualquer momento (drill-down **e** drill-up), restauramos temporariamente o viewBox original antes de chamar `getCTM()`.

```typescript
if (originalViewBox) {
  const currentVB = svgParent.getAttribute("viewBox");
  if (currentVB !== originalViewBox) {
    svgParentForRestore = svgParent;
    animatedViewBox = currentVB;
    svgParent.setAttribute("viewBox", originalViewBox);
  }
}
```

O swap é **síncrono** (mesmo microtask) — o browser **NÃO renderiza** o estado intermediário. Um bloco `finally` garante a restauração do viewBox animado mesmo em caso de erro.

### 1. Bounding Boxes (CTM composta)

Extrai as coordenadas do elemento alvo projetadas no espaço do viewBox, usando CTM composta para lidar corretamente com transforms aninhados:

```typescript
const elBBox = getTransformedBBox(svgGfx, svgParent);
const parentBBox = svgParent.viewBox.baseVal;
```

- `elBBox` → {x, y, width, height} do elemento clicado, **projetado no espaço do viewBox** via `svgCTM⁻¹ × elCTM`
- `parentBBox` → viewBox declarado do SVG raiz (espaço que a câmera pode enquadrar)

> **Nota:** `getBBox()` retorna coords **locais** que ignoram transforms de ancestrais. `getTransformedBBox()` resolve isso compondo a CTM inversa do `<svg>` com a CTM do elemento: `svgParent.getCTM().inverse() × element.getCTM()`. Isso projeta os 4 cantos do BBox local no espaço de coordenadas do viewBox.

### 2. Zoom Floor (tamanho mínimo absoluto)

Em SVGs massivos, um CI pode ocupar 0.003% da área total. Sem um tamanho mínimo, o viewBox resultante seria microscópico (sem contexto visual).

**Constante:** `ZOOM_FLOOR_RATIO = 0.05` (definida em `consts.ts`)

$$
\text{minWidth} = \text{parentBBox.width} \times 0.05
$$

$$
\text{minHeight} = \text{parentBBox.height} \times 0.05
$$

Se o elemento for menor que o floor, o viewBox é expandido **simetricamente a partir do centro do elemento**:

$$
\text{centerX} = \text{elBBox.x} + \frac{\text{elBBox.width}}{2}
$$

$$
x' = \text{centerX} - \frac{\text{minWidth}}{2}, \quad width' = \text{minWidth}
$$

O mesmo para o eixo Y. Elementos maiores que o floor **não são afetados**.

### 3. Padding Adaptativo

Após o Zoom Floor garantir o tamanho mínimo, aplica-se um "respiro" visual. Os limiares foram calibrados para trabalhar **em conjunto** com o floor:

$$
\text{percentageSize} = \frac{\text{elArea} \times 100}{\text{svgArea}}
$$

**Tabela de limiares:**

| Tamanho relativo | Multiplicador | Efeito visual |
|---|---|---|
| $> 40\%$ da área | $0$ (sem padding) | Já ocupa quase tudo |
| $0.5\%$ a $40\%$ | $0.15$ (15%) | Margem confortável |
| $\leq 0.5\%$ | $0.25$ (25%) | Respiro sobre o Zoom Floor |

> **Nota:** O antigo valor de 1.5 (150%) para micro-elementos era uma muleta para compensar a ausência de Zoom Floor. Com o floor ativo, basta 25%.

**Aplicação simétrica:**

$$
x' = x - \frac{width \times padding}{2}, \quad width' = width + width \times padding
$$

$$
y' = y - \frac{height \times padding}{2}, \quad height' = height + height \times padding
$$

### 4. Trava de Aspect Ratio (bidirecional)

Garante que o viewBox resultante tenha **exatamente** o mesmo aspect ratio da viewport do browser. Sem isso, elementos muito largos ou muito altos renderizam colados nas bordas.

$$
\text{screenAR} = \frac{\text{window.innerWidth}}{\text{window.innerHeight}}
$$

$$
\text{viewBoxAR} = \frac{width}{height}
$$

- Se $\text{viewBoxAR} < \text{screenAR}$ (viewBox mais alto que a tela):

$$
width' = height \times \text{screenAR}, \quad x' = x - \frac{width' - width}{2}
$$

- Se $\text{viewBoxAR} > \text{screenAR}$ (viewBox mais largo que a tela):

$$
height' = \frac{width}{\text{screenAR}}, \quad y' = y - \frac{height' - height}{2}
$$

A expansão é sempre **simétrica**, mantendo o elemento no ponto focal.

### 5. Clamping de Limites

O Zoom Floor, Padding e Trava de AR podem empurrar o viewBox para fora dos limites do SVG (ex: elemento num canto + expansão simétrica). O clamping garante:

- `width ≤ parentBBox.width`, `height ≤ parentBBox.height`
- `x` fica entre `parentBBox.x` e `parentBBox.x + parentBBox.width - width`
- `y` fica entre `parentBBox.y` e `parentBBox.y + parentBBox.height - height`

### 6. String Final

Concatenação dos 4 valores ajustados:

```
"${x} ${y} ${width} ${height}"
```

---

## Visualização do Pipeline

```
┌──────────────────── SVG Total (viewBox original) ────────────────────┐
│                                                                       │
│     ┌──┐  ← Micro-elemento (ex: bebedouro, 0.003% da área)           │
│     └──┘                                                              │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘

     ↓ 0. Swap viewBox original (estabiliza getCTM)
     ↓ 1. getTransformedBBox(CTM composta)
     ↓ 2. Zoom Floor (min 5% do SVG)

┌──────────────────┐
│   ┌──┐           │  ← Câmera expandida para 5% mínimo
│   └──┘           │    (elemento centralizado)
└──────────────────┘

     ↓ 3. Padding Adaptativo (25%)

┌────────────────────────┐
│     ┌──┐               │  ← Respiro visual ao redor
│     └──┘               │
└────────────────────────┘

     ↓ 4. Trava de Aspect Ratio (casa com tela)

┌─────────────────────────────────┐
│          ┌──┐                   │  ← Mesmo AR da viewport
│          └──┘                   │    (sem distorção)
└─────────────────────────────────┘

     ↓ 5. Clamping (dentro dos limites)
     ↓ 6. return "x y w h"
     ↓ finally: restore viewBox animado

O GSAP (useNavigator) animará: viewBox antigo → viewBox novo em 0.7s
O browser recalcula a projeção automaticamente = "zoom" suave
```

---

## Proteções contra Falha

| Cenário | Proteção |
|---|---|
| `getCTM()`/`getBBox()` falha (elemento oculto/`display:none`) | `try/catch` retorna `null` |
| BBox com dimensão zero | Retorna `null` com `console.warn` |
| `<svg>` ancestral não encontrado | `getSvgParent()` lança erro (capturado pelo `try/catch`) |
| SVG sem área (vazio) | `getPercentageSize()` retorna `0` (divisão protegida) |
| Loop infinito em `getSvgParent()` | Limite de 10 iterações |
| ViewBox animado pelo GSAP durante cálculo | Swap síncrono + `finally` garante restauração mesmo em caso de erro |

---

## Funções Auxiliares

### `getSvgParent(el: Element): SVGSVGElement`

Sobe na árvore DOM até encontrar a tag `<svg>`. Limitado a 10 iterações para proteção contra DOMs corrompidos.

### `getTransformedBBox(element: SVGGraphicsElement, svgParent: SVGSVGElement): DOMRect`

Calcula a BBox do elemento **projetada no espaço de coordenadas do viewBox** do `<svg>` pai. Usa CTM composta (`svgParent.getCTM().inverse() × element.getCTM()`) para resolver corretamente transforms aninhados (`<g transform="translate(...)">`, `<g transform="scale(...)">`, etc.). Os 4 cantos da BBox local são transformados pela matriz composta e o AABB (axis-aligned bounding box) resultante é retornado.

### `getPercentageSize(elBBox: DOMRect, parentBBox: DOMRect): number`

Compara a área do elemento com a do SVG pai. Recebe ambas as BBoxes como argumentos puros (zero I/O interno). Retorna um valor entre 0 e 100.

### `getAdaptivePadding(percentageSize: number): number`

Mapeia o tamanho relativo a um multiplicador de padding: `0` (>40%), `0.15` (0.5–40%), `0.25` (≤0.5%).

### `clampViewBox(vx, vy, vw, vh, parentBBox): [x, y, w, h]`

Restringe o viewBox aos limites do SVG pai. Garante que width/height não excedam o pai e que x/y não saiam dos bounds.

---

## Integração com o Pipeline

```
Etapa 1 (✅) → extractInfoFromId.ts → identifica QUAL elemento navegar
Etapa 2 (✅) → getElementViewBox.ts  → calcula PARA ONDE a câmera vai
Etapa 3 (✅) → useNavigator.ts       → ANIMA a transição com GSAP
Etapa 4 (✅) → useHoverEffects.ts    → efeitos visuais de hover
Etapa 5 (🔲) → useEventBus.ts        → navegação programática
```

---

## Exemplo de Uso

```typescript
import { getElementViewBox } from "@/components/processogram/navigator";
import { gsap } from "gsap";

// originalViewBox capturado na injeção do SVG (antes de animações)
const originalViewBox = originalViewBoxRef.current;

// 1. Calcula o viewBox destino (swap síncrono interno estabiliza getCTM)
const targetViewBox = getElementViewBox(targetElement, originalViewBox);
if (!targetViewBox) return;

// 2. GSAP interpola os 4 números automaticamente
gsap.to(svgElement, {
  attr: { viewBox: targetViewBox },
  duration: 0.7,
  ease: "power1.inOut",
});
```
