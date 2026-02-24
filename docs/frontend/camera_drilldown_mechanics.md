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
