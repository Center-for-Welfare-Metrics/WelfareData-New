# ADR-004: Motor de Rasterização Dinâmica (LOD via PNG Swap)

**Status:** Aceito (v2.3)
**Data:** 09/03/2026
**Autores:** WFI Engineering Team

---

## Histórico de Versões

| Versão | Data | Mudança |
|---|---|---|
| v1 | 05/03/2026 | Canvas client-side: `XMLSerializer → Blob → Canvas → base64` |
| v2 | 06/03/2026 | LOD via PNG Swap: lookup O(1) em PNGs pré-renderizados pelo backend |
| v2.1 | 06/03/2026 | rAF time-slicing (400 el/frame) + filtro instantâneo (`gsap.set`) |
| **v2.2** | **09/03/2026** | **Proteção de ancestrais: target + cadeia ancestral nunca rasterizados** |
| **v2.3** | **09/03/2026** | **Z-order SVG: elevação do target + herança de filtro para `<image>`** |

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
  │       ├─ protectedIds(target + ancestrais) ← guarda defensiva v2.2
  │       └─ requestAnimationFrame:      ← liberta frame para GSAP
  │             processChunk(400 el/frame):
  │               epoch check            ← aborta se navegação stale
  │               protectedIds check      ← skip target + ancestrais
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
| **Ancestral do target no outOfFocusElements** | **v2.2: `el.contains(target)` filtra ancestrais no useNavigator; `protectedIds` Set guarda defensiva no processChunk** |
| **PNGs de irmãos cobrem target (SVG z-order)** | **v2.3: `appendChild(target)` eleva o target para o fim do parent; `elevatedRef` guarda posição original para restauro** |
| **`<image>` sem filtro a 100% brilho sobrepõe target** | **v2.3: `rasterizeElement` copia `style.filter` do `<g>` para o `<image>` — mesma aparência visual** |

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

---

## Otimização v2.2: Proteção de Ancestrais (Target Nítido)

### Bug Identificado

O target do zoom (elemento clicado) aparecia desfocado/pixelado durante e após a animação de câmera. O utilizador via um PNG de baixa resolução em vez do SVG vectorial nítido.

### Causa Raiz

O `outOfFocusSelector` para níveis não-folha:

```css
[id*="--"]:not([id^="${id}"] *):not([id="${id}"])
```

Exclui correctamente:
- O target (`:not([id="${id}"])`)
- Descendentes do target (`:not([id^="${id}"] *)`)

**Mas NÃO exclui ancestrais do target.** Exemplo com hierarquia:

```
<g id="conventional_cages--ps">           ← ancestral (nível 0)
  <g id="laying_hen--lf">                 ← ancestral (nível 1)
    <g id="laying--ph">                   ← TARGET (nível 2)
      <g id="heat--ci">                   ← descendente (nível 3)
```

Quando o utilizador clica em `laying--ph`, o selector inclui `laying_hen--lf` (e `conventional_cages--ps`) como "fora de foco". Isto causa **dois problemas simultâneos**:

| Problema | Mecanismo | Efeito Visual |
|---|---|---|
| **Herança de CSS filter** | `gsap.set(ancestral, { filter: brightness(0.3) })` propaga para **todos** os filhos | Target aparece escurecido a 30% |
| **Rasterização de ancestral** | `display:none` no ancestral oculta o `<g>` do target | Target desaparece; utilizador vê o PNG do ancestral (baixa resolução) |

### Solução (Dois Pontos de Protecção)

#### Ponto 1: Filtro de ancestrais no `useNavigator.ts`

```typescript
// ANTES (v2.1): ancestrais incluídos → target desfocado
const outOfFocusElements =
  svgElement.querySelectorAll(outOfFocusSelector);

// DEPOIS (v2.2): ancestrais excluídos via el.contains(target)
const outOfFocusElements = Array.from(
  svgElement.querySelectorAll(outOfFocusSelector),
).filter((el) => !el.contains(target));
```

