# Sistema Completo de Navegação SVG — Documentação Técnica

> **Status:** Referência Técnica Completa
> **Data:** 09/03/2026
> **Módulo:** `frontend/src/components/processogram/navigator/`
> **Autores:** WFI Engineering Team

---

## Índice

1. [Visão Geral do Sistema](#1-visão-geral-do-sistema)
2. [Arquitetura de Ficheiros](#2-arquitetura-de-ficheiros)
3. [Cadeia de Dados (Ponta a Ponta)](#3-cadeia-de-dados-ponta-a-ponta)
4. [Convenção de IDs Semânticos](#4-convenção-de-ids-semânticos)
5. [Orquestrador Central — `useSvgNavigatorLogic`](#5-orquestrador-central--usesvgnavigatorlogic)
6. [Motor de Câmera — `useNavigator`](#6-motor-de-câmera--usenavigator)
7. [Motor de Câmera Math — `getElementViewBox`](#7-motor-de-câmera-math--getelementviewbox)
8. [Interceptação de Cliques — `useClickHandler`](#8-interceptação-de-cliques--useclickhandler)
9. [Efeitos de Hover — `useHoverEffects`](#9-efeitos-de-hover--usehovereffects)
10. [Hierarquia & Breadcrumb — `hierarchy.ts`](#10-hierarquia--breadcrumb--hierarchyts)
11. [Motor de Rasterização Dinâmica (LOD via PNG Swap)](#11-motor-de-rasterização-dinâmica-lod-via-png-swap)
12. [Prefetch de Raster — `usePrefetchRaster`](#12-prefetch-de-raster--useprefetchraster)
13. [Motor de Swap O(1) — `useOptimizeSvgParts`](#13-motor-de-swap-o1--useoptimizesvgparts)
14. [Backend — Pipeline de Rasterização](#14-backend--pipeline-de-rasterização)
15. [Sistema de Temas (Light / Dark)](#15-sistema-de-temas-light--dark)
16. [Gargalo: Rasterização Ausente no Dark Mode](#16-gargalo-rasterização-ausente-no-dark-mode)
17. [Proteções Anti-Bug & Race Conditions](#17-proteções-anti-bug--race-conditions)
18. [Gargalos de Performance Identificados](#18-gargalos-de-performance-identificados)
19. [Constantes & Configuração](#19-constantes--configuração)
20. [Diagrama de Sequência Completo](#20-diagrama-de-sequência-completo)

---

## 1. Visão Geral do Sistema

O sistema de navegação SVG implementa uma **câmera cinematográfica** sobre processogramas vectoriais. O utilizador clica num grupo hierárquico do SVG e a câmera "desliza" suavemente até enquadrá-lo, escurecendo os elementos fora de foco e substituindo-os por imagens PNG pré-renderizadas para otimizar a performance de rendering.

### Princípios Fundamentais

| Princípio | Implementação |
|-----------|---------------|
| **Zero desfoque em zoom** | O browser é o motor de câmera — altera-se o `viewBox` nativo do SVG, não CSS `transform: scale()`. O browser re-rasteriza vectorialmente a cada frame. |
| **Zero re-renders React durante hover** | Event Delegation nativa no `<svg>` — `mousemove`/`mouseleave` registados diretamente no DOM. O React nunca sabe que o rato se moveu. |
| **LOD via PNG Swap** | Elementos fora de foco são substituídos por PNGs pré-renderizados (Puppeteer + Sharp). Custo O(1) por swap (~0.1ms) vs 30–80ms na v1 (Canvas client-side). |
| **Refs vs State** | Todos os valores lidos sincronicamente em event handlers ou callbacks GSAP usam `useRef()`. Apenas o `svgElement` (que dispara hooks) usa `useState()`. |
| **Preservação de cores originais** | Sistema nunca altera `fill`, `stroke` ou `opacity`. Usa exclusivamente `filter: brightness()` (dark) ou `filter: grayscale()` (light) via GSAP. |

### Evolução do Sistema

| Versão | Problema | Solução |
|--------|----------|---------|
| **v1 (legado)** | `dangerouslySetInnerHTML` + `react-zoom-pan-pinch` + CSS transforms → desfoque em zoom | Eliminado. SVG injetado via `react-inlinesvg` com `viewBox` nativo. |
| **v2** | Rasterização Canvas client-side: 30–80ms/elemento | LOD via PNG Swap: lookup O(1) em PNGs pré-renderizados pelo backend |
| **v2.1** | 1200 filter repaints/frame durante 0.7s + swap síncrono | rAF time-slicing (400 el/frame) + `gsap.set` instantâneo |
| **v2.2** | Ancestrais do target rasterizados → target desfocado | Filtro `el.contains(target)` + guarda defensiva `protectedIds` |
| **v2.3** | PNGs de irmãos cobriam o target (z-order SVG) | Elevação do target (`appendChild`) + herança de filtro no `<image>` |

---

## 2. Arquitetura de Ficheiros

```
navigator/
├── index.ts                       ← Barrel export (ponto de entrada único)
├── consts.ts                      ← Constantes: animação, filtros, dicionário de níveis
├── types.ts                       ← Tipagens: HierarchyItem, HistoryLevel, ParsedElementId, etc.
├── extractInfoFromId.ts           ← Parser de IDs semânticos (fonte única de verdade)
├── getElementViewBox.ts           ← Motor de câmera math (BBox → viewBox → string)
├── hierarchy.ts                   ← Resolução de ancestrais (closest) → breadcrumb path
├── useSvgNavigatorLogic.ts        ← ORQUESTRADOR: compõe todos os hooks + expõe API
└── hooks/
    ├── useNavigator.ts            ← Motor de câmera (changeLevelTo: GSAP viewBox + isolamento)
    ├── useClickHandler.ts         ← Interceptação global de cliques (drill-down/up/close)
    ├── useHoverEffects.ts         ← Hover (Event Delegation nativa — zero re-renders)
    ├── usePrefetchRaster.ts       ← Prefetch de PNGs: img.decode() → RAM do browser
    └── useOptimizeSvgParts.ts     ← Motor de Swap O(1): <g> → display:none + <image>
```

### Dependências entre Módulos

```
page.tsx
  │
  └─ useSvgNavigatorLogic ──────────────────── ORQUESTRADOR
       │
       ├─ usePrefetchRaster ──────────────────── Prefetch PNGs (Etapa 1+2)
       │    → imageCache: Map<string, HTMLImageElement>
       │
       ├─ useOptimizeSvgParts ────────────────── Motor de Swap (Etapa 3)
       │    → optimizeLevelElements()
       │    → restoreAllRasterized()
       │    ↑ depende de: imageCache, rasterImages
       │
       ├─ useNavigator ──────────────────────── Motor de Câmera
       │    → changeLevelTo()
       │    ↑ depende de: optimizeLevelElements, restoreAllRasterized
       │    ↑ usa: getElementViewBox, extractInfoFromId, consts
       │
       ├─ useClickHandler ───────────────────── Interceptação de Cliques
       │    → handleClick()
       │    ↑ depende de: changeLevelTo
       │
       └─ useHoverEffects ───────────────────── Hover (Event Delegation)
            ↑ depende de: refs do orquestrador (lockInteraction, currentLevel, etc.)
```

**Regra de instanciação:** Os hooks DEVEM ser instanciados na ordem acima. `usePrefetchRaster` antes de `useOptimizeSvgParts`, que por sua vez antes de `useNavigator`, que antes de `useClickHandler`.

---

## 3. Cadeia de Dados (Ponta a Ponta)

```
┌──────────────────────────────────────────────────────────────────────┐
│  BACKEND (Upload do SVG)                                             │
│                                                                      │
│  CreateProcessogramUseCase                                           │
│    ├─ SvgProcessorService.process(buffer)                            │
│    │    ├─ SVGO optimize (Worker Thread)                             │
│    │    ├─ normalizeSemanticIdsPlugin (IDs: sow_lf → sow--lf)       │
│    │    ├─ Puppeteer launch (viewport = viewBox, @2x DPR)           │
│    │    ├─ BBOX_EXTRACTION_SCRIPT → getCTM + getBBox p/ cada <g>    │
│    │    ├─ page.screenshot(clip) → Sharp PNG compress → Buffer      │
│    │    └─ return { optimizedSvg, rasterImages: Map<id, {x,y,w,h}> }│
│    │                                                                 │
│    ├─ Storage.upload(svgBuffer, "…/light/{slug}.svg")                │
│    ├─ Storage.upload(pngBuffer, "…/light/raster/{id}.png") × N      │
│    │                                                                 │
│    └─ ProcessogramModel.create({                                     │
│         svg_url_light: "https://storage.../light/{slug}.svg",        │
│         raster_images_light: { [id]: { src, x, y, w, h } },         │
│         raster_images_dark: {},  // ← VAZIO (não implementado)       │
│       })                                                             │
└──────────────────────────────────────────────────────────────────────┘
                                 │
                                 │ GET /api/v1/processograms/:id
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│  FRONTEND (page.tsx)                                                 │
│                                                                      │
│  1. Fetch processogram → state.processogram                         │
│  2. currentTheme = useTheme().resolvedTheme === "light" ? "light"   │
│     : "dark"                                                         │
│  3. rasterImages = currentTheme === "dark"                           │
│       ? state.processogram.raster_images_dark   // {} no dark        │
│       : state.processogram.raster_images_light  // preenchido        │
│  4. svgUrl = `/api/v1/processograms/${id}/svg?theme=${theme}`        │
│  5. <ProcessogramViewer onSvgReady={updateSvgElement} />             │
│  6. useSvgNavigatorLogic({ currentTheme, rasterImages, ... })        │
│                                                                      │
│  ┌─ useSvgNavigatorLogic ──────────────────────────────────────────┐ │
│  │  ├─ usePrefetchRaster(rasterImages)                             │ │
│  │  │    → imageCache: Map<id, HTMLImageElement>                   │ │
│  │  │    → early return se rasterImages === {} (dark mode)         │ │
│  │  │                                                              │ │
│  │  ├─ useOptimizeSvgParts({ svgElement, rasterImages, imageCache })│ │
│  │  │    → optimizeLevelElements()                                 │ │
│  │  │    → restoreAllRasterized()                                  │ │
│  │  │                                                              │ │
│  │  ├─ useNavigator({ ..., optimizeLevelElements,                  │ │
│  │  │                restoreAllRasterized })                       │ │
│  │  │    → changeLevelTo()                                         │ │
│  │  │                                                              │ │
│  │  ├─ useClickHandler({ changeLevelTo, ... })                     │ │
│  │  │    → handleClick() [registado no window]                     │ │
│  │  │                                                              │ │
│  │  └─ useHoverEffects({ svgElement, ... })                        │ │
│  │       → mousemove/mouseleave [registados no <svg> DOM]          │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 4. Convenção de IDs Semânticos

O sistema inteiro depende de IDs nos elementos `<g>` do SVG com o formato:

```
{nome-slugificado}--{alias-de-nível}[dígitos-opcionais]
```

### Hierarquia de Níveis

| Sufixo | Nível | Significado | Exemplo |
|--------|-------|-------------|---------|
| `--ps` | 0 | Production System (raiz) | `broiler--ps` |
| `--lf` | 1 | Life Fate | `growing--lf1` |
| `--ph` | 2 | Phase | `feeding--ph2` |
| `--ci` | 3 | Circumstance (folha) | `heat-stress--ci1` |

### Parser (`extractInfoFromId.ts`)

O parser é a **única fonte de verdade** para decodificar IDs. Nenhum outro ficheiro faz `split("--")`.

**Abordagem:** `split("--")` → extrai alias puro (só letras, lowercase) → lookup em `LEVELS_DICT`.

**Formatos suportados:**

| ID Real | Split | Alias Puro | Nível |
|---------|-------|------------|-------|
| `laying_hen--lf` | `lf` | `lf` | 1 |
| `fan--ci008` | `ci008` | `ci` | 3 |
| `hen--ci-42` | `ci-42` | `ci` | 3 |
| `egg_belt--ci-58` | `ci-58` | `ci` | 3 |
| `SOW--LF` | `LF` | `lf` | 1 |
| `some-random-id` | — | — | não navegável |

A normalização para lowercase garante compatibilidade com IDs em maiúsculas vindos de SVGs exportados por diferentes editores.

### Funções Exportadas

| Função | Input | Output | Descrição |
|--------|-------|--------|-----------|
| `isNavigableId(id)` | `"growing--lf1"` | `true` | Check rápido de convenção |
| `parseElementId(id)` | `"maternity--ph1"` | `{ baseName, levelAlias, levelNumber, ... }` | Parse completo com discriminated union |
| `getElementNameFromId(id)` | `"heat-stress--ci1"` | `"Heat Stress"` | Label legível (deslugificado) |
| `getLevelNumberById(id)` | `"growing--lf1"` | `1` | Índice numérico do nível |
| `getLevelAliasFromId(id)` | `"growing--lf1"` | `"lf"` | Alias puro |
| `getElementLevelFromId(id)` | `"growing--lf1"` | `"Life Fate"` | Label legível do nível |
| `getSelectorForLevel(n)` | `1` | `"--lf"` | CSS selector suffix |
| `isMaxLevel(n)` | `3` | `true` | Guard contra drill-down além da folha |
| `deslugify(slug)` | `"heat-stress"` | `"Heat Stress"` | Conversão slug → título |

### Normalização no Backend

SVGs exportados por Illustrator e Inkscape podem usar formatos diferentes:

```
sow_lf          ← Illustrator (separador _)
sow--lf         ← Convenção canônica
```

O backend resolve isso no pipeline SVGO com o **`normalizeSemanticIdsPlugin`**, que converte automaticamente `_lf`, `_ph`, `_ci`, `_ps` para `--lf`, `--ph`, `--ci`, `--ps` durante o upload.

**Consequência:** O frontend usa uma abordagem simples baseada em `indexOf("--")` sem precisar lidar com múltiplos formatos. A responsabilidade de normalização é **100% do backend**.

---

## 5. Orquestrador Central — `useSvgNavigatorLogic`

**Ficheiro:** `navigator/useSvgNavigatorLogic.ts`

O orquestrador é o **único ponto de contacto** entre o `page.tsx` e o sistema de navegação. Compõe os 5 hooks internos numa interface de fachada simples.

### Props

```typescript
interface UseSvgNavigatorLogicProps {
  currentTheme: "dark" | "light";                    // Tema visual atual
  onChange: (identifier: string, hierarchy: HierarchyItem[]) => void;  // Notifica UI
  onClose: () => void;                               // Drill-up além do root
  rasterImages: Record<string, RasterImage> | undefined;  // Metadados PNG do tema atual
}
```

### Return

```typescript
interface UseSvgNavigatorLogicReturn {
  updateSvgElement: (svgEl: SVGSVGElement) => void;  // Registra o <svg> DOM
  navigateToLevel: (levelIndex: number) => void;      // Navegação programática
}
```

### Estado Interno

| Tipo | Nome | Descrição |
|------|------|-----------|
| `useState` | `svgElement` | Referência ao `<svg>` DOM real. **Único state** — dispara montagem dos hooks. |
| `useRef` | `historyLevelRef` | Mapa nível → último ID visitado. Permite drill-up. |
| `useRef` | `currentLevelRef` | Nível numérico atual (0–3). |
| `useRef` | `currentElementIdRef` | ID do elemento enquadrado. |
| `useRef` | `lockInteractionRef` | Flag de trava durante animações. |
| `useRef` | `originalViewBoxRef` | ViewBox original do SVG (pré-animação). Estabiliza `getCTM()`. |

**Por que refs e não state?** Todos estes valores são lidos **sincronicamente** dentro de event handlers (clique, mousemove) e callbacks GSAP (`onComplete`). Com `useState`, o React agendaria o update para o próximo render — o handler leria o valor stale. `useRef` dá acesso síncrono ao valor mais recente.

### Helpers Internos

#### `getElementIdentifierWithHierarchy(id)`

Dado um ID, usa `querySelector` + `getHierarchy()` para montar o identificador hierárquico pontilhado e o breadcrumb path.

```
"feeding--ph1" → ["broiler.growing.feeding", [
  { level: "Production System", name: "Broiler", rawId: "broiler--ps" },
  { level: "Life Fate",         name: "Growing", rawId: "growing--lf1" },
  { level: "Phase",             name: "Feeding", rawId: "feeding--ph1" },
]]
```

#### `setFullBrightnessToCurrentLevel(toPrevious)`

Restaura `FOCUSED_FILTER[currentTheme]` no elemento enquadrado + filhos do próximo nível. Chamado após a animação de `changeLevelTo` completar.

- **Drill-up:** duração completa (0.7s) = transição suave
- **Drill-down:** metade (0.35s) = resposta tátil rápida

### Navegação Programática (`navigateToLevel`)

Usado pelo breadcrumb e botão Home:

| `levelIndex` | Comportamento |
|--------------|---------------|
| `< 0` | Reset total: anima viewBox ao original, limpa refs, chama `onClose()` |
| `0` | Volta ao root (Production System) |
| `1–3` | Consulta histórico + `changeLevelTo(element, true)` |
| `=== currentLevel` | Ignora (já está nesse nível) |

O reset total inclui:
1. `restoreAllRasterized()` — DOM limpo
2. Blindagem de eventos (lock + pointerEvents + killTweensOf)
3. `gsap.to(allFiltered, { filter: FOCUSED_FILTER })` — reverte escurecimento
4. `gsap.to(svgElement, { attr: { viewBox: original } })` — câmera volta
5. Limpa refs (`historyLevel`, `currentLevel`, `currentElementId`)
6. Chama `onClose()`

### Registo do Click Listener

O listener é registado no `window` (não no SVG) via `useEffect`:

```typescript
useEffect(() => {
  if (!svgElement) return;
  window.addEventListener("click", handleClick);
  return () => window.removeEventListener("click", handleClick);
}, [svgElement, handleClick]);
```

**Razão:** Eventos de clique em `<text>`, `<path>` e `<tspan>` dentro do SVG **não propagam de forma confiável** para o `<svg>` raiz em todos os browsers.

---

## 6. Motor de Câmera — `useNavigator`

**Ficheiro:** `navigator/hooks/useNavigator.ts`

Expõe `changeLevelTo(target, toPrevious, callback?)` — a função central que anima o `viewBox` do `<svg>` raiz até enquadrar qualquer elemento SVG.

### Sequência de Operações (changeLevelTo)

```
changeLevelTo(target, toPrevious)
       │
       ▼
  0. restoreAllRasterized()          ← DOM limpo (sync)
       │
       ▼
  1. getElementViewBox(target, originalViewBox)
     └─ BBox transformada → Zoom Floor → Padding → Trava AR → Clamping → "x y w h"
       │
       ▼
  2. Salvar no histórico
     └─ historyLevelRef[level] = { id }
     └─ currentElementIdRef = id
     └─ currentLevelRef = level
       │
       ▼
  3. Construir outOfFocusSelector
     └─ MAX_LEVEL: irmãos do mesmo nível
     └─ Outros: tudo com "--" que NÃO é descendente do target
     └─ Filtrar ancestrais: .filter(el => !el.contains(target))
       │
       ▼
  3b. Blindagem DOM
      └─ lockInteractionRef = true
      └─ svgElement.style.pointerEvents = "none"
      └─ gsap.killTweensOf(todos os [id*="--"])
       │
       ▼
  4. Escurecimento INSTANTÂNEO (gsap.set)
     └─ outOfFocusAnimationRef.current.revert()  ← reverte anterior
     └─ gsap.set(outOfFocusElements, { filter: UNFOCUSED_FILTER[theme] })
       │
       ▼
  5. Notificar onChange(identifier, hierarchy)
       │
       ▼
  5.5. optimizeLevelElements(target, outOfFocusElements)
       └─ Agenda rasterização: target → vectorial, irmãos → PNG
       └─ Primeiro chunk no próximo rAF
       │
       ▼
  6. gsap.to(svgElement, {
       attr: { viewBox: "x y w h" },
       duration: 0.7,
       ease: "power1.inOut",
       onComplete: () => {
         pointerEvents: "auto"
         setFullBrightnessToCurrentLevel(toPrevious)
         lockInteractionRef = false
         callback?.()
       }
     })
```

### Isolamento Visual por Nível

| Nível do Target | Selector `outOfFocus` | Lógica |
|-----------------|----------------------|--------|
| MAX_LEVEL (ci) | `[id*="--ci" i]:not([id="${id}"])` | Escurece irmãos do mesmo nível |
| Outros (ps, lf, ph) | `[id*="--"]:not([id^="${id}"] *):not([id="${id}"])` | Escurece tudo que NÃO é descendente do target |

**Proteção de Ancestrais (v2.2):**

O selector CSS não consegue excluir ancestrais nativamente. O filtro pós-query resolve:

```typescript
const outOfFocusElements = Array.from(
  svgElement.querySelectorAll(outOfFocusSelector)
).filter(el => !el.contains(target));
```

`el.contains(target)` é O(1) DOM nativo. Impede que:
- CSS `filter` no ancestral propague `brightness(0.3)` para o target
- `display:none` no ancestral oculte o target atrás de um PNG

### Escurecimento Instantâneo (v2.1)

```typescript
// ANTES (v2): interpolação animada — 1200 repaints/frame por 0.7s
gsap.to(outOfFocusElements, { filter: UNFOCUSED_FILTER[theme], duration: 0.7 });

// DEPOIS (v2.1): aplicação instantânea — 1 reflow síncrono
gsap.set(outOfFocusElements, { filter: UNFOCUSED_FILTER[theme] });
```

**Impacto:** Elimina ~50.400 repaints (1200 nós × 42 frames). O `gsap.set()` retorna um `Tween` com `.revert()` funcional — o contrato de cleanup é preservado.

### Timeline de uma Transição (0.7s)

```
t=0ms:      viewBox = "0 0 1200 800"    pointerEvents = none    lock = true
            gsap.set: filter aplicado instantaneamente em 1200 elementos
            optimizeLevelElements: primeiro chunk agendado para próximo rAF
t=16ms:     rAF: processChunk(0..399) — 400 swaps DOM
t=33ms:     rAF: processChunk(400..799) — 400 swaps DOM
t=50ms:     rAF: processChunk(800..1199) — 400 swaps DOM
t=350ms:    viewBox interpolando... (GSAP anima frame a frame)
t=700ms:    viewBox = "200 100 400 300"  pointerEvents = auto    lock = false
            setFullBrightnessToCurrentLevel → filhos com brilho total
```

---

## 7. Motor de Câmera Math — `getElementViewBox`

**Ficheiro:** `navigator/getElementViewBox.ts`

Calcula a string `viewBox` ideal para enquadrar qualquer elemento SVG na viewport, com pipeline de 6 etapas.

### Pipeline Completo

```
┌─────────────────────────────────────────────────────────────────────┐
│  ETAPA 0: Swap Síncrono do ViewBox                                  │
│                                                                     │
│  O GSAP anima o viewBox → getCTM() retorna coords do viewBox       │
│  ANIMADO, não do original. Restaurar temporariamente o              │
│  originalViewBox antes de chamar getCTM() garante coords estáveis.  │
│  Swap é síncrono (mesmo microtask) → browser NÃO renderiza estado  │
│  intermediário. O finally garante restauração.                      │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│  ETAPA 1: BBox Transformada (coords VIEWBOX via CTM relativa)       │
│                                                                     │
│  getBBox() retorna coords LOCAIS — ignora transforms de ancestrais. │
│  Composição: svgCTM⁻¹ × elCTM → cancela scaling viewport,         │
│  isola APENAS transforms internos (translate, matrix, scale).       │
│                                                                     │
│  Projecta 4 cantos do BBox local → espaço VIEWBOX via CTM.         │
│  Calcula min/max X/Y → { x, y, width, height } em coords viewBox. │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│  ETAPA 2: Zoom Floor (tamanho mínimo absoluto)                      │
│                                                                     │
│  Em SVGs massivos, um CI pode ocupar 0.003% da área total.          │
│  O floor garante que width/height NUNCA sejam menores que            │
│  ZOOM_FLOOR_RATIO (5%) do SVG total.                                │
│                                                                     │
│  Se BBox < floor → expansão simétrica a partir do centro.           │
│  minWidth = parentBBox.width × 0.05                                 │
│  minHeight = parentBBox.height × 0.05                               │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│  ETAPA 3: Padding Adaptativo (respiro visual)                       │
│                                                                     │
│  Ratio = (área do elemento / área do SVG) × 100                    │
│                                                                     │
│  | Tamanho relativo     | Padding | Racional                 |     │
│  |----------------------|---------|--------------------------|     │
│  | Grande (> 40% área)  | 0       | Já ocupa quase tudo      |     │
│  | Médio (0.5% a 40%)   | 15%     | Margem confortável       |     │
│  | Minúsculo (≤ 0.5%)   | 25%     | Respiro sobre Zoom Floor |     │
│                                                                     │
│  Padding aplicado simetricamente nos 2 eixos.                       │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│  ETAPA 4: Trava de Aspect Ratio (bidirecional)                      │
│                                                                     │
│  screenAR = window.innerWidth / window.innerHeight                  │
│  viewBoxAR = width / height                                         │
│                                                                     │
│  viewBox mais alto que tela  → expande width (= height × screenAR) │
│  viewBox mais largo que tela → expande height (= width / screenAR) │
│                                                                     │
│  Expansão simétrica a partir do centro do viewBox atual.            │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│  ETAPA 5: Clamping de Limites                                       │
│                                                                     │
│  width/height não excedem o SVG pai.                                │
│  x/y não ficam antes da origem nem além do limite oposto.           │
│  Necessário porque Zoom Floor + Padding + AR expandем simetricamente.│
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│  ETAPA 6: String Final                                              │
│                                                                     │
│  return `${x} ${y} ${width} ${height}`                              │
│  → GSAP interpola: gsap.to(svg, { attr: { viewBox } })             │
└─────────────────────────────────────────────────────────────────────┘
```

### Nota sobre CTM no Frontend vs Backend

| Contexto | `getCTM()` | Compensação |
|----------|-----------|-------------|
| **Frontend** (browser real) | Inclui scaling viewBox→viewport (ex: SVG 574×274 renderizado a 1440×675 → fator ~2.5×) | `svgCTM⁻¹ × elCTM` cancela o fator |
| **Backend** (Puppeteer) | viewport === viewBox (fator 1×) | Usa `getCTM()` direto, sem compensação |

---

## 8. Interceptação de Cliques — `useClickHandler`

**Ficheiro:** `navigator/hooks/useClickHandler.ts`

### Por que o listener fica no `window`?

Eventos de clique em `<text>`, `<path>` e `<tspan>` dentro do SVG **não propagam de forma confiável** para o `<svg>` raiz em alguns browsers. A solução é um listener global no `window` que usa `target.closest()` para subir na árvore DOM.

### Fluxo de Decisão

```
  Clique no window
       │
       ▼
  lockInteraction? ──► SIM → ignora (animação em curso)
       │
       └─ NÃO
            │
            ▼
       target dentro do SVG? ──► NÃO → ignora silenciosamente
            │
            └─ SIM
                 │
                 ▼
            event.stopPropagation()
                 │
                 ▼
            getClickedStage(target, currentLevel)
                 │
                 ├─ closest("[id*='--lf' i]")  ← PRÓXIMO nível apenas
                 │
                 ├─ ACHOU elemento
                 │   │
                 │   ├─ id === currentElementId?
                 │   │   └─ SIM → DRILL-UP (auto-click guard)
                 │   │          → historyLevel[prev] → changeLevelTo(pai)
                 │   │
                 │   └─ id !== currentElementId?
                 │       └─ DRILL-DOWN → changeLevelTo(elemento, false)
                 │
                 └─ NÃO ACHOU (clicou no "vazio")
                        │
                        ├─ currentLevel > 1?
                        │   ├─ prevData existe? → changeLevelTo(prev, true)
                        │   └─ prevData não existe? → fallback: changeLevelTo(svg, true)
                        │
                        ├─ currentLevel = 1? → changeLevelTo(svgElement, true)
                        │                       (volta ao root)
                        │
                        └─ currentLevel = 0? → onClose()
                                               (fecha processograma)
```

### `getClickedStage(target, level)` — Resolução do Grupo Semântico

```typescript
const nextLevelSuffix = INVERSE_DICT[level + 1];  // ex: "--lf" se level=0
return target.closest(`[id*="${nextLevelSuffix}" i]`);
```

**Decisão crítica:** Tenta **apenas** o próximo nível. NÃO faz fallback para o nível atual. Sem isso, irmãos escurecidos do mesmo nível seriam capturados pelo `closest()`, impedindo o drill-up.

**Todos os seletores CSS usam flag `i` (case-insensitive)** para compatibilidade com IDs UPPERCASE de SVGs.

---

## 9. Efeitos de Hover — `useHoverEffects`

**Ficheiro:** `navigator/hooks/useHoverEffects.ts`

### Arquitetura: Event Delegation Pura (Zero re-renders)

```
ANTES (problemático):
   pixel → setOnHover(state) → re-render React → useEffect → GSAP
   (~60 re-renders/segundo durante movimento do rato)

AGORA:
   pixel → handler DOM nativo → GSAP
   (0 re-renders — React nunca sabe que o rato se moveu)
```

**Implementação:** Um único `mousemove` e um único `mouseleave` são registados diretamente no `<svg>` via `addEventListener` dentro de `useEffect([svgElement])`.

### Fluxo do `mousemove`

```
mousemove
   │
   ├─ lockInteraction? → return (câmera em animação)
   │
   ├─ Resolve nextLevelKey = INVERSE_DICT[currentLevel + 1]
   │   └─ ex: se level=1 (lf), busca "--ph"
   │
   ├─ target.closest(`[id*="${nextLevelKey}" i]`)
   │   │
   │   ├─ NÃO achou grupo → clearHover() e return
   │   │
   │   ├─ MESMO grupo (id === hoveredElementId) → return (sem spam)
   │   │
   │   └─ NOVO grupo:
   │       ├─ hoveredElementId.current = group.id
   │       ├─ gsap.to(group, { filter: FOCUSED_FILTER[theme] })    ← brilho
   │       └─ gsap.to(irmãos, { filter: UNFOCUSED_FILTER[theme] }) ← escurece
   │
   └─ (sem setState, sem re-render, sem React envolvido)
```

### `clearHover()`

Restaura o estado visual de navegação (sem hover ativo):
- Irmãos do nível atual → `UNFOCUSED_FILTER[theme]`
- Elemento enquadrado + filhos do próximo nível → `FOCUSED_FILTER[theme]`

### Gestão de Tema sem Re-registo

```typescript
const themeRef = useRef(currentTheme);
useEffect(() => { themeRef.current = currentTheme; }, [currentTheme]);
```

O tema é lido via `themeRef.current` dentro dos handlers. Mudar de tema **NÃO** re-regista os listeners DOM — apenas o valor da ref é atualizado.

### Como o hover interage com a câmera

| Estado | Hover ativo? |
|--------|-------------|
| Câmera em animação (`lockInteraction = true`) | NÃO — handler aborta na primeira linha |
| Animação completa | SIM — hover funciona normalmente |
| Drill-down iniciado | `killTweensOf` mata tweens de hover residuais |

---

## 10. Hierarquia & Breadcrumb — `hierarchy.ts`

**Ficheiro:** `navigator/hierarchy.ts`

### `getHierarchy(element)` — Resolução de Ancestrais

Dado qualquer `<g>` clicado, sobe na árvore DOM usando `closest()` para montar o caminho hierárquico:

```typescript
// Para heat-stress--ci1 (nível 3):
// 1. closest("[id*='--ph' i]") → feeding--ph1 (nível 2)
// 2. closest("[id*='--lf' i]") → growing--lf1 (nível 1)
// 3. closest("[id*='--ps' i]") → broiler--ps  (nível 0)
```

**Retorno:**
- `hierarchy` — ancestrais (sem o próprio elemento)
- `hierarchyPath` — ancestrais + o próprio elemento (breadcrumb completo)

### `getElementIdentifier(id, hierarchy)` — Caminho Pontilhado

```
getElementIdentifier("feeding--ph1", [...])
→ "broiler.growing.feeding"
```

Usado como chave única para identificar o elemento na UI.

---

## 11. Motor de Rasterização Dinâmica (LOD via PNG Swap)

### Contexto do Problema

Durante animações de zoom, o GSAP anima o `viewBox` a cada frame. O browser rasteriza **todos** os nós vectoriais visíveis — potencialmente milhares de `<path>`, `<text>` e `<g>` — mesmo os escurecidos (`brightness: 0.3`) que são irrelevantes visualmente.

### Evolução

| Versão | Abordagem | Custo por elemento | Problema |
|--------|-----------|-------------------|----------|
| v1 | Canvas client-side: `getBBox → XMLSerializer → Blob → Canvas → base64` | 30–80ms | Latência inaceitável |
| v2 | LOD via PNG Swap: lookup O(1) em PNGs pré-renderizados | ~0.1ms | — |
| v2.1 | + rAF time-slicing + `gsap.set` instantâneo | ~0.05ms | — |
| v2.2 | + Proteção de ancestrais | ~0.05ms | — |
| v2.3 | + Elevação z-order + herança de filtro | ~0.05ms | — |

### Arquitectura de 3 Etapas

```
┌──────────────────────────────────────────────────────────────────────┐
│ ETAPA 1+2: usePrefetchRaster                                        │
│                                                                      │
│  Montagem do componente → Object.entries(rasterImages) →             │
│  new Image() → img.decode() → imageCache: Map<id, HTMLImageElement>  │
│                                                                      │
│  Resultado: PNGs descodificados na HTTP cache + GPU do browser       │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│ ETAPA 3: useOptimizeSvgParts (Motor de Swap O(1))                    │
│                                                                      │
│  optimizeLevelElements(target, outOfFocusElements)                   │
│    ├─ PASSO A: restoreElement(target) — garante 100% vectorial       │
│    ├─ PASSO A.1: protectedIds = Set(target + ancestrais)             │
│    ├─ PASSO A.2: appendChild(target) — elevação z-order              │
│    └─ PASSO B: requestAnimationFrame(processChunk)                   │
│         ├─ epoch check → aborta se navegação stale                   │
│         ├─ protectedIds check → skip target + ancestrais             │
│         └─ rasterizeElement(sibling):                                │
│              1. imageCache.has(id?)                                   │
│              2. rasterImages[id] → {x, y, width, height, src}        │
│              3. createElementNS("image")                             │
│              4. Copy style.filter do <g> → <image>                   │
│              5. element.style.display = "none"                       │
│              6. insertBefore(imageEl, element.nextSibling)           │
│         → próximo chunk via rAF se index < total                     │
│                                                                      │
│  Budget: 400 × ~0.05ms ≈ 20ms/frame (< 16.6ms + margem GSAP ~2ms)  │
└──────────────────────────────────────────────────────────────────────┘
```

### Estratégia DOM: `display:none` + `insertBefore`

O `<g>` original **permanece no DOM** (oculto via `display: none`) e um `<image data-rasterized-for="id">` é inserido como sibling:

```xml
<!-- DOM antes do swap -->
<g id="growing--lf1" style="filter: brightness(0.3)">
  <path>... <text>... (1000 nós vectoriais)
</g>

<!-- DOM após o swap -->
<g id="growing--lf1" style="display:none; filter:brightness(0.3)">
  <path>... (ocultos, zero custo GPU)
</g>
<image data-rasterized-for="growing--lf1"
       href="https://storage.../raster/growing--lf1.png"
       x="100" y="200" width="500" height="300"
       style="filter: brightness(0.3)" />
```

**Por que não `replaceWith()`?** O GSAP mantém referências internas ao `<g>` alvo dos tweens de filter. Se o nó for removido do DOM, a referência é invalidada e `.revert()` falha.

### Restauro

```typescript
restoreAllRasterized():
  1. Restaura z-order do elemento elevado (insertBefore na posição original)
  2. Para cada id em rasterizedIds:
     - Remove <image data-rasterized-for="id">
     - element.style.display = ""
  3. Remove <image> órfãos (segurança extra)
  4. Limpa Set de rasterizedIds
```

---

## 12. Prefetch de Raster — `usePrefetchRaster`

**Ficheiro:** `navigator/hooks/usePrefetchRaster.ts`

### Responsabilidade

Faz o download silencioso das PNGs pré-renderizadas pelo backend para a RAM do browser, em background, durante a montagem do componente.

### Fluxo

```typescript
useEffect(() => {
  if (!rasterImages || Object.keys(rasterImages).length === 0) return;
  // ↑ No dark mode, rasterImages === {} → early return. Nenhum prefetch.

  let aborted = false;
  const currentImages: HTMLImageElement[] = [];

  for (const [id, data] of Object.entries(rasterImages)) {
    if (imageCache.current.has(id)) continue;  // já no cache

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = data.src;
    currentImages.push(img);

    img.decode()
      .then(() => {
        if (aborted) return;
        imageCache.current.set(id, img);
      })
      .catch(() => {
        // Graceful: <g> permanece vectorial
      });
  }

  return () => {
    aborted = true;
    for (const img of currentImages) img.src = "";
    imageCache.current.clear();
  };
}, [rasterImages]);
```

### Segurança

| Cenário | Proteção |
|---------|----------|
| Unmount durante prefetch | `aborted = true` + `img.src = ""` + `Map.clear()` |
| Imagem corrompida/indisponível | `catch` silencioso → imagem não entra no cache → graceful skip no swap |
| Re-render sem mudança real de dados | `imageCache.current.has(id)` → skip |
| Mudança de tema | Cleanup do effect limpa cache; novo ciclo de prefetch com URLs do novo tema |

---

## 13. Motor de Swap O(1) — `useOptimizeSvgParts`

**Ficheiro:** `navigator/hooks/useOptimizeSvgParts.ts`

### Refs Internos

| Ref | Tipo | Descrição |
|-----|------|-----------|
| `rasterizedIds` | `Set<string>` | IDs cujos `<g>` estão ocultos com `<image>` sibling |
| `elevatedRef` | `{ element, parent, nextSibling }` | Posição original do target elevado para z-order |
| `epochRef` | `number` | Counter para invalidar chunks rAF stale |
| `rasterImagesRef` | `Ref<Record<...>>` | Ref estável para rasterImages (evita re-criação de callbacks) |

### `rasterizeElement(element)` — Swap O(1)

Pipeline interno de cada swap:

```
1. Guard: id vazio? → return
2. Guard: já rasterizado? → return (rasterizedIds.has)
3. Guard: sem coordenadas do backend? → return (rasterImagesRef[id])
4. Guard: imagem não decoded? → return (imageCache.has — graceful)
5. Marcar como rasterizado (rasterizedIds.add)
6. Criar <image> SVG com href + x/y/width/height
7. Copiar style.filter do <g> → <image> (herança de filtro v2.3)
8. element.style.display = "none" (oculta <g>)
9. insertBefore(imageEl, element.nextSibling) (insere PNG como sibling)
```

**Custo: ~0.05ms** por elemento (lookup no Map + 1 nó DOM).

### `optimizeLevelElements(currentElement, outOfFocusElements)` — Orquestração

```
1. Incrementa epoch (invalida chunks rAF anteriores)
2. restoreElement(currentElement) — garante target 100% vectorial (defensivo)
3. protectedIds = Set(target.id + todos os ancestrais.id)
4. Elevar target: parentNode.appendChild(currentElement) — z-order
   └─ Guardar posição original em elevatedRef
5. requestAnimationFrame(processChunk):
   ├─ epoch check → aborta se stale
   ├─ protectedIds.has(id) → skip
   ├─ rasterizeElement(element)
   ├─ 400 elementos por frame
   └─ rAF(processChunk) se restam elementos
```

### Elevação de Z-Order (v2.3)

Em SVG, o elemento mais tardio no DOM renderiza **por cima**. Sem elevação:

```xml
<g id="gilt--ci">...</g>           ← target (vector), z-index INFERIOR
<g id="boar--ci" display:none>     ← oculto
<image for="boar--ci" .../>        ← PNG, renderiza POR CIMA de gilt!
```

Com `appendChild(target)`:

```xml
<g id="boar--ci" display:none>
<image for="boar--ci" .../>        ← PNG
<g id="gilt--ci">...</g>           ← target: VECTOR, z-index SUPERIOR ✓
```

A posição original é restaurada em `restoreAllRasterized` via `insertBefore(element, nextSibling)`.

---

## 14. Backend — Pipeline de Rasterização

**Ficheiro:** `src/infrastructure/services/svg/SvgProcessorService.ts`

### Pipeline `process(buffer)`

```
Buffer (SVG cru do upload)
       │
       ▼
  1. SVGO Optimize (Worker Thread)
     ├─ multipass: true se < 1MB, false se > 1MB
     ├─ Plugins: preset-default + normalizeSemanticIdsPlugin
     │           + fixMissingSvgIdPlugin + removeBxAttributesPlugin
     └─ Worker Thread: evita bloquear event loop (~CPU-bound)
       │
       ▼
  2. Extract Metadata (JSDOM)
     └─ viewBox, width, height do <svg>
       │
       ▼
  3. Puppeteer Launch
     ├─ headless: true
     ├─ viewport: { width: ceil(metadata.width), height: ceil(metadata.height) }
     ├─ deviceScaleFactor: 2 (retina)
     └─ background: transparent
       │
       ▼
  4. Set HTML Content
     └─ <!DOCTYPE html><body>${optimizedSvg}</body>
       │
       ▼
  5. Inject BBOX_EXTRACTION_SCRIPT
     ├─ window.getTransformedBBox(id): getCTM + getBBox → min/max corners
     └─ window.getAllRasterizableElements(): querySelectorAll → regex match
        ├─ Regex: /(?:--|_)(ps|lf|ph|ci)(?:[_-]\d+[_-]?)?$/
        └─ Retorna: Array<{ id, x, y, width, height }>
       │
       ▼
  6. Rasterizar Cada Elemento
     ├─ page.screenshot({ clip: { x, y, w, h }, omitBackground: true })
     ├─ sharp(buffer).png({ compressionLevel: 6 }).toBuffer()
     └─ rasterImages.set(safeId, { src: '', bucket_key: '', x, y, w, h, _buffer })
       │
       ▼
  7. Return { optimizedSvg, rasterImages: Map<id, IRasterImage>, metadata }
```

### Nota sobre `BBOX_EXTRACTION_SCRIPT`

O script usa `getCTM()` **diretamente** (sem compensação `svgCTM⁻¹`) porque no Puppeteer o viewport é configurado com exatamente as dimensões do viewBox → fator de escala é 1×. O `deviceScaleFactor: 2` afeta apenas a resolução dos screenshots, não o CTM.

### Upload (`CreateProcessogramUseCase`)

```typescript
// SVG optimizado
storage.upload(svgBuffer, `${basePath}/light/${slug}.svg`, 'image/svg+xml');

// PNGs rasterizadas (batches de 20 em paralelo)
for (const batch of chunks(entries, 20)) {
  await Promise.all(batch.map(([elementId, rasterImage]) => {
    storage.upload(rasterImage._buffer, `${basePath}/light/raster/${elementId}.png`, 'image/png');
  }));
}

// Documento MongoDB
ProcessogramModel.create({
  raster_images_light: rasterImagesLight,  // ✅ Preenchido
  raster_images_dark: {},                   // ❌ Sempre vazio
});
```

### Limitações Atuais

1. **Apenas tema light é rasterizado** — `process()` não recebe parâmetro de tema
2. **Sem CSS de tema dark injetado** — o Puppeteer renderiza com background transparente e as cores originais do SVG
3. **Path hard-coded** — `${basePath}/light/raster/` sem equivalente `/dark/raster/`
4. O `UpdateProcessogramUseCase` replica exatamente o mesmo padrão (só light)

---

## 15. Sistema de Temas (Light / Dark)

### Detecção de Tema

```typescript
// page.tsx
const { resolvedTheme } = useTheme();  // next-themes
const currentTheme: "dark" | "light" =
  resolvedTheme === "light" ? "light" : "dark";  // fallback para dark
```

### Seleção do SVG

```typescript
// ProcessogramController.ts (backend)
const svgUrl = theme === 'dark'
  ? processogram.svg_url_dark ?? processogram.svg_url_light   // fallback light
  : processogram.svg_url_light ?? processogram.svg_url_dark;  // fallback dark
```

### Seleção de Raster Images

```typescript
// page.tsx
const rasterImages = state.status === "ready"
  ? currentTheme === "dark"
    ? state.processogram.raster_images_dark    // ← {} (vazio)
    : state.processogram.raster_images_light   // ← preenchido
  : undefined;
```

### Filtros Visuais por Tema

```typescript
// consts.ts
export const FOCUSED_FILTER = {
  dark:  "brightness(1)",    // brilho normal
  light: "grayscale(0)",     // saturação normal
};

export const UNFOCUSED_FILTER = {
  dark:  "brightness(0.3)",  // escurece para 30%
  light: "grayscale(1)",     // remove toda saturação
};
```

**Dark mode:** usar `brightness` para escurecer faz sentido visualmente — elementos ficam "apagados".

**Light mode:** usar `grayscale` em vez de brightness preserva a legibilidade — em fundo claro, escurecer criaria contraste confuso.

### Propagação do Tema nos Hooks

| Hook | Como recebe o tema | Comportamento |
|------|-------------------|---------------|
| `useNavigator` | prop `currentTheme` | Usa `UNFOCUSED_FILTER[currentTheme]` no `gsap.set` |
| `useHoverEffects` | `currentTheme` → `themeRef` | Lê via ref (sem re-registo de listeners) |
| `useSvgNavigatorLogic` | prop `currentTheme` | Propaga para `setFullBrightnessToCurrentLevel` |
| `usePrefetchRaster` | Indireto (via `rasterImages` que já está filtrado por tema) | `{}` no dark → noOp |
| `useOptimizeSvgParts` | Indireto (via `rasterImages`) | `{}` no dark → all guards fail → noOp |

---

## 16. Gargalo: Rasterização Ausente no Dark Mode

### Status Atual

O campo `raster_images_dark` está **SEMPRE vazio** (`{}`). A otimização de LOD via PNG Swap **opera apenas no light mode**.

### Rastreamento Ponta a Ponta

| Camada | Ficheiro | Código | Resultado |
|--------|----------|--------|-----------|
| **Backend — Criação** | `CreateProcessogramUseCase.ts:144` | `raster_images_dark: {}` | Hard-coded vazio |
| **Backend — Update** | `UpdateProcessogramUseCase.ts` | Apenas `raster_images_light` regenerado | Dark nunca tocado |
| **Backend — Serviço** | `SvgProcessorService.ts` | `process(buffer)` sem parâmetro `theme` | Agnóstico a tema |
| **Backend — Upload** | `CreateProcessogramUseCase.ts:98` | Path: `${basePath}/light/raster/` | Sem equivalente `/dark/` |
| **Frontend — Seleção** | `page.tsx:133-134` | `raster_images_dark` | Recebe `{}` |
| **Frontend — Prefetch** | `usePrefetchRaster.ts:64` | `Object.keys({}).length === 0 → return` | Nenhum PNG prefetched |
| **Frontend — Swap** | `useOptimizeSvgParts.ts:228` | `rasterImagesRef.current?.[id] → undefined` | Nenhum swap executado |

### Impacto por Tema

| Aspecto | Light Mode | Dark Mode |
|---------|-----------|-----------|
| **Prefetch PNGs** | ✅ Todas decoded na RAM | ❌ Early return (nada prefetched) |
| **Swap `<g>` → `<image>`** | ✅ O(1) por elemento | ❌ Nenhum swap |
| **Rendering durante zoom** | PNGs leves (1 textura GPU/elemento) | 100% vectorial (1200+ nós/frame) |
| **Performance drill-down** | 60 FPS sustentados | Potenciais frame drops |
| **Filtros visuais** | ✅ `grayscale(1)` funciona | ✅ `brightness(0.3)` funciona |

### Comportamento Visual

```
LIGHT MODE:
  Elementos fora de foco → escurecidos + PNG Swap → GPU renderiza N texturas simples
  Target → vectorial nítido a 100%

DARK MODE:
  Elementos fora de foco → escurecidos mas 100% vectorial → GPU rasteriza 1200+ nós/frame
  Target → vectorial nítido a 100%
```

O dark mode **funciona corretamente** em termos de funcionalidade — drill-down, drill-up, hover, breadcrumb, filtros visuais. O que falta é a **otimização de performance de rendering**, que degrada proporcionalmente à complexidade do SVG.

### O que Seria Necessário para Completar

| Camada | Mudança |
|--------|---------|
| `SvgProcessorService` | Receber `theme` como parâmetro; injetar CSS dark no Puppeteer antes de screenshot |
| `CreateProcessogramUseCase` | Chamar `process()` 2 vezes (light + dark) ou 1 vez com 2 passes de screenshot; upload para `${basePath}/dark/raster/` |
| `UpdateProcessogramUseCase` | Idem ao Create |
| **Schema MongoDB** | ✅ Já suporta — `raster_images_dark: Map<string, RasterImageSchema>` |
| **Types frontend** | ✅ Já suporta — `raster_images_dark: Record<string, RasterImage>` |
| **page.tsx** | ✅ Seleção já implementada (`currentTheme === "dark" ? dark : light`) |
| **usePrefetchRaster** | ✅ Funciona com qualquer `Record<string, RasterImage>` |
| **useOptimizeSvgParts** | ✅ Funciona com qualquer `Record<string, RasterImage>` |

**O frontend está 100% preparado.** O gap está exclusivamente no backend.

---

## 17. Proteções Anti-Bug & Race Conditions

| Cenário | Mecanismo | Ficheiro |
|---------|-----------|----------|
| **Double-click durante animação** | `lockInteractionRef = true` + `pointerEvents: "none"` | useNavigator |
| **Hover durante animação de câmera** | `lockInteraction.current? → return` no 1º linha do handler | useHoverEffects |
| **Tweens de hover residuais durante drill-down** | `gsap.killTweensOf(todos os [id*="--"])` | useNavigator |
| **Sobreposição de filtros entre transições** | `outOfFocusAnimationRef.current.revert()` antes de cada nova transição | useNavigator |
| **User navega antes dos chunks rAF completarem** | Epoch counter: compara epoch capturado vs actual → aborta se stale | useOptimizeSvgParts |
| **Drill-up antes do swap completar** | `restoreAllRasterized()` no início de cada `changeLevelTo` | useNavigator |
| **Imagem não pré-carregada (decode pendente)** | `imageCache.has(id)` → skip silencioso; `<g>` permanece vectorial | useOptimizeSvgParts |
| **Unmount durante prefetch** | `aborted = true` + `img.src = ""` + `Map.clear()` | usePrefetchRaster |
| **Mudança de tema** | Cleanup do useEffect limpa cache; novo ciclo de prefetch | usePrefetchRaster |
| **Elemento sem ID** | `if (!id) return` guards | useOptimizeSvgParts |
| **Elemento sem dados no backend** | `if (!data) return` guards | useOptimizeSvgParts |
| **Ancestral do target no outOfFocusElements** | `el.contains(target)` filtra ancestrais; `protectedIds` Set guarda defensiva | useNavigator + useOptimizeSvgParts |
| **PNGs de irmãos cobrem target (z-order SVG)** | `appendChild(target)` eleva target; `elevatedRef` guarda posição original | useOptimizeSvgParts |
| **`<image>` sem filtro sobrepõe target a 100% brilho** | `if (element.style.filter) imageEl.style.filter = element.style.filter` | useOptimizeSvgParts |
| **getCTM() retorna coords do viewBox animado** | Swap síncrono do viewBox para original antes de getCTM(); finally restaura | getElementViewBox |
| **BBox de dimensão zero** | Guard: `if (width === 0 \|\| height === 0) return null` | getElementViewBox |
| **Histórico de navegação perdido** | Fallback: `changeLevelTo(svgElement, true)` → volta ao root | useClickHandler |
| **Elemento do histórico não encontrado no DOM** | Fallback idem + `console.warn` | useClickHandler |
| **SVGO bloqueia event loop em SVGs > 1MB** | Worker Thread (`worker_threads`) com timeout de 5 min | SvgProcessorService |

---

## 18. Gargalos de Performance Identificados

### Gargalo 1: Dark Mode sem LOD

**Severidade: Alta para SVGs complexos**

No dark mode, todos os 1200+ elementos vectoriais são rasterizados pelo browser a cada frame da animação GSAP. No light mode, apenas o target e os PNGs simples (1 textura/elemento) são processados.

**Impacto:** Frame drops durante drill-down em SVGs com > 800 elementos quando em dark mode.

**Causa raiz:** `raster_images_dark` sempre vazio no backend (§16).

---

### Gargalo 2: Prefetch Total no Load

**Severidade: Média**

Todos os PNGs são prefetched no load do componente, independente de quais grupos o utilizador vai visitar. Para processogramas com 100+ grupos, isto pode consumir 50–200MB de HTTP cache.

**Mitigação futura:** Prefetch por prioridade (visíveis primeiro, depois adjacentes).

**Mitigação atual:** Após a primeira visita, `Cache-Control: max-age=31536000` (1 ano) serve tudo do disk cache.

---

### Gargalo 3: SVGO em SVGs Massivos

**Severidade: Baixa (já mitigada)**

SVGO com multipass em SVGs > 1MB bloqueava o event loop. Mitigado com Worker Thread e `multipass: false` para SVGs > 1MB.

---

### Gargalo 4: rAF Budget Marginal

**Severidade: Baixa**

400 elementos × ~0.05ms ≈ 20ms por frame de rAF. O budget teórico de 1 frame é 16.6ms. O sistema funciona porque o GSAP tick consome apenas ~2ms e o restante do frame está livre. Em dispositivos muito lentos, pode haver minor jank no 1º frame do batch.

---

### Gargalo 5: Puppeteer Rasterização Sequencial

**Severidade: Baixa (tempo de upload, não runtime)**

O backend rasteriza cada elemento sequencialmente via `page.screenshot()`. Para SVGs com 200+ elementos, o tempo total de rasterização pode chegar a 30–60 segundos. Não afeta o utilizador final (acontece no upload), mas limita a experiência do admin.

---

## 19. Constantes & Configuração

**Ficheiro:** `navigator/consts.ts`

```typescript
// Animação
ANIMATION_DURATION = 0.7      // Duração da transição de viewBox (segundos)
ANIMATION_EASE     = "power1.inOut"  // Curva de easing GSAP

// Câmera
ZOOM_FLOOR_RATIO   = 0.05    // Tamanho mínimo: 5% do SVG total

// Filtros Visuais
FOCUSED_FILTER     = { dark: "brightness(1)", light: "grayscale(0)" }
UNFOCUSED_FILTER   = { dark: "brightness(0.3)", light: "grayscale(1)" }

// Hierarquia
LEVELS_DICT        = { "--ps": 0, "--lf": 1, "--ph": 2, "--ci": 3 }
INVERSE_DICT       = { 0: "--ps", 1: "--lf", 2: "--ph", 3: "--ci" }
MAX_LEVEL          = 3
LEVEL_LABELS       = { ps: "Production System", lf: "Life Fate", ph: "Phase", ci: "Circumstance" }

// Rasterização (useOptimizeSvgParts.ts — local)
CHUNK_SIZE         = 400      // Elementos processados por frame de rAF
```

---

## 20. Diagrama de Sequência Completo

### Drill-Down: Clique → Animação → Rasterização

```
User            window          useClickHandler    useNavigator        useOptimizeSvgParts    GSAP
 │                │                  │                  │                       │                │
 │── clique ──────│                  │                  │                       │                │
 │                │── handleClick ──►│                  │                       │                │
 │                │                  │                  │                       │                │
 │                │                  │─ getClickedStage │                       │                │
 │                │                  │  (closest)       │                       │                │
 │                │                  │                  │                       │                │
 │                │                  │─ changeLevelTo ─►│                       │                │
 │                │                  │                  │                       │                │
 │                │                  │                  │─ restoreAllRasterized ──►│             │
 │                │                  │                  │                       │── remove <image>│
 │                │                  │                  │                       │── display:""   │
 │                │                  │                  │                       │                │
 │                │                  │                  │─ getElementViewBox     │                │
 │                │                  │                  │  (BBox→Floor→Pad→AR)  │                │
 │                │                  │                  │                       │                │
 │                │                  │                  │─ historyLevelRef[n]={id}               │
 │                │                  │                  │                       │                │
 │                │                  │                  │─ querySelectorAll      │                │
 │                │                  │                  │  (outOfFocusSelector)  │                │
 │                │                  │                  │─ .filter(!el.contains) │                │
 │                │                  │                  │                       │                │
 │                │                  │                  │─ lock = true           │                │
 │                │                  │                  │─ pointerEvents: none   │                │
 │                │                  │                  │─ killTweensOf          │                │
 │                │                  │                  │                       │                │
 │                │                  │                  │─ gsap.set(elements, ──────────────────►│
 │                │                  │                  │    filter: UNFOCUSED)  │                │
 │                │                  │                  │                       │                │
 │                │                  │                  │─ onChange(id, hierarchy)                │
 │                │                  │                  │                       │                │
 │                │                  │                  │─ optimizeLevelElements ──►│             │
 │                │                  │                  │                       │── epoch++      │
 │                │                  │                  │                       │── protectedIds │
 │                │                  │                  │                       │── appendChild  │
 │                │                  │                  │                       │── rAF(chunk)   │
 │                │                  │                  │                       │                │
 │                │                  │                  │─ gsap.to(svg, viewBox) ───────────────►│
 │                │                  │                  │                       │                │
 │                │                  │                  │                       │   ┌────────────│
 │                │                  │                  │                       │   │ Frame 1:   │
 │                │                  │                  │                       │◄──│ chunk 0-399│
 │                │                  │                  │                       │   │            │
 │                │                  │                  │                       │   │ Frame 2:   │
 │                │                  │                  │                       │◄──│ chunk 400+ │
 │                │                  │                  │                       │   │            │
 │                │                  │                  │                       │   │ t=700ms:   │
 │                │                  │                  │◄─────────────────────────│ onComplete │
 │                │                  │                  │                       │   └────────────│
 │                │                  │                  │─ pointerEvents: auto   │                │
 │                │                  │                  │─ setFullBrightness     │                │
 │                │                  │                  │─ lock = false          │                │
 │                │                  │                  │                       │                │
 │◄───────────────│──────────────────│──────────────────│── UI atualizada ──────│────────────────│
```

### Drill-Up: Clique no Vazio → Volta ao Nível Anterior

```
User clica no "vazio" (sem <g> semântico)
  │
  └─ handleClick
       └─ getClickedStage → null
       └─ prevLevel = currentLevel - 1
       └─ historyLevel[prevLevel] → { id }
       └─ querySelector(id) → element
       └─ changeLevelTo(element, true)
            └─ (mesma sequência do drill-down, com toPrevious=true)
            └─ setFullBrightnessToCurrentLevel(true) usa duração completa (0.7s)
```

### Mudança de Tema: Light → Dark

```
User troca tema no sistema
  │
  └─ useTheme() → resolvedTheme muda
  └─ currentTheme: "dark"
  └─ rasterImages = state.processogram.raster_images_dark  → {}
  │
  ├─ usePrefetchRaster:
  │    └─ cleanup: aborted=true, img.src="", Map.clear()
  │    └─ novo effect: Object.keys({}).length === 0 → early return
  │    └─ imageCache vazio
  │
  ├─ useOptimizeSvgParts:
  │    └─ rasterImagesRef.current = {}
  │    └─ Próximo rasterizeElement: data = {}[id] → undefined → return
  │
  ├─ useNavigator:
  │    └─ UNFOCUSED_FILTER["dark"] = "brightness(0.3)"  ← filtros corretos
  │    └─ optimizeLevelElements chamado mas nenhum swap acontece
  │
  └─ useHoverEffects:
       └─ themeRef.current = "dark"
       └─ Handlers NÃO re-registados (performance)
       └─ Próximo hover: lê themeRef.current → filtros dark corretos
```

---

## Apêndice A: Schema MongoDB (`ProcessogramModel`)

```typescript
{
  identifier:          String,    // path hierárquico: "specie-module-slug"
  name:                String,
  slug:                String,
  description:         String?,
  specieId:            String,    // FK → Specie
  productionModuleId:  String,    // FK → ProductionModule
  status:              'processing' | 'ready' | 'error' | 'generating',

  // Light Theme
  svg_url_light:           String?,
  svg_bucket_key_light:    String?,
  original_name_light:     String?,
  original_size_light:     Number?,
  final_size_light:        Number?,

  // Dark Theme
  svg_url_dark:            String?,
  svg_bucket_key_dark:     String?,
  original_name_dark:      String?,
  original_size_dark:      Number?,
  final_size_dark:         Number?,

  // Raster Images
  raster_images_light:     Map<String, RasterImageSchema>,  // ✅ Preenchido
  raster_images_dark:      Map<String, RasterImageSchema>,  // ❌ Sempre {}

  creatorId:  String,
  createdAt:  Date,
  updatedAt:  Date,
}

// RasterImageSchema
{
  src:        String,    // URL pública no GCS
  bucket_key: String,    // Path no bucket
  width:      Number,    // Largura em SVG-space
  height:     Number,    // Altura em SVG-space
  x:          Number,    // Coordenada X em SVG-space
  y:          Number,    // Coordenada Y em SVG-space
}
```

## Apêndice B: Dependências

| Pacote | Versão | Propósito |
|--------|--------|-----------|
| `gsap` | `^3.14.2` | Animação de viewBox, filter CSS |
| `react-inlinesvg` | `^4.x` | Injeção de SVG como DOM real no React |
| `framer-motion` | `^12.x` | Animações de UI (fade, mount/unmount) |
| `next-themes` | — | Detecção de tema (dark/light) |
| `puppeteer` | — | Rasterização server-side (backend) |
| `sharp` | — | Compressão PNG (backend) |
| `svgo` | — | Otimização de SVG (backend, Worker Thread) |
| `jsdom` | — | Extração de metadados SVG (backend) |

## Apêndice C: Ficheiros do Sistema

| Ficheiro | Localização | Papel |
|----------|-------------|-------|
| `page.tsx` | `frontend/src/app/view/[id]/` | Página pública; seleciona tema e rasterImages |
| `useSvgNavigatorLogic.ts` | `navigator/` | Orquestrador central |
| `useNavigator.ts` | `navigator/hooks/` | Motor de câmera (changeLevelTo) |
| `useClickHandler.ts` | `navigator/hooks/` | Interceptação global de cliques |
| `useHoverEffects.ts` | `navigator/hooks/` | Hover com Event Delegation |
| `usePrefetchRaster.ts` | `navigator/hooks/` | Prefetch de PNGs |
| `useOptimizeSvgParts.ts` | `navigator/hooks/` | Motor de Swap O(1) |
| `getElementViewBox.ts` | `navigator/` | Cálculo de viewBox (câmera math) |
| `extractInfoFromId.ts` | `navigator/` | Parser de IDs semânticos |
| `hierarchy.ts` | `navigator/` | Resolução de ancestrais → breadcrumb |
| `consts.ts` | `navigator/` | Constantes de animação, filtros, níveis |
| `types.ts` | `navigator/` | Tipagens centrais |
| `index.ts` | `navigator/` | Barrel export |
| `SvgProcessorService.ts` | `src/infrastructure/services/svg/` | Rasterização backend (Puppeteer + Sharp) |
| `CreateProcessogramUseCase.ts` | `src/application/useCases/processogram/` | Criação com upload de SVG + PNGs |
| `UpdateProcessogramUseCase.ts` | `src/application/useCases/processogram/` | Atualização com re-processamento |
| `ProcessogramModel.ts` | `src/infrastructure/models/` | Schema MongoDB |
| `IProcessogram.ts` | `src/domain/interfaces/` | Interface de domínio |
