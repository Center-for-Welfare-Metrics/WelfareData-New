# Navigation State Machine — `useProcessogramState`

## Visão Geral

O hook `useProcessogramState` é o "cérebro" da navegação em camadas (drill-down) do visualizador de Processogramas. Ele gerencia o estado de seleção de elementos SVG, monta a árvore de breadcrumbs (hierarquia de navegação) e disponibiliza os dados da IA (descrições e questões) para o elemento ativo.

## Arquitetura

```
┌──────────────────────────────────────────────────┐
│                    page.tsx                        │
│                                                    │
│  ┌──────────────────────────────────────────────┐ │
│  │        useProcessogramState(elements, questions)│
│  │                                                │ │
│  │  State:                                        │ │
│  │    selectedElementId: string | null            │ │
│  │    activeElementData: ActiveElementData | null │ │
│  │    breadcrumbPath: BreadcrumbItem[]            │ │
│  │                                                │ │
│  │  Actions:                                      │ │
│  │    selectElement(id) ─────────┐               │ │
│  │    clearSelection()           │               │ │
│  │    navigateUp(levelIndex)     │               │ │
│  │                               ▼               │ │
│  │  Derived:                   ┌────────────┐    │ │
│  │    elementsMap              │ SVG DOM     │    │ │
│  │    questionsMap             │ Traversal   │    │ │
│  │    isAnalyzableElement()    └────────────┘    │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  ┌────────────────┐  ┌─────────┐  ┌────────────┐ │
│  │ InteractiveLayer│  │ SidePanel│  │ Breadcrumbs│ │
│  │  (click → select)│ │ (data)  │  │ (navigateUp)│ │
│  └────────────────┘  └─────────┘  └────────────┘ │
└──────────────────────────────────────────────────┘
```

## Tipos

### `ElementLevel`

```ts
type ElementLevel = "production system" | "life-fate" | "phase" | "circumstance" | "unknown";
```

Mapeado a partir do sufixo do ID SVG:
| Sufixo | Level            |
|--------|------------------|
| `ps`   | production system|
| `lf`   | life-fate        |
| `ph`   | phase            |
| `ci`   | circumstance     |

### `BreadcrumbItem`

```ts
interface BreadcrumbItem {
  id: string;         // ID do elemento SVG ou ID sintético para pais inferidos
  label: string;      // Nome limpo extraído do ID
  levelName: ElementLevel;
}
```

### `ActiveElementData`

```ts
interface ActiveElementData {
  elementId: string;
  level: ElementLevel;
  label: string;
  description: string;              // Gerada pela IA (Gemini)
  parents: BreadcrumbItem[];        // Hierarquia de ancestrais
  questions: ProcessogramQuestion[]; // Questões geradas pela IA
}
```

## Fluxo de Dados

### 1. Carregamento Inicial

```
page.tsx monta → busca processogram + SVG
                → busca elements (GET /processograms/:id/data/public)
                → busca questions (GET /processograms/:id/questions)
                → passa (elements, questions) → useProcessogramState
```

Os dados da IA são carregados em paralelo, sem bloquear a renderização do SVG. O hook cria dois `Map` indexados por `elementId` para lookup O(1):

- `elementsMap: Map<string, ProcessogramElement>` — Descrições
- `questionsMap: Map<string, ProcessogramQuestion[]>` — Questões agrupadas por elemento

### 2. Seleção de Elemento (`selectElement`)

Quando o usuário clica em um elemento SVG:

```
click no SVG → InteractiveLayer.handleClick
             → onElementSelect(id)
             → handleElementSelect(id)
             → selectElement(id)
```

Dentro de `selectElement(id)`:

1. **Travessia DOM**: Busca o elemento no SVG renderizado via `document.querySelector`
2. **Construção do Breadcrumb**: Sobe a árvore DOM do SVG, coletando ancestrais com IDs analisáveis (padrão `ps|lf|ph|ci`)
3. **Ordenação por Hierarquia**: Ordena por rank (`production system → life-fate → phase → circumstance`)
4. **Montagem do `ActiveElementData`**: Busca descrição + questões dos Maps

### 3. Construção do Breadcrumb — Algoritmo

O breadcrumb é construído pela **travessia real da árvore SVG DOM**, que é a fonte mais confiável da hierarquia:

```
SVG DOM:
<g id="broiler-chicken-production--ps">          ← production system
  <g id="broiler--lf">                           ← life-fate
    <g id="growing-phase--ph">                   ← phase
      <g id="feeder--ci">                        ← circumstance (clicado)
```

**Resultado do breadcrumb:**

```ts
[
  { id: "broiler-chicken-production--ps", label: "broiler chicken production", levelName: "production system" },
  { id: "broiler--lf",                   label: "broiler",                    levelName: "life-fate" },
  { id: "growing-phase--ph",             label: "growing phase",              levelName: "phase" },
  { id: "feeder--ci",                    label: "feeder",                     levelName: "circumstance" },
]
```

**Fallback (sem DOM):** Se o SVG container não estiver disponível, o hook usa um algoritmo heurístico baseado nos `elements` conhecidos, comparando nomes e ranks hierárquicos.

### 4. Navegação para Cima (`navigateUp`)

```
click no breadcrumb[index] → navigateUp(index)
```

- Se `index` aponta para o **último item** (elemento atual): nenhuma ação
- Se `index` aponta para um **elemento real** (existe no `elementsMap`): chama `selectElement(targetId)` — efetivamente "sobe" para aquele nível
- Se `index` aponta para um **pai sintético** (sem dados no backend): trunca o breadcrumb até aquele ponto e limpa a seleção

### 5. Limpeza (`clearSelection`)

```
click no botão fechar / click no mesmo elemento → clearSelection()
→ selectedElementId = null
→ activeElementData = null
→ breadcrumbPath = []
```

## Extração de Nome e Nível a partir de IDs SVG

Os IDs SVG seguem a convenção:

```
{nome-descritivo}--{sufixo-de-nível}
{nome-descritivo}__{sufixo-de-nível}
```

### `extractLevel(id)`
Usa o regex `(?:--|_)(ps|lf|ph|ci)(?:[_-]\d+[_-]?)?$` para extrair o sufixo e mapear para o nome do nível.

### `extractCleanName(id)`
Remove o sufixo de nível e limpa separadores, convertendo hífens/underscores em espaços.

**Exemplo:**
```
"broiler-chicken-production--ps"
→ level: "production system"
→ name:  "broiler chicken production"
```

## Hierarquia de Rank

Usada para ordenação e inferência heurística de parentesco:

| Rank | Level            |
|------|------------------|
| 0    | production system|
| 1    | life-fate        |
| 2    | phase            |
| 3    | circumstance     |
| 99   | unknown          |

## Uso Futuro

Este hook é a fundação para:

- **Auto-Zoom**: Quando `selectElement` é chamado, o `ProcessogramViewer` pode receber `selectedElementId` e usar `react-zoom-pan-pinch` para centralizar/ampliar o elemento
- **Blackout Visual**: O `ProcessogramInteractiveLayer` pode usar `breadcrumbPath` para escurecer todos os elementos fora do caminho de ancestrais
- **Breadcrumb UI**: O `breadcrumbPath` alimenta uma barra de navegação clicável
- **Painel de Questões**: O `activeElementData.questions` alimenta um quiz interativo no `SidePanel`