`el.contains(target)` é uma verificação DOM nativa O(1) que retorna `true` se `el` é ancestral do `target` (ou o próprio target). Isto garante que:
- Ancestrais NÃO recebem `brightness(0.3)` → CSS filter não propaga
- Ancestrais NÃO são passados ao `optimizeLevelElements` → não rasterizados

#### Ponto 2: Guarda defensiva no `useOptimizeSvgParts.ts`

```typescript
// Coletar IDs do target + toda a cadeia ancestral
const protectedIds = new Set<string>();
if (currentElement.id) protectedIds.add(currentElement.id);
let ancestorEl: Element | null = currentElement.parentElement;
while (ancestorEl) {
  if (ancestorEl.id) protectedIds.add(ancestorEl.id);
  ancestorEl = ancestorEl.parentElement;
}

// No processChunk: skip silencioso para IDs protegidos
for (let i = index; i < end; i++) {
  if (protectedIds.has(elements[i].id)) continue;
  rasterizeElement(elements[i]);
}
```

Esta guarda é **redundante por design**: o ponto 1 já filtra ancestrais do input. Mas protege contra chamadas ao `optimizeLevelElements` fora do fluxo standard de `changeLevelTo`.

### Comportamento Visual Correcto (v2.2)

```
<g id="conventional_cages--ps">     ← SEM filter, SEM rasterização (ancestral)
  <g id="laying_hen--lf">           ← SEM filter, SEM rasterização (ancestral)
    <g id="laying--ph">             ← TARGET: vectorial 100%, brightness(1)
      <g id="heat--ci">             ← descendente protegido pelo selector
    </g>
    <g id="rearing--ph">            ← brightness(0.3) + rasterizado (irmão)
  </g>
  <g id="broiler--lf">              ← brightness(0.3) + rasterizado (irmão)
  </g>
</g>
```

### Ficheiros Alterados (v2.1 → v2.2)

| Ficheiro | Mudança |
|---|---|
| `navigator/hooks/useNavigator.ts` | Filtro `el.contains(target)` no `outOfFocusElements`; tipo `NodeListOf<Element>` → `readonly Element[]` |
| `navigator/hooks/useOptimizeSvgParts.ts` | Guarda `protectedIds` (Set de target + ancestrais) no `processChunk`; tipo `NodeListOf<Element>` → `readonly Element[]` |

### Impacto de Performance

| Operação | Custo |
|---|---|
| `el.contains(target)` por elemento no `.filter()` | ~O(1) DOM nativo — negligível |
| Construção do `protectedIds` Set (walk up DOM tree) | ~3-5 iterações (profundidade da hierarquia) — O(depth) |
| `protectedIds.has(id)` por elemento no `processChunk` | O(1) Set lookup — negligível |

**Nenhum impacto mensurável** na performance de transição. O overhead total é < 0.1ms.

---

## Otimização v2.3: Z-Order SVG + Herança de Filtro no `<image>`

### Bug Identificado

No nível CI (MAX_LEVEL), o target do zoom aparecia coberto por PNGs dos irmãos.
O elemento selecionado (ex: porco gilt) ficava com qualidade de imagem PNG apesar
de ser o alvo da câmara.

### Causa Raiz (Duas Questões Combinadas)

#### 1. Z-Order SVG = Ordem DOM

Em SVG, o elemento mais tardio no DOM renderiza POR CIMA dos anteriores.
`rasterizeElement` insere o `<image>` após o `<g>` oculto:

```typescript
element.parentNode?.insertBefore(imageEl, element.nextSibling);
```

Quando irmãos do mesmo nível se sobrepõem espacialmente (ex: porcos no mesmo
pen com contornos que se cruzam), o `<image>` PNG de um irmão é inserido
DEPOIS do target no DOM — renderizando POR CIMA do vector nítido:

