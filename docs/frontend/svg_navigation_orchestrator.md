# SVG Navigation Orchestrator — `useSvgNavigatorLogic`

## Visão Geral

O `useSvgNavigatorLogic` é o **hook orquestrador** que compõe os 3 hooks internos do módulo `navigator/` numa interface única e simples para o componente `ProcessogramViewer`.

```
┌────────────────────────────────────────────────────────────────────┐
│                        page.tsx                                    │
│                                                                    │
│   useSvgNavigatorLogic({                                          │
│     currentTheme,                                                  │
│     onChange: (id, hierarchy) => { atualiza UI },                  │
│     onClose: () => { limpa seleção },                              │
│   })                                                               │
│     │                                                              │
│     ├── updateSvgElement(svgEl) → passa ao ProcessogramViewer      │
│     ├── onMouseMove(e)          → passa ao ProcessogramViewer      │
│     └── onMouseLeave()          → passa ao ProcessogramViewer      │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────────────────┐
│                   useSvgNavigatorLogic.ts                           │
│                                                                    │
│   Estado:                                                          │
│     svgElement     (useState)                                      │
│     onHover        (useState)                                      │
│                                                                    │
│   Refs mutáveis (sufixo Ref — React Compiler):                    │
│     historyLevelRef       → HistoryLevel                           │
│     currentLevelRef       → number                                 │
│     currentElementIdRef   → string | null                          │
│     lockInteractionRef    → boolean                                │
│                                                                    │
│   Composição:                                                      │
│     ┌─────────────────┐                                            │
│     │  useNavigator    │ → changeLevelTo()                         │
│     └────────┬────────┘                                            │
│              │                                                     │
│     ┌────────▼────────┐                                            │
│     │ useClickHandler  │ → handleClick() [window listener]         │
│     └────────┬────────┘                                            │
│              │                                                     │
│     ┌────────▼────────┐                                            │
│     │ useHoverEffects  │ → efeito visual (side-effect)             │
│     └─────────────────┘                                            │
│                                                                    │
│   Helpers internos:                                                │
│     getElementIdentifierWithHierarchy(id) → [string, hierarchy]    │
│     setFullBrightnessToCurrentLevel(toPrevious) → restaura brilho  │
│                                                                    │
│   Side effects:                                                    │
│     useEffect → window.addEventListener("click", handleClick)      │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

## Fluxo de Dados

### 1. Inicialização
1. `page.tsx` renderiza `<ProcessogramViewer onSvgReady={updateSvgElement} />`
2. `react-inlinesvg` injeta o SVG como DOM real
3. `innerRef` → `handleSvgRef` → `sanitizeSvgElement` → `onSvgReady` → `updateSvgElement`
4. `useSvgNavigatorLogic` armazena o `<svg>` em `useState`
5. O `useEffect` registra `handleClick` no `window`

### 2. Drill-Down (clique)
1. Utilizador clica num `<path>` ou `<text>` dentro do SVG
2. `window.click` → `handleClick` (de `useClickHandler`)
3. `getClickedStage` sobe via `closest()` até achar o `<g>` semântico
4. `changeLevelTo(target, false)` (de `useNavigator`):
   - Calcula `viewBox` destino via `getElementViewBox`
   - Salva no `historyLevelRef`
   - Aplica isolamento visual (GSAP filter) nos irmãos
   - Notifica `onChange(identifier, hierarchy)` → `page.tsx`
   - Anima o `viewBox` com `gsap.fromTo`
   - No `onComplete`: restaura brilho + desbloqueia interação

### 3. Hover
1. `onMouseMove` (no wrapper do SVG) → `target.closest("[id*='--xx']")` → `setOnHover(id)`
2. `useHoverEffects` reage via `useEffect(onHover)`:
   - Hovered → `brightness(1)` / `grayscale(0)`
   - Irmãos → `brightness(0.3)` / `grayscale(1)`
3. `onMouseLeave` → `setOnHover(null)` → restaura estado padrão do nível

### 4. Drill-Up (clique no vazio)
1. `handleClick` não encontra `<g>` semântico via `closest()`
2. Consulta `historyLevelRef[currentLevel - 1]` para o elemento anterior
3. `changeLevelTo(previousElement, true)` → zoom out animado
4. Se já está no root (nível 0): `onClose()` → `page.tsx` limpa tudo

## Mapeamento de Tipos

O navigator usa `HierarchyItem` (tipos internos). A UI (breadcrumb, SidePanel) usa `BreadcrumbItem` (tipos globais da app). O `page.tsx` contém a ponte:

| `HierarchyItem.level`   | → `BreadcrumbItem.levelName`  |
|--------------------------|-------------------------------|
| `"Production System"`   | `"production system"`         |
| `"Life Fate"`           | `"life-fate"`                 |
| `"Phase"`               | `"phase"`                     |
| `"Circumstance"`        | `"circumstance"`              |

## Ficheiros Alterados/Criados na Etapa 5

| Ficheiro | Ação | Descrição |
|---|---|---|
| `navigator/useSvgNavigatorLogic.ts` | **Criado** | Hook orquestrador central |
| `navigator/index.ts` | **Atualizado** | Exporta o orquestrador |
| `ProcessogramViewer.tsx` | **Atualizado** | Aceita `onMouseMove`/`onMouseLeave` |
| `page.tsx` | **Atualizado** | Usa `useSvgNavigatorLogic` em vez de `useProcessogramState` |
| `docs/frontend/svg_navigation_orchestrator.md` | **Criado** | Esta documentação |

## Próximos Passos

1. **Testar no browser**: verificar se clique → drill-down anima o viewBox
2. **Deletar System A**: remover `useProcessogramState.ts` e `ProcessogramInteractiveLayer.tsx`
3. **Implementar drill-up via breadcrumb**: atualmente o breadcrumb apenas limpa a seleção; implementar navegação programática via EventBus
4. **Verificar Correção 1**: garantir que `overflow-hidden` está no `div.flex-1` do page.tsx (necessário para centralizar o SVG)
