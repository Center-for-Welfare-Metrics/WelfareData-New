# Camera Drilldown Mechanics

## Visão Geral

O sistema de navegação implementa um **Zoom Progressivo** (Drill-down) inspirado em interfaces SCADA e mapas táticos. Em vez de saltar diretamente para um elemento profundamente aninhado, a câmera avança **um nível hierárquico por vez**, criando um efeito visual de "Matrioska" — cada camada se revela progressivamente conforme o utilizador aprofunda a exploração.

## Arquitetura de Componentes

```
┌─────────────────────────────────────────────────────────┐
│  page.tsx (Orquestrador)                                │
│                                                         │
│  useProcessogramState(elements, questions)               │
│  ├─ selectedElementId                                    │
│  ├─ activeLevelIndex      ◄── Índice atual no breadcrumb│
│  ├─ zoomTargetId          ◄── ID que a câmera persegue  │
│  ├─ breadcrumbPath[]      ◄── Hierarquia completa       │
│  ├─ handleDrilldown(id)   ◄── Lógica Matrioska         │
│  ├─ navigateUp(index)     ◄── Zoom Out reverso          │
│  └─ clearSelection()      ◄── Reset total               │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────┐      │
│  │ Breadcrumb   │  │ Interactive  │  │ SidePanel │      │
│  │ (navegação)  │  │ Layer        │  │ (dados)   │      │
│  └──────┬───────┘  │ (captura     │  └───────────┘      │
│         │          │  cliques)     │                      │
│         │          └──────┬───────┘                      │
│         │                 │                              │
│         │          ┌──────┴───────┐                      │
│         │          │ Viewer       │                      │
│         │          │ ┌──────────┐ │                      │
│         └──────────┤►│ Camera   │ │                      │
│                    │ │ Controller│ │                      │
│   zoomTargetId ───►│ │(useControls)│                    │
│                    │ └──────────┘ │                      │
│                    └──────────────┘                      │
└─────────────────────────────────────────────────────────┘
```

## O Efeito Matrioska — Algoritmo de Drill-down

### Problema

Um processograma SVG tem 4 níveis hierárquicos aninhados:

```
Level 0: Production System (ps)
  Level 1: Life-Fate (lf)
    Level 2: Phase (ph)
      Level 3: Circumstance (ci)
```

Se o utilizador clica diretamente num elemento de nível 3 (circumstance) enquanto está na visão global (nível -1), o zoom direto seria desorientador — não haveria contexto de onde o elemento se encaixa na hierarquia.

### Solução: Avanço Progressivo

**Regra**: A cada clique, o sistema avança exatamente **1 índice** no array `breadcrumbPath`, nunca saltando etapas.

### Fluxo Detalhado

```
Estado Inicial: activeLevelIndex = -1, breadcrumbPath = []

Clique 1: Utilizador clica em "feeder--ci" (nível 3)
├─ buildHierarchyFromDom("feeder--ci") retorna:
│   [0] { id: "broiler-production--ps",  level: "production system" }
│   [1] { id: "broiler--lf",             level: "life-fate" }
│   [2] { id: "growing--ph",             level: "phase" }
│   [3] { id: "feeder--ci",              level: "circumstance" }
├─ É um novo alvo → pendingTarget = "feeder--ci"
├─ Avança para índice 0 (primeiro nível)
├─ zoomTargetId = "broiler-production--ps"
├─ Câmera faz zoom para o Production System
└─ Breadcrumb: [SYS broiler production ◄]

Clique 2: Utilizador clica em "feeder--ci" novamente
├─ pendingTarget === "feeder--ci" → continuação do drill-down
├─ currentIdx=0, targetFinalIdx=3 → nextIdx = 1
├─ zoomTargetId = "broiler--lf"
├─ Câmera avança para Life-Fate
└─ Breadcrumb: [SYS broiler production > LF broiler ◄]

Clique 3: Utilizador clica em "feeder--ci" novamente
├─ nextIdx = 2
├─ zoomTargetId = "growing--ph"
└─ Breadcrumb: [SYS ... > LF broiler > PH growing ◄]

Clique 4: Utilizador clica em "feeder--ci" novamente
├─ nextIdx = 3 (= targetFinalIdx)
├─ zoomTargetId = "feeder--ci"
├─ pendingTarget = null (destino alcançado)
└─ Breadcrumb: [SYS ... > LF ... > PH growing > CI feeder ◄]
```

### Pseudocódigo

