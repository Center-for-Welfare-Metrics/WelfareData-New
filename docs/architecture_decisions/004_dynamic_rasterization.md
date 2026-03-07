# ADR-004: Motor de Rasterização Dinâmica (LOD via PNG Swap)

**Status:** Aceito (v2.1)
**Data:** 06/03/2026
**Autores:** WFI Engineering Team

---

## Histórico de Versões

| Versão | Data | Mudança |
|---|---|---|
| v1 | 05/03/2026 | Canvas client-side: `XMLSerializer → Blob → Canvas → base64` |
| v2 | 06/03/2026 | LOD via PNG Swap: lookup O(1) em PNGs pré-renderizados pelo backend |
| **v2.1** | **06/03/2026** | **rAF time-slicing (400 el/frame) + filtro instantâneo (`gsap.set`)** |

---

## Contexto

Durante animações de zoom (drill-down / drill-up), o GSAP anima o `viewBox` do `<svg>` a cada frame. O browser, por sua vez, é obrigado a recalcular o layout e rasterizar todos os nós vectoriais visíveis — potencialmente milhares de `<path>`, `<text>` e `<g>` — mesmo aqueles que estão escurecidos (`brightness: 0.3`) e portanto irrelevantes visualmente.

### Limitação da v1 (Canvas client-side)

A v1 eliminava nós vectoriais durante zoom, mas o próprio pipeline de rasterização criava latência (30-80ms por elemento):

```
getBBox → XMLSerializer → Blob → ObjectURL → Image.onload → Canvas → base64 → <image>
```

### Oportunidade (v2)

O backend (`SvgProcessorService`) já rasteriza cada grupo interativo via **Puppeteer + Sharp** no momento do upload e faz upload para o GCS com coordenadas exactas em SVG-space (`x, y, width, height`). Estes PNGs e metadados já estão disponíveis na API:

```typescript
interface RasterImage {
  src: string;       // URL pública no GCS
  bucket_key: string;
  width: number;
  height: number;
  x: number;         // Coordenada X em SVG-space
  y: number;         // Coordenada Y em SVG-space
}

// Processogram.raster_images_light: Record<string, RasterImage>
// Processogram.raster_images_dark:  Record<string, RasterImage>
```

**Decisão:** Eliminar toda a rasterização client-side e usar os PNGs pré-existentes.

---

## Decisão (v2)

### Arquitectura de 3 Etapas

```
┌─────────────────────────────────────────────────────────────────┐
│ ETAPA 1+2: usePrefetchRaster                                   │
│                                                                 │
│   Montagem do componente                                        │
│     ↓                                                           │
│   Object.entries(rasterImages) → new Image() → img.decode()    │
│     ↓                                                           │
│   imageCache: Map<elementId, HTMLImageElement>  (RAM)            │
│                                                                 │
│   Resultado: PNGs descodificados na HTTP cache + GPU do browser │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ ETAPA 3: useOptimizeSvgParts (Motor de Swap O(1))               │
│                                                                 │
│   optimizeLevelElements(target, siblings)                       │
│     ├─ PASSO A: restoreElement(target)         [sync, defensivo]│
│     └─ PASSO B: requestAnimationFrame (time-slicing)            │
│           ↓                                                     │
│         processChunk (CHUNK_SIZE=400 elementos/frame):          │
│           epoch check → aborta se navegação stale               │
│           rasterizeElement(sibling):                             │
│             1. imageCache.has(id)?     → graceful skip se false │
│             2. rasterImages[id]        → x, y, width, height   │
│             3. createElementNS("image")                         │
│             4. element.style.display = "none"                   │
│             5. insertBefore(imageEl, element.nextSibling)       │
│           → próximo chunk via rAF se index < total              │
│                                                                 │
│   Custo: ~0.1ms por elemento (vs 30-80ms na v1)                │
│   Budget: 400 × ~0.05ms ≈ 20ms/frame — dentro dos 16.6ms      │
│   com margem para o GSAP tick (~2ms) no mesmo frame.            │
└─────────────────────────────────────────────────────────────────┘
```

### Fluxo por Transição

```
changeLevelTo(target)
  │
  ├─ 0. restoreAllRasterized()          ← DOM limpo (sync)
  ├─ 3. Blindagem DOM                   ← lock + pointerEvents: none
  ├─ 4. outOfFocusAnimation (gsap.set)    ← aplica brightness(0.3) INSTANTANEAMENTE
  ├─ 5. onChange(identifier, hierarchy)  ← notifica UI
  ├─ 5.5 optimizeLevelElements(target, outOfFocusElements)
  │       ├─ restoreElement(target)      ← garante target vectorial (defensivo)
  │       └─ requestAnimationFrame:      ← liberta frame para GSAP
  │             processChunk(400 el/frame):
  │               epoch check            ← aborta se navegação stale
  │               rasterizeElement(sib1)   ─┐
  │               rasterizeElement(sib2)    │ O(1): lookup Map + 1 nó DOM
  │               ...                      │ 400 por frame via rAF
  │               rasterizeElement(sibN)   ─┘
  │               → rAF(processChunk) se restam elementos
  │
  └─ 6. gsap.to(svgElement, viewBox)    ← câmara anima (frame limpo)
```

