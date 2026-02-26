# ⚙️ Física da Navegação SVG — Drill-down, Drill-up & GSAP ViewBox

> **Módulo:** `navigator/hooks/useNavigator.ts`, `navigator/hooks/useClickHandler.ts`, `navigator/hierarchy.ts`  
> **Etapa:** 3 de 5  
> **Referência:** `GUIA_REPLICACAO_SVG_NAVIGATOR.md` §6, §9, §10  

---

## Visão Geral

A navegação no processograma SVG funciona como uma **câmera cinematográfica**: o usuário clica num grupo hierárquico e a câmera "desliza" suavemente até enquadrá-lo. O browser já é o motor de projeção — alterar o atributo `viewBox` faz o browser recalcular a projeção automaticamente. O GSAP apenas interpola os 4 números de A para B em 0.7s.

---

## Arquitetura dos Módulos

```
navigator/
├── hierarchy.ts              ← Monta o breadcrumb via closest()
├── hooks/
│   ├── useNavigator.ts       ← changeLevelTo() — core GSAP animation
│   └── useClickHandler.ts    ← Interceptação global de cliques
```

---

## 1. Interceptação de Clique (`useClickHandler`)

### Por que o listener fica no `window` e não no `<svg>`?

Eventos de clique em elementos internos do SVG (`<text>`, `<path>`, `<tspan>`) **não propagam de forma confiável** para o `<svg>` raiz. Em alguns browsers, o `click` dispara no `<path>` mas nunca chega ao `<svg>`.

A solução é um listener global no `window` que intercepta **todos** os cliques. De qualquer `event.target`, usamos `target.closest("[id*='--lf']")` para subir na árvore DOM até encontrar o `<g>` com ID semântico.

> **Pré-requisito:** Os IDs do SVG devem seguir a convenção `{slug}--{alias}`. SVGs com separadores alternativos (ex: `sow_lf`) são normalizados automaticamente no pipeline de upload pelo [`normalizeSemanticIdsPlugin`](../technical/09A-NORMALIZE_SEMANTIC_IDS_PLUGIN.md).

### Fluxo de Decisão

```
  Clique no window
       │
       ▼
  ┌─ lockInteraction? ───► SIM → ignora (animação em curso)
  │
  └─ NÃO
       │
       ▼
  event.stopPropagation()
       │
       ▼
  getClickedStage(target, currentLevel)
       │
       ├── Tenta: target.closest("[id*='--lf']")  ← próximo nível
       │   ↓ fallback
       ├── Tenta: target.closest("[id*='--ps']")  ← nível atual
       │
       ├─ ACHOU elemento ──► changeLevelTo(elemento, false)
       │                      = DRILL-DOWN (zoom in)
       │
       └─ NÃO ACHOU (clicou no "vazio")
              │
              ▼
         currentLevel > 1? ──► SIM → historyLevel[prev]
              │                       → changeLevelTo(pai, true)
              │                       = DRILL-UP (zoom out)
              │
              └─ currentLevel = 1? → changeLevelTo(svgElement, true)
                                      = volta ao root
              │
              └─ currentLevel = 0? → onClose()
                                      = fecha o processograma
```

### `getClickedStage(target, level)` — Resolução do Grupo Semântico

A prioridade é **sempre o próximo nível** antes do nível atual. Isso garante que ao clicar dentro de um grupo do nível atual, o sistema encontre o sub-grupo filho (drill-down), não o próprio grupo (que seria um no-op).

```typescript
// Se currentLevel = 0, tenta --lf (nível 1) primeiro
const nextLevelSelector = `[id*="${INVERSE_DICT[level + 1]}"]`;
const currentLevelSelector = `[id*="${INVERSE_DICT[level]}"]`;

return target.closest(nextLevelSelector) || target.closest(currentLevelSelector);
```

---

## 2. Navegação Principal (`useNavigator.changeLevelTo`)

### Assinatura

```typescript
changeLevelTo(target: SVGElement, toPrevious: boolean, callback?: () => void): void
```

- `target` — Elemento SVG para onde a câmera vai
- `toPrevious` — `true` = drill-up (voltando), `false` = drill-down
- `callback` — Executado após a animação completar

### Sequência de Operações