```
function handleDrilldown(clickedId):
  fullPath = buildHierarchyFromDom(clickedId)

  if pendingTarget === clickedId AND breadcrumbPath exists:
    // CONTINUAÇÃO — avança 1 nível
    nextIdx = min(activeLevelIndex + 1, indexOfClicked)
    if nextIdx <= activeLevelIndex: return  // já no destino
    applyLevelState(fullPath, nextIdx)
    if nextIdx >= indexOfClicked: pendingTarget = null

  else:
    // NOVO ALVO — começa do nível 0
    pendingTarget = clickedId
    applyLevelState(fullPath, 0)
```

## Câmera — `CameraController`

O `CameraController` é um componente renderless (retorna `null`) montado **dentro** do `TransformWrapper`. Isso permite usar o hook `useControls()` da biblioteca `react-zoom-pan-pinch`.

### Reação ao Estado

```typescript
useEffect(() => {
  if (!zoomTargetId) {
    // Sem alvo → reset para visão global
    resetTransform(800ms, "easeInOutCubic")
    return
  }

  // Calcula scale dinâmico baseado no bounding box do elemento
  const scale = computeDynamicScale(zoomTargetId, wrapperElement)

  // Executa zoom suave
  zoomToElement(zoomTargetId, scale, 800ms, "easeInOutCubic")
}, [zoomTargetId])
```

### Cálculo de Scale Dinâmico

O scale é calculado para que o bounding box do elemento SVG ocupe ~85% da viewport:

```
                    ┌─── Wrapper (viewport) ───┐
                    │                          │
                    │   ┌── Element BBox ──┐   │
                    │   │                  │   │
                    │   │   85% padding    │   │
                    │   │                  │   │
                    │   └──────────────────┘   │
                    │                          │
                    └──────────────────────────┘

scaleX = (wrapperWidth × 0.85) / bboxWidth
scaleY = (wrapperHeight × 0.85) / bboxHeight
idealScale = min(scaleX, scaleY)
finalScale = clamp(idealScale, 0.5, 6.0)
```

A função `computeDynamicScale` usa `getBBox()` do SVG para obter as dimensões reais do elemento, garantindo que mesmo elementos de tamanhos muito diferentes recebam um nível de zoom adequado.

### Timing

- `800ms` de animação com easing `easeInOutCubic` — suave e cinematográfico
- `requestAnimationFrame` garante que o DOM está pronto antes do cálculo
- Deduplicação via `prevTargetRef` evita re-zooms no mesmo alvo

## Breadcrumb — Controlador de Estado Reverso

### Estrutura Visual

```
┌──────────────────────────────────────────────────────────┐
│ 🏠 › SYS Broiler Production › LF Broiler › PH Growing 📍│
│      ↑ clickável (zoom out)   ↑ clickável    ↑ ativo     │
└──────────────────────────────────────────────────────────┘
```

### Estados Visuais dos Itens

| Estado   | Aparência                    | Ação ao Clicar           |
|----------|------------------------------|--------------------------|
| Ativo    | Fundo primário, ícone 📍     | Nenhuma (já está aqui)   |
| Passado  | Texto claro, hover visível   | `navigateUp(index)` → Zoom Out |
| Futuro   | Texto escurecido, desabilitado| Bloqueado                |

### Códigos de Cores por Nível

| Nível              | Abreviação | Cor          |
|--------------------|------------|--------------|
| Production System  | SYS        | `sky-400`    |
| Life-Fate          | LF         | `amber-400`  |
| Phase              | PH         | `emerald-400`|
| Circumstance       | CI         | `rose-400`   |

### Zoom Out via Breadcrumb

Quando o utilizador clica num item anterior no breadcrumb:

```
Breadcrumb: [SYS > LF > PH ◄ > CI]
Clique em "LF":
  → navigateUp(1)
  → activeLevelIndex = 1
  → zoomTargetId = id do Life-Fate
  → CameraController detecta mudança → zoomToElement()
  → Breadcrumb atualiza: [SYS > LF ◄ > PH > CI]
                                        ↑ futuro (desabilitado)
```

### Reset (Botão Home)

```
Clique em 🏠:
  → clearSelection()
  → activeLevelIndex = -1, zoomTargetId = null
  → CameraController detecta null → resetTransform()
  → Breadcrumb desaparece (path vazio)
```

## Relação entre Componentes

### Fluxo de Dados Unidirecional

```
Clique no SVG
  → InteractiveLayer.handleClick
    → page.handleElementSelect(id)
      → useProcessogramState.handleDrilldown(id)
        → Atualiza: breadcrumbPath, activeLevelIndex, zoomTargetId
          → React re-render
            → ProcessogramBreadcrumb atualiza UI
            → ProcessogramViewer.CameraController
              → useEffect detecta novo zoomTargetId
                → zoomToElement() → animação de câmera
```

