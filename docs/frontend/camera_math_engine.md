# 📐 Motor de Cálculo de Câmera — `getElementViewBox`

> **Módulo:** `navigator/getElementViewBox.ts`  
> **Etapa:** 2 de 5  
> **Referência:** `GUIA_REPLICACAO_SVG_NAVIGATOR.md` §5  

---

## Visão Geral

O browser já é um motor de câmera embutido: ao alterar o atributo `viewBox` de um `<svg>`, o browser recalcula toda a projeção automaticamente. O módulo `getElementViewBox` calcula a string `viewBox` exata que enquadra qualquer elemento SVG na viewport com precisão — e é essa string que o GSAP interpolará nas etapas seguintes para criar a animação suave de "zoom".

```
getElementViewBox(element)  →  "142.5 80 450 300"
                                 │     │   │    │
                                 x     y   w    h  (coordenadas SVG)
```

---

## Arquitetura do Módulo

```
getElementViewBox.ts
├── getSvgParent()        Sobe na árvore DOM até o <svg>
├── getPercentageSize()   Área do elemento ÷ Área do SVG total
├── getAdaptivePadding()  Limiares de respiro
└── getElementViewBox()   Função principal exportada
```

---

## Algoritmo Passo a Passo

### 1. Bounding Box Nativa (`getBBox()`)

O método nativo `getBBox()` retorna as coordenadas no espaço de coordenadas do SVG (não pixels de tela):

```typescript
const { x, y, width, height } = (element as SVGGraphicsElement).getBBox();
```

- `x, y` → canto superior esquerdo do retângulo envolvente
- `width, height` → dimensões do retângulo

### 2. Compensação de Aspect Ratio

Se a tela é landscape (16:9) mas o elemento-alvo é portrait (mais alto que largo), um `viewBox` ingênuo distorceria a projeção ou deixaria o elemento descentralizado.

**Cálculo:**

$$
\text{screenRatio} = \frac{\text{innerHeight}}{\text{innerWidth}}
$$

$$
\text{elementRatio} = \frac{\text{height}}{\text{width}}
$$

$$
\text{ratioDiff} = |\text{screenRatio} - \text{elementRatio}| \times 2
$$

**Quando compensar:** quando o elemento é vertical (`elementRatio ≥ 1`), independente da orientação da tela. Nesse caso, alargamos o viewBox horizontalmente:

$$
x' = x - \frac{width \times ratioDiff}{2}
$$

$$
width' = width + width \times ratioDiff
$$

Isso centraliza o elemento horizontalmente e evita que ele fique "espremido" na viewport.

### 3. Padding Adaptativo

Elementos de tamanhos diferentes precisam de quantidades diferentes de "respiro" ao redor. Um grupo que ocupa 60% do SVG já preenche a tela — não precisa de margem. Mas um elemento minúsculo (0.1% da área) ficaria visualmente "colado" nas bordas sem padding generoso.

**Cálculo do tamanho relativo:**

$$
\text{percentageSize} = \frac{\text{elArea} \times 100}{\text{svgArea}}
$$

**Tabela de limiares:**

| Tamanho relativo | Multiplicador | Efeito visual |
|---|---|---|
| $> 40\%$ da área | $0$ (sem padding) | Já ocupa quase tudo |
| $0.5\%$ a $40\%$ | $0.2$ (20%) | Margem confortável |
| $\leq 0.5\%$ | $1.5$ (150%) | Zoom-out generoso |

**Aplicação simétrica:**

$$
x' = x - \frac{width \times padding}{2}, \quad width' = width + width \times padding
$$

$$
y' = y - \frac{height \times padding}{2}, \quad height' = height + height \times padding
$$

### 4. String Final

O resultado é a concatenação simples dos 4 valores ajustados:

```
"${x} ${y} ${width} ${height}"
```

---

## Visualização do Fluxo

```
┌──────────────────── SVG Total (viewBox original) ────────────────────┐
│                                                                       │
│     ┌────────────┐                                                    │
│     │  Elemento   │  ← getBBox() retorna {x, y, width, height}       │
│     │  Clicado    │                                                   │
│     └────────────┘                                                    │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘

                      ↓ Compensação + Padding ↓

┌──── viewBox calculado (com compensação + padding) ────┐
│                                                        │
│   ┌──────────────────┐                                 │
│   │    Elemento       │ ← Centralizado com respiro     │
│   │    Clicado        │                                │
│   └──────────────────┘                                 │
│                                                        │
└────────────────────────────────────────────────────────┘

O GSAP (Etapa 3) animará: viewBox antigo → viewBox novo em 0.7s
O browser recalcula a projeção automaticamente = "zoom" suave
```

---

## Proteções contra Falha

| Cenário | Proteção |
|---|---|
| `getBBox()` falha (elemento oculto/`display:none`) | `try/catch` retorna `null` |
| BBox com dimensão zero | Retorna `null` com `console.warn` |
| `<svg>` ancestral não encontrado | `getSvgParent()` lança erro (capturado pelo `try/catch`) |
| SVG sem área (vazio) | `getPercentageSize()` retorna `0` (divisão protegida) |
| Loop infinito em `getSvgParent()` | Limite de 10 iterações |

---

## Funções Auxiliares

### `getSvgParent(el: Element): SVGSVGElement`

Sobe na árvore DOM até encontrar a tag `<svg>`. Limitado a 10 iterações para proteção contra DOMs corrompidos.

### `getPercentageSize(element: Element): number`

Compara a área do `getBBox()` do elemento com a do `<svg>` pai. Retorna um valor entre 0 e 100.

### `getAdaptivePadding(percentageSize: number): number`

Mapeia o tamanho relativo a um multiplicador de padding usando os limiares fixos documentados acima.

---

## Integração com o Pipeline

```
Etapa 1 (✅) → extractInfoFromId.ts → identifica QUAL elemento navegar
Etapa 2 (✅) → getElementViewBox.ts  → calcula PARA ONDE a câmera vai
Etapa 3 (🔲) → useNavigator.ts       → ANIMA a transição com GSAP
Etapa 4 (🔲) → useHoverEffects.ts    → efeitos visuais de hover
Etapa 5 (🔲) → useEventBus.ts        → navegação programática
```

---

## Exemplo de Uso (Prévia da Etapa 3)

```typescript
import { getElementViewBox } from "@/components/processogram/navigator";
import { gsap } from "gsap";

// 1. Calcula o viewBox destino
const targetViewBox = getElementViewBox(targetElement);
if (!targetViewBox) return;

// 2. GSAP interpola os 4 números automaticamente
gsap.to(svgElement, {
  attr: { viewBox: targetViewBox },
  duration: 0.7,
  ease: "power1.inOut",
});
```