```
DOM antes do swap:
  <g id="gilt--ci">...</g>           ← target (vector)
  <g id="boar--ci">...</g>           ← irmão

DOM após rasterização:
  <g id="gilt--ci">...</g>           ← target (vector), z-index INFERIOR
  <g id="boar--ci" display:none>     ← oculto
  <image for="boar--ci" .../>        ← PNG, renderiza POR CIMA de gilt!
```

#### 2. Filtro Ausente no `<image>`

O `gsap.set()` aplica `brightness(0.3)` ao `<g>` original. Mas quando
`rasterizeElement` oculta o `<g>` e insere o `<image>` como **sibling** (não
filho), o `<image>` **NÃO herda** o filtro CSS. Resultado: o PNG é renderizado
a **100% de brilho**, tornando a sobreposição sobre o target ainda mais visível.

### Solução (Três Pontos de Correcção)

#### Ponto 1: Elevação do Target (`optimizeLevelElements`)

```typescript
// ANTES: target pode ficar abaixo dos <image> dos irmãos
requestAnimationFrame(processChunk);

// DEPOIS (v2.3): move target para o fim do parent
const targetParent = currentElement.parentNode;
if (targetParent) {
  elevatedRef.current = {
    element: currentElement,
    parent: targetParent,
    nextSibling: currentElement.nextSibling,
  };
  targetParent.appendChild(currentElement);
}
requestAnimationFrame(processChunk);
```

`appendChild` com um filho existente **move** (não clona). O GSAP mantém
referências por ponteiro, não por posição DOM — os tweens continuam funcionais.

Resultado DOM:

```
<g id="boar--ci" display:none>     ← oculto
<image for="boar--ci" .../>        ← PNG
<g id="gilt--ci">...</g>           ← target: VECTOR, z-index SUPERIOR ✓
```

#### Ponto 2: Restauro de Z-Order (`restoreAllRasterized`)

```typescript
// Restaura a posição original antes de limpar as rasterizações
if (elevatedRef.current) {
  const { element, parent, nextSibling } = elevatedRef.current;
  if (element.parentNode === parent) {
    parent.insertBefore(element, nextSibling);
  }
  elevatedRef.current = null;
}
```

Garante que o DOM volta à ordem original do SVG entre transições.

#### Ponto 3: Herança de Filtro no `<image>` (`rasterizeElement`)

```typescript
// ANTES (v2.2): <image> sem filtro → renderiza a 100% brilho
element.style.display = "none";
element.parentNode?.insertBefore(imageEl, element.nextSibling);

// DEPOIS (v2.3): copia o inline filter do <g> para o <image>
if (element.style.filter) {
  imageEl.style.filter = element.style.filter;
}
element.style.display = "none";
element.parentNode?.insertBefore(imageEl, element.nextSibling);
```

Copiar o `style.filter` (aplicado pelo `gsap.set` em useNavigator) garante
que o PNG herda a mesma aparência visual do `<g>` original.

### Ficheiros Alterados (v2.2 → v2.3)

| Ficheiro | Mudança |
|---|---|
| `navigator/hooks/useOptimizeSvgParts.ts` | `elevatedRef` para z-order; `appendChild(target)` + restauro em `restoreAllRasterized`; cópia `style.filter` para `<image>` em `rasterizeElement` |

### Impacto de Performance

| Operação | Custo |
|---|---|
| `appendChild(target)` | O(1) DOM nativo — move 1 nó |
| `insertBefore(target, nextSibling)` no restore | O(1) DOM nativo |
| `style.filter` copy | O(1) property read + write |

---

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
| ADR-004 v2.1 | GPU + Main Thread | Contenção rAF + 1200 filter repaints/frame | rAF time-slicing (400 el/frame) + `gsap.set` instantâneo |
| **ADR-004 v2.2** | **DOM + CSS** | **Ancestrais rasterizados ocultam o target** | **Filtro de ancestrais (`el.contains`) + guarda defensiva `protectedIds`** |
| **ADR-004 v2.3** | **SVG Z-Order** | **PNGs de irmãos sobrepõem target (DOM order)** | **Elevação do target (`appendChild`) + herança de filtro no `<image>`** |