### Independência de Componentes

- **InteractiveLayer**: Apenas captura cliques e emite IDs. Não sabe nada sobre hierarquia.
- **CameraController**: Apenas reage a `zoomTargetId`. Não sabe nada sobre drill-down.
- **Breadcrumb**: Apenas renderiza `breadcrumbPath` e emite `navigateUp`. Não manipula câmera.
- **useProcessogramState**: O único componente que entende a lógica de navegação hierárquica.

Esta separação permite testar cada componente isoladamente e substituir qualquer parte (ex: trocar a biblioteca de zoom) sem afetar a lógica de negócio.

---

## Troubleshooting de Event Bubbling

### Problema Original

Elementos-pai transparentes (como `<g id="fase--lf">`) interceptavam cliques destinados a
filhos menores e visíveis (como `<rect id="circunstancia--ci_03">`). Isso acontecia porque o
handler antigo usava `target.closest("[id]")`, que encontrava **qualquer** ancestral com atributo
`id` — não necessariamente um elemento analisável.

### Causa Raiz

1. O SVG exportado frequentemente contém grupos (`<g>`) com IDs arbitrários (ex: `layer1`,
   `grupo-23`). Esses IDs **não** seguem o padrão analisável (`--ps`, `--lf`, `--ph`, `--ci`).
2. `closest("[id]")` subia a árvore DOM e retornava o **primeiro** ancestral com qualquer `id`,
   que frequentemente era um `<g>` pai transparente cobrindo toda a área.
3. O click handler propagava para cima, fazendo com que múltiplos handlers disparassem.

### Solução Implementada

#### `resolveDeepestAnalyzableNode(startNode)` em `ProcessogramInteractiveLayer.tsx`

```
1. Começa no e.target (o elemento SVG mais profundo sob o cursor)
2. Se o próprio target tem id analisável → retorna ele
3. Senão, usa closest('[id]') para achar o ancestral mais próximo com id
4. Se esse ancestral tem id analisável → retorna ele
5. Se não, caminha para cima (parentElement) repetindo o teste
6. Só retorna null se nenhum ancestral no caminho é analisável
```

#### Filtro `isAnalyzableId(id)`

Reutiliza o padrão regex `ANALYZABLE_PATTERN = /(?:--|_)(ps|lf|ph|ci)(?:[_-]\d+[_-]?)?$/` já
exportado pelo hook `useProcessogramState`. Isso garante que **apenas** IDs no formato esperado
(sufixos `--ps`, `--lf`, `--ph`, `--ci`) sejam aceitos como clicáveis.

#### `e.stopPropagation()`

Adicionado no início do `handleClick` para evitar que o evento borbulhe para handlers de
ancestrais, eliminando o double-firing.

### Antes vs Depois

| Cenário                         | Antes (bug)                              | Depois (fix)                           |
| ------------------------------- | ---------------------------------------- | -------------------------------------- |
| Clique em `circunstancia--ci_3` | Resolvia para `<g id="layer1">` (pai)    | Resolve para `circunstancia--ci_3`     |
| Clique em área vazia do SVG     | Resolvia para `<g id="svg-root">` (raiz) | `null` → nada acontece                 |
| Clique em `fase--lf_2`          | Resolvia corretamente                    | Resolvia corretamente                  |
| Double-click propagado          | Disparava 2 handlers                     | Apenas 1 handler (stopPropagation)     |

### Zoom Token Único

O `zoomTargetId` agora usa formato `zoom__<realId>__<levelIdx>__<timestamp>` em vez do ID bruto.
Isso garante que o `useEffect` do `CameraController` **sempre** dispare quando o nível muda, mesmo
que o elemento-alvo do zoom seja o mesmo SVG element em transições intermediárias do Matrioska.

A função `extractRealId()` no `ProcessogramViewer.tsx` extrai o ID real antes de passá-lo a
`zoomToElement()` e `computeDynamicScale()`.

### Reset sem Catapulta

Trocamos `resetTransform()` por `centerView(1, animTime, easing)` no `CameraController`. O
`resetTransform()` restaurava a transform matrix para o estado inicial absoluto, que podia não
corresponder ao viewport atual — causando o SVG a "voar" para fora da tela. O `centerView(1, ...)`
calcula o centro atual do conteúdo e anima suavemente até ele com scale=1.