### Estratégia DOM: display:none + insertBefore

O `<g>` original **permanece no DOM** (oculto via `display: none`) e um `<image data-rasterized-for="id">` é inserido como sibling. Esta decisão (vs `element.replaceWith()`) preserva as referências internas do GSAP:

```
DOM antes do swap:
  <g id="growing--lf1" style="filter: brightness(0.3)">  ← GSAP target
    <path>...</path> <text>...</text> ...1000 nós
  </g>

DOM após o swap:
  <g id="growing--lf1" style="display:none; filter:brightness(0.3)">
    <path>... (ocultos, zero custo GPU)
  </g>
  <image data-rasterized-for="growing--lf1"
         href="https://storage.../raster/growing--lf1.png"
         x="100" y="200" width="500" height="300" />
```

- O GSAP tween de `filter` no `<g>` original **não é invalidado** (nó permanece no DOM).
- O `<image>` herda o contexto visual do parent (se o parent tiver filter/opacity).
- O restauro é atómico: `imageEl.remove()` + `element.style.display = ""`.

### Segurança contra Race Conditions

| Cenário | Mecanismo v2 |
|---|---|
| Utilizador navega antes dos chunks rAF completarem | **Epoch counter**: cada `optimizeLevelElements` incrementa o epoch; callbacks rAF comparam e abortam se stale |
| Drill-up antes do swap completar | `restoreAllRasterized()` no início de `changeLevelTo` reconstrói o DOM |
| Imagem não pré-carregada (decode pendente) | `imageCache.has(id)` retorna false → skip silencioso; `<g>` permanece vectorial (**graceful degradation**) |
| Unmount durante prefetch | Cleanup: `aborted = true` + `img.src = ""` + `Map.clear()` |
| Mudança de tema (light → dark) | Cleanup do useEffect limpa cache; novo ciclo de prefetch com URLs do novo tema |
| Elemento sem ID ou sem dados no backend | Guards de entrada: `if (!id) return` / `if (!data) return` |

### Cadeia de Dados (Injeção de Dependências)

```
page.tsx
  │
  ├─ state.processogram.raster_images_light / dark
  │    ↓ (selecciona com base em currentTheme)
  ├─ rasterImages: Record<string, RasterImage>
  │
  └─ useSvgNavigatorLogic({ currentTheme, onChange, onClose, rasterImages })
       │
       ├─ usePrefetchRaster(rasterImages)
       │    → imageCache: RefObject<Map<string, HTMLImageElement>>
       │
       ├─ useOptimizeSvgParts({ svgElement, rasterImages, imageCache })
       │    → optimizeLevelElements, restoreAllRasterized
       │
       ├─ useNavigator({ ..., optimizeLevelElements, restoreAllRasterized })
       │    → changeLevelTo
       │
       └─ useClickHandler({ ..., changeLevelTo })
            → handleClick
```

---

## Ficheiros Alterados (v1 → v2)

| Ficheiro | Mudança |
|---|---|
| `navigator/hooks/usePrefetchRaster.ts` | **Criado** — Prefetch de PNGs para RAM via `img.decode()` |
| `navigator/hooks/useOptimizeSvgParts.ts` | **Reescrito** — Eliminado pipeline Canvas; swap O(1) com epoch counter; **v2.1: rAF time-slicing (400 el/frame)** |
| `navigator/useSvgNavigatorLogic.ts` | Adicionada prop `rasterImages`; instancia `usePrefetchRaster`; passa `imageCache` ao `useOptimizeSvgParts` |
| `app/view/[id]/page.tsx` | Selecciona `raster_images_light/dark` e passa ao orquestrador |
| `navigator/index.ts` | Barrel exports para `usePrefetchRaster` e `useOptimizeSvgParts` |
| `navigator/hooks/useNavigator.ts` | **v2.1:** `gsap.to()` → `gsap.set()` no outOfFocusAnimation (filtro instantâneo) |
| `useCases/processogram/GetProcessogramUseCase.ts` | `mapToRecord()` — converte Mongoose Map para plain object (fix serialização) |
| `useCases/processogram/ListProcessogramsUseCase.ts` | `mapToRecord()` — idem para listagem |

---

## Otimizações v2.1: rAF Time-Slicing + Filtro Instantâneo

### Problema Identificado

Com 1200+ elementos SVG, duas operações criavam contenção na Main Thread durante o frame da transição:

1. **Swap síncrono de todos os outOfFocusElements** num único `setTimeout(0)` → ~60ms de DOM mutations bloqueando o GSAP.
2. **`gsap.to()` com filtro animado** em 1200 nós → 1200 repaints/frame × 42 frames (0.7s) = browser em throttle constante.

### Solução 1: rAF Time-Slicing (`useOptimizeSvgParts.ts`)