```
changeLevelTo(target, toPrevious)
       │
       ▼
  1. getElementViewBox(target)
     └─ getBBox() → compensação ratio → padding → "x y w h"
       │
       ▼
  2. Salvar no histórico
     └─ historyLevelRef.current[level] = { id }
     └─ currentElementIdRef.current = id
     └─ currentLevelRef.current = level
       │
       ▼
  3. [TODO: Etapa 4] Isolamento Visual
     └─ gsap.to(irmãos, { filter: brightness(0.3) })
       │
       ▼
  4. Notificar onChange(identifier, hierarchy)
       │
       ▼
  5. lockInteraction = true
     └─ gsap.fromTo(svg,
          { pointerEvents: "none" },
          { attr: { viewBox: "x y w h" },
            duration: 0.7,
            ease: "power1.inOut",
            onComplete: () => {
              pointerEvents: "auto"
              setFullBrightnessToCurrentLevel()
              lockInteraction = false
              callback?.()
            }
          })
```

### Timeline (0.7s)

```
t=0ms:      viewBox = "0 0 1200 800"    pointerEvents = none    lock = true
t=350ms:    viewBox interpolando...       (bloqueado)
t=700ms:    viewBox = "200 100 400 300"  pointerEvents = auto    lock = false
```

---

## 3. Hierarquia & Breadcrumb (`hierarchy.ts`)

### `getHierarchy(element)` — Resolução de Ancestrais

Dado qualquer `<g>` clicado, sobe na árvore DOM usando `closest()` para montar o caminho completo:

```typescript
// Para heat-stress--ci1 (nível 3):
// 1. closest("[id*='--ph']") → feeding--ph1 (nível 2)
// 2. closest("[id*='--lf']") → growing--lf1 (nível 1)
// 3. closest("[id*='--ps']") → broiler--ps  (nível 0)
```

**Retorno:**
- `hierarchy` — ancestrais (sem o próprio elemento)
- `hierarchyPath` — ancestrais + o elemento clicado (breadcrumb completo)

### `getElementIdentifier(id, hierarchy)` — Caminho Único

Gera um identificador hierárquico para uso como chave:

```
getElementIdentifier("feeding--ph1", [...])
→ "broiler.growing.feeding"
```

---

## 4. Sistema de Refs (Performance)

Todos os valores mutáveis durante animação são armazenados em `useRef()`, **não em `useState()`**:

| Ref | Tipo | Razão |
|-----|------|-------|
| `currentLevelRef` | `number` | Muda a cada clique — `useState` causaria re-render desnecessário |
| `currentElementIdRef` | `string \| null` | Idem |
| `historyLevelRef` | `Record<number, {id}>` | Mapa de histórico — lido sincronicamente no `handleClick` |
| `lockInteractionRef` | `boolean` | Flag de trava — precisa ser síncrona para o guard do `handleClick` |

**Regra:** Se o valor precisa ser lido **sincronicamente** dentro de um event handler ou callback GSAP, ele DEVE ser `useRef()`. Valores que controlam rendering da UI usam `useState()`.

---

## 5. Proteções Anti-Bug

| Proteção | Onde | Por quê |
|----------|------|---------|
| `lockInteraction` | `handleClick` + `changeLevelTo` | Impede double-click durante animação de 0.7s |
| `pointerEvents: none` | `gsap.fromTo` | Impede interação com o SVG durante a animação |
| `event.stopPropagation()` | `handleClick` | Impede que outros listeners interceptem o clique |
| `CSS.escape(id)` | `querySelector` | Protege contra IDs com caracteres especiais |
| `getElementViewBox → null` | `changeLevelTo` | Se BBox falhar, aborta silenciosamente |
| `historyLevel[prev] check` | `handleClick` drill-up | Se não há histórico para o nível anterior, aborta |

---

## Integração com o Pipeline

```
Etapa 1 (✅) → extractInfoFromId.ts → identifica QUAL elemento navegar
Etapa 2 (✅) → getElementViewBox.ts  → calcula PARA ONDE a câmera vai
Etapa 3 (✅) → useNavigator.ts       → ANIMA a transição com GSAP
              useClickHandler.ts     → DECIDE drill-down vs drill-up
              hierarchy.ts           → MONTA o breadcrumb path
Etapa 4 (🔲) → useHoverEffects.ts    → efeitos visuais de hover + isolamento
Etapa 5 (🔲) → useEventBus.ts        → navegação programática
```
