# SVG Navigation Architecture

> Data: 24/02/2026  
> Status: **Etapa 1 de 5** — Fundação (tipos, constantes, parser)

---

## 1. Decisão Arquitetural

### Antes (sistema legado v1)

```
dangerouslySetInnerHTML → <div> com SVG string
  + react-zoom-pan-pinch (TransformWrapper)
  + hooks manuais de pan/zoom (useViewBoxCamera, useSvgPanZoom)
  + setPointerCapture para pan (causava conflito com cliques)
```

**Problemas:**
- `dangerouslySetInnerHTML` não dá acesso tipado ao `<svg>` DOM
- `react-zoom-pan-pinch` aplica CSS transforms → gera desfoque em zoom
- `setPointerCapture` imediato bloqueava eventos de click
- Pan manual + câmera GSAP competiam pelo `viewBox`

### Agora (sistema v2 — em implementação)

```
react-inlinesvg → <svg> DOM real injetado no React tree
  + GSAP animando viewBox nativo (câmera)
  + Sem biblioteca de zoom — o browser É o motor de câmera
  + Parser de IDs semânticos (navigator/) para drill-down
```

**Vantagens:**
| Aspecto | v1 | v2 |
|---|---|---|
| Injeção SVG | `dangerouslySetInnerHTML` | `react-inlinesvg` (`innerRef`) |
| Zoom | CSS `transform: scale()` | SVG `viewBox` nativo |
| Qualidade | Desfoca em zoom | Zero desfoque (re-render vetorial) |
| Câmera | Hooks manuais + `setPointerCapture` | GSAP `attr: { viewBox }` |
| IDs semânticos | Regex adhoc (legado) | Módulo `navigator/` dedicado |
| Click handling | Conflito pointer capture vs synthetic click | Sem pointer capture no click |

---

## 2. Módulo `navigator/`

Localização: `frontend/src/components/processogram/navigator/`

```
navigator/
├── index.ts                  ← Barrel export
├── consts.ts                 ← Constantes (níveis, animação, filtros visuais)
├── types.ts                  ← Tipagens (HierarchyItem, HistoryLevel, EventBus, ParsedElementId)
├── extractInfoFromId.ts      ← Parser de IDs semânticos do SVG
├── getElementViewBox.ts      ← Cálculo de viewBox destino (câmera math)
├── hierarchy.ts              ← Hierarquia DOM → breadcrumb path
├── useSvgNavigatorLogic.ts   ← Orquestrador (compõe os 3 hooks abaixo)
└── hooks/
    ├── useNavigator.ts       ← Motor de câmera (GSAP viewBox + isolamento visual)
    ├── useClickHandler.ts    ← Interceptação de cliques (drill-down/up/close)
    └── useHoverEffects.ts    ← Efeitos visuais de hover (focus/mute)
```

### 2.1. Convenção de IDs (`extractInfoFromId.ts`)

O sistema inteiro depende de uma convenção nos IDs dos `<g>` do SVG:

```
{nome-slugificado}--{alias-de-nivel}[dígitos-opcionais]
```

#### Regex central

```typescript
const NAVIGABLE_ID_REGEX = /^(.+)--(ps|lf|ph|ci)\d*$/;
```

#### Hierarquia de níveis

| Sufixo | Nível | Significado | Exemplo |
|--------|-------|-------------|---------|
| `--ps` | 0 | Production System (raiz) | `broiler--ps` |
| `--lf` | 1 | Life Fate | `growing--lf1` |
| `--ph` | 2 | Phase | `feeding--ph2` |
| `--ci` | 3 | Circumstance (folha) | `heat-stress--ci1` |

#### Funções exportadas

| Função | Input | Output | Uso |
|--------|-------|--------|-----|
| `parseElementId(id)` | `"maternity--ph1"` | `{ baseName: "maternity", levelAlias: "ph", levelNumber: 2, ... }` | Parse completo |
| `isNavigableId(id)` | `"maternity--ph1"` | `true` | Check rápido |
| `getElementNameFromId(id)` | `"heat-stress--ci1"` | `"Heat Stress"` | Label UI |
| `getLevelNumberById(id)` | `"growing--lf1"` | `1` | Lógica drill-down |
| `getLevelAliasFromId(id)` | `"growing--lf1"` | `"lf"` | CSS selectors |
| `getElementLevelFromId(id)` | `"growing--lf1"` | `"Life Fate"` | Label UI |
| `getSelectorForLevel(n)` | `1` | `"--lf"` | querySelector |
| `isMaxLevel(n)` | `3` | `true` | Guard drill-down |
| `deslugify(slug)` | `"heat-stress"` | `"Heat Stress"` | UI |

### 2.2. Identificação de profundidade

Quando o utilizador clica num elemento SVG, o sistema usa `parseElementId` para determinar em que nível da hierarquia o clique ocorreu. A partir daí:

```
Clique em "feeding--ph2"
  │
  ▼
parseElementId("feeding--ph2")
  → { levelNumber: 2, levelAlias: "ph", baseName: "feeding" }
  │
  ▼
Se levelNumber > currentLevel → DRILL-DOWN (zoom in)
Se levelNumber ≤ currentLevel → DRILL-UP (zoom out)
Se levelNumber === MAX_LEVEL  → FOLHA (não navega mais fundo)
```

O parser **nunca** faz `document.querySelector` — é uma função pura que opera apenas na string do ID. A resolução do elemento DOM é feita por outros módulos (`InteractiveLayer`, `hierarchy`).

---

## 3. Roadmap de Etapas

| Etapa | Descrição | Status |
|-------|-----------|--------|
| **1** | Constantes, tipos, parser de IDs, shell do ProcessogramViewer | ✅ Concluída |
| **2** | `getElementViewBox` (cálculo da câmera via BBox) | ✅ Concluída |
| **3** | `hierarchy.ts` + `useNavigator` (changeLevelTo) + `useClickHandler` | ✅ Concluída |
| **4** | `useHoverEffects` (focus/mute visual via GSAP filter) + blackout no `useNavigator` | ✅ Concluída |
| **5** | `useEventBus` (navegação programática — breadcrumb, botão voltar) | 🔲 |

---

## 4. Dependências

| Pacote | Versão | Propósito |
|--------|--------|-----------|
| `gsap` | `^3.14.2` | Animar `viewBox` e `filter` CSS |
| `react-inlinesvg` | `^4.x` | Injetar SVG como DOM real |
| `framer-motion` | `^12.x` | Animações de UI (fade, mount/unmount) |

**Removidas:** `react-zoom-pan-pinch` (nunca foi instalada no v2, mas referências em docs foram mantidas para histórico).