O swap dos outOfFocusElements é agora dividido em chunks de **400 elementos por frame** via `requestAnimationFrame`:

```
Frame 0: GSAP inicia animação do viewBox (frame limpo, sem competição)
Frame 1: processChunk(0..399)   → ~20ms de DOM mutations
Frame 2: processChunk(400..799) → ~20ms
Frame 3: processChunk(800..1199) → ~20ms
```

Cada callback rAF verifica o **epoch counter** antes de processar. Se o utilizador navegou durante o batching, o epoch mudou e toda a cadeia rAF é abortada silenciosamente.

**Budget por frame:** 400 × ~0.05ms = ~20ms — dentro do budget de 16.6ms com margem para o GSAP tick (~2ms).

### Solução 2: Filtro Instantâneo (`useNavigator.ts`)

O escurecimento dos elementos fora de foco foi alterado de:

```typescript
// ANTES (v2): interpolação animada — 1200 repaints/frame por 0.7s
gsap.to(outOfFocusElements, {
  filter: UNFOCUSED_FILTER[currentTheme],
  duration: ANIMATION_DURATION,
  ease: ANIMATION_EASE,
});

// DEPOIS (v2.1): aplicação instantânea — 1 reflow síncrono
gsap.set(outOfFocusElements, {
  filter: UNFOCUSED_FILTER[currentTheme],
});
```

**Impacto:** Eliminação de ~50.400 repaints (1200 nós × 42 frames) por transição. O `gsap.set()` retorna um `Tween` com `.revert()` funcional — o contrato de cleanup é preservado.

### Diagnóstico Descartado

| Técnica Proposta | Razão da Rejeição |
|---|---|
| Prefetch por proximidade (getBBox distances) | Over-engineering: calcular distâncias para 1200 elementos custa mais que o swap em si. Elementos estão escurecidos — prioridade visual é irrelevante. |
| `will-change: transform` em cada elemento | **Prejudicial**: 1200 GPU layers × ~200KB-2MB = 240MB-2.4GB VRAM. Degrada performance em vez de melhorar. |



### Positivas

- **Eliminação total de rasterização client-side**: zero `XMLSerializer`, zero `Canvas`, zero `base64`. O browser não executa nenhum pipeline gráfico pesado
- **Swap O(1)**: lookup no Map + criação de 1 nó `<image>` SVG. ~0.1ms vs 30-80ms da v1.
- **60 FPS sustentados**: browser rasteriza N imagens PNG em vez de milhares de nós vectoriais por frame
- **Prefetch invisível**: PNGs descarregados em background no load; zero latência de rede no momento do clique
- **Compatibilidade GSAP preservada**: `display:none + insertBefore` mantém os tweens de filter intactos
- **Race conditions eliminadas**: epoch counter invalida callbacks stale; flag `aborted` previne poluição do cache
- **Graceful degradation**: se a imagem não está pronta, o `<g>` permanece vectorial sem crash

### Negativas / Trade-offs

- **Dependência do GCS**: PNGs devem estar acessíveis publicamente com CORS headers. Se o bucket não tiver `Access-Control-Allow-Origin`, o prefetch falha e toda rasterização degrada para vectorial
- **Memória de prefetch**: todos os PNGs do processograma são prefetched no load. Para processogramas com 100+ grupos, isto pode consumir 50-200MB de HTTP cache. Mitigação futura: prefetch por prioridade (visíveis primeiro)
- **Cache-Control no GCS**: os PNGs têm `max-age=31536000` (1 ano). Após a primeira visita, todo o prefetch é servido do disk cache do browser

### Pré-requisitos de Infra

| Requisito | Status | Acção |
|---|---|---|
| PNGs no GCS com coordenadas SVG-space | Implementado | `SvgProcessorService` já upload na criação |
| Metadados `raster_images_light/dark` na API | Implementado | `Processogram` model já expõe (com `mapToRecord` fix) |
| CORS no bucket GCS | **Configurado** | `gsutil cors set cors-config.json gs://welfaredata-new` |
| Acesso público aos objectos `raster/*.png` | **Configurado** | IAM `allUsers:objectViewer` activo |

---

## Relação com ADR-002 e ADR-003

Os três ADRs formam o **Nível 1 + Nível 2 de Otimização**:

| ADR | Camada | Problema | Solução |
|---|---|---|---|
| ADR-002 | React | 60 re-renders/s durante hover | Event Delegation nativa; `useRef` |
| ADR-003 | Browser / GSAP | Eventos DOM activos durante câmara | `pointerEvents: none` + `killTweensOf` |
| ADR-004 v1 | GPU | Nós vectoriais/frame durante zoom | Rasterização client-side (Canvas) |
| ADR-004 v2 | GPU + Rede | Latência de rasterização client-side | LOD via PNG Swap: prefetch + swap O(1) |
| **ADR-004 v2.1** | **GPU + Main Thread** | **Contenção rAF + 1200 filter repaints/frame** | **rAF time-slicing (400 el/frame) + `gsap.set` instantâneo** |
