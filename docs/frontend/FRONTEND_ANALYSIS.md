# WelfareData — Análise Completa do Frontend

> **Data:** 2026-04-08
> **Foco:** Integração do novo motor Canvas 2D
> **Status:** Análise read-only — nenhum arquivo foi alterado

---

## Índice

1. [Estrutura Completa do Frontend (`src/`)](#1-estrutura-completa-do-frontend-src)
2. [Componente Raiz do Viewer](#2-componente-raiz-do-viewer)
3. [Hooks do SVG / Navegação](#3-hooks-do-svg--navegação)
4. [Componentes da Página do Viewer](#4-componentes-da-página-do-viewer)
5. [Dados e Estado](#5-dados-e-estado)
6. [Endpoints Consumidos pelo Viewer](#6-endpoints-consumidos-pelo-viewer)
7. [Stores Zustand](#7-stores-zustand)
8. [Dependências a Remover — react-inlinesvg](#8-dependências-a-remover--react-inlinesvg)
9. [Dependências a Remover — GSAP](#9-dependências-a-remover--gsap)
10. [Análise: usePrefetchRaster](#10-análise-useprefetchraster)
11. [Análise: useOptimizeSvgParts](#11-análise-useoptimizesvgparts)
12. [Análise: useClickHandler](#12-análise-useclickhandler)
13. [Análise: useHoverEffects](#13-análise-usehovereffects)
14. [SidePanel — Elemento Focado](#14-sidepanel--elemento-focado)
15. [ChatWidget — Dependência do elementId](#15-chatwidget--dependência-do-elementid)
16. [Breadcrumb — Nível e Histórico](#16-breadcrumb--nível-e-histórico)
17. [Autenticação e Rotas](#17-autenticação-e-rotas)
18. [URL Completa do Viewer](#18-url-completa-do-viewer)
19. [Diagrama da Árvore de Componentes](#19-diagrama-da-árvore-de-componentes)
20. [Funcionamento Completo do Frontend e Ligação com o Backend](#20-funcionamento-completo-do-frontend-e-ligação-com-o-backend)

---

## 1. Estrutura Completa do Frontend (`src/`)

```
frontend/src/
├── middleware.ts                        # Next.js edge middleware (auth guard)
├── app/
│   ├── globals.css                      # Tailwind CSS global
│   ├── layout.tsx                       # RootLayout (AppProviders, fonts)
│   ├── page.tsx                         # "/" → redirect para /admin
│   ├── login/
│   │   └── page.tsx                     # Página de login
│   ├── admin/
│   │   ├── page.tsx                     # Dashboard admin
│   │   ├── species/
│   │   │   └── page.tsx                 # CRUD de espécies
│   │   ├── modules/
│   │   │   └── page.tsx                 # CRUD de módulos de produção
│   │   └── processograms/
│   │       └── page.tsx                 # CRUD + upload de processogramas
│   └── view/
│       └── [id]/
│           └── page.tsx                 # ★ VIEWER PÚBLICO do processograma
├── components/
│   ├── auth/
│   │   └── LoginForm.tsx                # Formulário de login
│   ├── chat/
│   │   ├── ChatWidget.tsx               # Chat IA contextual (streaming SSE)
│   │   └── SuggestedQuestions.tsx        # Chips de sugestões de perguntas
│   ├── dashboard/
│   │   ├── ProcessogramCard.tsx          # Card de processograma na listagem
│   │   └── UploadZone.tsx               # Dropzone para upload SVG
│   ├── layout/
│   │   ├── index.ts                     # Barrel exports
│   │   ├── AppHeader.tsx                # Header do dashboard admin
│   │   ├── AppSidebar.tsx               # Sidebar navegável do admin
│   │   ├── DashboardLayout.tsx          # Shell do layout admin (sidebar + header + main)
│   │   └── nav-config.ts               # Configuração de itens de navegação
│   ├── processogram/
│   │   ├── ProcessogramViewer.tsx        # ★ Shell SVG inline (react-inlinesvg)
│   │   ├── ProcessogramBreadcrumb.tsx    # ★ Breadcrumb hierárquico do viewer
│   │   ├── SidePanel.tsx                # ★ Painel lateral (dados + chat)
│   │   └── navigator/
│   │       ├── index.ts                 # Barrel exports do módulo navigator
│   │       ├── types.ts                 # Tipagens centrais (HierarchyItem, HistoryLevel, etc.)
│   │       ├── consts.ts                # Constantes (duração, opacidades, dicionário de níveis)
│   │       ├── hierarchy.ts             # Resolver de hierarquia DOM (closest → breadcrumb)
│   │       ├── extractInfoFromId.ts     # Parser de IDs semânticos SVG
│   │       ├── getElementViewBox.ts     # Motor de câmera (cálculo de viewBox)
│   │       ├── useSvgNavigatorLogic.ts  # ★ ORQUESTRADOR central — compõe os 5 hooks
│   │       └── hooks/
│   │           ├── useNavigator.ts      # Motor de câmera (viewBox + isolamento visual + GSAP)
│   │           ├── useClickHandler.ts   # Interceptação de cliques (drill-down / drill-up)
│   │           ├── useHoverEffects.ts   # Hover via Event Delegation nativa (zero re-renders)
│   │           ├── useOptimizeSvgParts.ts # LOD swap: <g> → <image> PNG (Otimização Nível 2)
│   │           └── usePrefetchRaster.ts # Prefetch silencioso de PNGs para RAM
│   └── ui/                              # shadcn/ui primitives
│       ├── alert-dialog.tsx
│       ├── avatar.tsx
│       ├── badge.tsx
│       ├── breadcrumb.tsx
│       ├── button.tsx
│       ├── card.tsx
│       ├── dialog.tsx
│       ├── dropdown-menu.tsx
│       ├── input.tsx
│       ├── label.tsx
│       ├── progress.tsx
│       ├── scroll-area.tsx
│       ├── separator.tsx
│       ├── sheet.tsx
│       ├── sonner.tsx
│       ├── table.tsx
│       └── tooltip.tsx
├── hooks/
│   ├── useModules.ts                    # TanStack Query: CRUD de módulos
│   ├── useProcessograms.ts              # TanStack Query: CRUD de processogramas
│   └── useSpecies.ts                    # TanStack Query: CRUD de espécies
├── lib/
│   ├── api.ts                           # Instância Axios (baseURL: /api/v1)
│   └── utils.ts                         # Helper cn() (clsx + tailwind-merge)
├── providers/
│   └── AppProviders.tsx                 # QueryClient + ThemeProvider + AuthHydrator + Toaster
├── services/
│   ├── modules.ts                       # Service layer: production-modules
│   ├── processograms.ts                 # Service layer: processograms
│   └── species.ts                       # Service layer: species
├── store/
│   └── authStore.ts                     # Zustand: estado de autenticação
└── types/
    ├── index.ts                         # Barrel re-exports
    ├── auth.ts                          # User, LoginCredentials, LoginResponse
    ├── processogram.ts                  # Processogram, RasterImage, BreadcrumbItem, ActiveElementData
    ├── specie.ts                        # Specie
    └── productionModule.ts              # ProductionModule
```

---

## 2. Componente Raiz do Viewer

| Item | Valor |
|------|-------|
| **Arquivo** | `frontend/src/app/view/[id]/page.tsx` |
| **Path completo** | `d:\Welfare-Walfaredata\WelfareData_New\frontend\src\app\view\[id]\page.tsx` |
| **Export** | `export default function PublicViewPage()` |
| **Tipo de rota** | Next.js App Router — rota dinâmica com parâmetro `[id]` |

Este é um **Client Component** (`"use client"`) que orquestra toda a UI do viewer. Ele:
1. Extrai o `id` via `useParams<{ id: string }>()`
2. Busca o processograma e monta a URL do SVG
3. Inicializa o `useSvgNavigatorLogic` (System B)
4. Renderiza `ProcessogramBreadcrumb`, `ProcessogramViewer` e `SidePanel`
5. Gerencia estado React derivado do navigator (breadcrumb, selectedElementId, activeElementData)

---

## 3. Hooks do SVG / Navegação

### 3.1 `useSvgNavigatorLogic` — Orquestrador Central

| Item | Valor |
|------|-------|
| **Arquivo** | `frontend/src/components/processogram/navigator/useSvgNavigatorLogic.ts` |
| **Responsabilidade** | Hook de fachada que compõe os 5 hooks internos: `useNavigator`, `useClickHandler`, `useHoverEffects`, `useOptimizeSvgParts`, `usePrefetchRaster` |

**Props recebidas:**
- `currentTheme: "dark" | "light"` — propagado para isolamento visual
- `onChange(identifier, hierarchy)` — callback a cada mudança de nível (atualiza breadcrumb/SidePanel)
- `onClose()` — callback quando o user faz drill-up além do root
- `rasterImages` — metadados de PNG para LOD swap

**Retorna:**
- `updateSvgElement(svgEl)` — registra o `<svg>` DOM injetado pelo react-inlinesvg
- `navigateToLevel(levelIndex)` — navegação programática (breadcrumb/Home)

**Refs mutáveis internas:**
- `historyLevelRef` — histórico de navegação: nível → último ID visitado
- `currentLevelRef` — nível numérico atual (0–3)
- `currentElementIdRef` — ID do elemento enquadrado
- `lockInteractionRef` — trava durante animações
- `originalViewBoxRef` — viewBox original para referência estável
- `clearHoverRef` — função de limpeza de hover

**Ordem de composição dos hooks:**
1. `usePrefetchRaster(rasterImages)` → `imageCache`
2. `useOptimizeSvgParts({svgElement, rasterImages, imageCache})` → `optimizeLevelElements`, `restoreAllRasterized`
3. `useNavigator({..., optimizeLevelElements, restoreAllRasterized, clearHover})` → `changeLevelTo`
4. `useClickHandler({..., changeLevelTo})` → `handleClick`
5. `useHoverEffects({..., clearHoverRef})` → void (registra listeners DOM)

Também registra o click listener global no `window` (não no SVG).

---

### 3.2 `useNavigator` — Motor de Câmera

| Item | Valor |
|------|-------|
| **Arquivo** | `frontend/src/components/processogram/navigator/hooks/useNavigator.ts` |
| **Responsabilidade** | Anima o `viewBox` do SVG via GSAP para enquadrar o elemento alvo, aplica isolamento visual (opacity) nos elementos fora de foco |

**Pipeline do `changeLevelTo(target, toPrevious, callback?)`:**
1. Limpa hover residual (`clearHover`)
2. Restaura rasterizações anteriores (`restoreAllRasterized`)
3. Calcula viewBox destino via `getElementViewBox(target, originalViewBox)`
4. Salva no histórico (`historyLevelRef[level] = { id }`)
5. Seleciona elementos fora de foco com `querySelectorAll` + filtros
6. Blindagem de eventos: `lockInteraction = true`, `pointerEvents: "none"`, `killTweensOf`
7. Aplica `gsap.set` de opacidade reduzida nos elementos fora de foco (INSTANTÂNEO — não animado)
8. Notifica mudança via `onChange(identifier, hierarchy)`
9. Agenda rasterização dos out-of-focus (`optimizeLevelElements`)
10. Anima viewBox com `gsap.to(svgElement, { attr: { viewBox } })` com `ANIMATION_DURATION: 0.7s`
11. No `onComplete`: restaura `pointerEvents`, restaura brilho, desbloqueia interação

---

### 3.3 `useClickHandler` — Interceptação de Cliques

| Item | Valor |
|------|-------|
| **Arquivo** | `frontend/src/components/processogram/navigator/hooks/useClickHandler.ts` |
| **Responsabilidade** | Intercepta cliques globais (no `window`) e decide entre drill-down, drill-up ou close |

**Detalhes completos na [Seção 12](#12-análise-useclickhandler).**

---

### 3.4 `useHoverEffects` — Hover via Event Delegation

| Item | Valor |
|------|-------|
| **Arquivo** | `frontend/src/components/processogram/navigator/hooks/useHoverEffects.ts` |
| **Responsabilidade** | Motor de hover de zero re-renders — usa Event Delegation nativa no `<svg>` |

**Detalhes completos na [Seção 13](#13-análise-usehovereffects).**

---

### 3.5 `useOptimizeSvgParts` — LOD Swap O(1)

| Item | Valor |
|------|-------|
| **Arquivo** | `frontend/src/components/processogram/navigator/hooks/useOptimizeSvgParts.ts` |
| **Responsabilidade** | Substitui `<g>` SVG complexos por `<image>` PNG pré-renderizados pelo backend |

**Detalhes completos na [Seção 11](#11-análise-useoptimizesvgparts).**

---

### 3.6 `usePrefetchRaster` — Prefetch de PNGs

| Item | Valor |
|------|-------|
| **Arquivo** | `frontend/src/components/processogram/navigator/hooks/usePrefetchRaster.ts` |
| **Responsabilidade** | Download silencioso das imagens PNG para a RAM do browser na montagem |

**Detalhes completos na [Seção 10](#10-análise-useprefetchraster).**

---

### 3.7 Outros módulos do navigator (não são hooks)

| Módulo | Arquivo | Responsabilidade |
|--------|---------|------------------|
| `hierarchy.ts` | `navigator/hierarchy.ts` | `getHierarchy(element)` — sobe na árvore DOM via `closest()` para montar o breadcrumb |
| `extractInfoFromId.ts` | `navigator/extractInfoFromId.ts` | Parser de IDs semânticos SVG (`broiler--ps` → nível 0, nome "broiler") |
| `getElementViewBox.ts` | `navigator/getElementViewBox.ts` | Cálculo do viewBox ideal para enquadrar um elemento (BBox transformada + zoom floor + padding + aspect ratio) |
| `consts.ts` | `navigator/consts.ts` | Constantes: `ANIMATION_DURATION`, `LEVELS_DICT`, `INVERSE_DICT`, opacidades |
| `types.ts` | `navigator/types.ts` | Todas as interfaces: `HierarchyItem`, `HistoryLevel`, `LevelAlias`, `ParsedElementId` |

---

## 4. Componentes da Página do Viewer

| Componente | Arquivo | Função |
|------------|---------|--------|
| **PublicViewPage** | `app/view/[id]/page.tsx` | Componente raiz — orquestra fetching, estado e composição |
| **ProcessogramViewer** | `components/processogram/ProcessogramViewer.tsx` | Shell `<SVG>` via react-inlinesvg, sanitização, callback `onSvgReady` |
| **ProcessogramBreadcrumb** | `components/processogram/ProcessogramBreadcrumb.tsx` | Navegação hierárquica visual com níveis coloridos (SYS/LF/PH/CI) |
| **SidePanel** | `components/processogram/SidePanel.tsx` | Painel lateral com dados do elemento selecionado + ChatWidget |
| **ChatWidget** | `components/chat/ChatWidget.tsx` | Chat IA com streaming SSE, integrado ao SidePanel |
| **SuggestedQuestions** | `components/chat/SuggestedQuestions.tsx` | Chips de perguntas sugeridas por elemento |

**Controles de zoom:** Não existem controles de zoom explícitos (botões +/-). O zoom é feito implicitamente pelo sistema de drill-down/drill-up via viewBox.

**Overlay de loading:** Implementado inline no `PublicViewPage` com `<Loader2>` (ícone animado) durante `state.status === "loading"`.

**Overlay de erro:** Implementado inline com `<AlertTriangle>` durante `state.status === "error"`.

**Header:** Implementado inline no `PublicViewPage` com logo WelfareData + nome do processograma + botão de login.

---

## 5. Dados e Estado

### 5.1 Como o viewer recebe os dados do processograma

O viewer **NÃO usa TanStack Query nem Zustand para dados do processograma.** A obtenção de dados é feita por **fetch direto** no `useEffect` do `PublicViewPage`:

```
useEffect → fetchProcessogram()
  ├─ api.get<Processogram>(`/processograms/${params.id}`)    ← Axios
  ├─ svgUrl = `/api/v1/processograms/${params.id}/svg?theme=${theme}`
  └─ processogramService.getElementData(params.id)           ← Axios
```

**Fluxo:**
1. `Processogram` (metadados) → via `api.get` (Axios com baseURL `/api/v1`)
2. SVG string → via URL direta passada ao `react-inlinesvg` que faz o próprio fetch
3. `ProcessogramElement[]` (descrições) → via `processogramService.getElementData` (Axios)
4. `raster_images_light` / `raster_images_dark` → embutidos na resposta do `Processogram`

**Estado local no `PublicViewPage`:**
- `state: ViewState` — `{ status: "loading" | "ready" | "error", processogram?, svgUrl?, message? }`
- `elements: ProcessogramElement[]` — descrições dos elementos
- `selectedElementId: string | null` — ID do elemento focado
- `breadcrumbPath: BreadcrumbItem[]` — caminho de breadcrumb
- `activeLevelIndex: number` — nível ativo (0–3, -1 = nenhum)
- `activeElementData: ActiveElementData | null` — dados para o SidePanel

### 5.2 De onde vem cada tipo de dado?

| Dado | Origem | Método |
|------|--------|--------|
| Metadados do processograma | API `GET /processograms/:id` | Axios (`api.get`) direto no `useEffect` |
| SVG markup | API `GET /processograms/:id/svg?theme=...` | `react-inlinesvg` faz fetch da URL |
| Descrições dos elementos | API `GET /processograms/:id/data/public` | `processogramService.getElementData` |
| Perguntas sugeridas | API `GET /processograms/:id/questions/public` | `fetch()` nativo dentro do `SidePanel` |
| Raster images (PNG metadata) | Campo `raster_images_light`/`raster_images_dark` do `Processogram` | Embutido na resposta da API |
| Autenticação | Zustand `authStore` | `useAuthStore` (estado global) |

---

## 6. Endpoints Consumidos pelo Viewer

### 6.1 Endpoints consumidos diretamente pela página do viewer

| Método | URL | Origem no código | Público? |
|--------|-----|-------------------|----------|
| `GET` | `/api/v1/processograms/:id` | `page.tsx` → `api.get<Processogram>(...)` | **Sim** |
| `GET` | `/api/v1/processograms/:id/svg?theme={light\|dark}` | `page.tsx` → URL para `react-inlinesvg` | **Sim** |
| `GET` | `/api/v1/processograms/:id/data/public` | `page.tsx` → `processogramService.getElementData(id)` | **Sim** |
| `GET` | `/api/v1/processograms/:processogramId/data/public` | `SidePanel.tsx` → `fetch()` nativo | **Sim** |
| `GET` | `/api/v1/processograms/:processogramId/questions/public` | `SidePanel.tsx` → `fetch()` nativo | **Sim** |
| `POST` | `/api/v1/processograms/:processogramId/chat/stream` | `ChatWidget.tsx` → `fetch()` nativo (SSE) | **Sim** |

### 6.2 Endpoints consumidos pelo restante do frontend (admin)

| Método | URL | Serviço/Hook |
|--------|-----|-------------|
| `POST` | `/api/v1/auth/login` | `authStore.login` |
| `POST` | `/api/v1/auth/logout` | `authStore.logout` |
| `GET` | `/api/v1/auth/me` | `authStore.hydrate` |
| `GET` | `/api/v1/species` | `specieService.getAll` / `useSpecies` |
| `POST` | `/api/v1/species` | `specieService.create` / `useCreateSpecie` |
| `DELETE` | `/api/v1/species/:id` | `specieService.remove` / `useDeleteSpecie` |
| `GET` | `/api/v1/production-modules` | `moduleService.getAll` / `useModules` |
| `POST` | `/api/v1/production-modules` | `moduleService.create` / `useCreateModule` |
| `DELETE` | `/api/v1/production-modules/:id` | `moduleService.remove` / `useDeleteModule` |
| `GET` | `/api/v1/processograms` | `processogramService.getAll` / `useProcessograms` |
| `POST` | `/api/v1/processograms` | `processogramService.upload` / `useUploadProcessogram` |
| `DELETE` | `/api/v1/processograms/:id` | `processogramService.remove` / `useDeleteProcessogram` |

---

## 7. Stores Zustand

### 7.1 `authStore` (único store)

**Arquivo:** `frontend/src/store/authStore.ts`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `user` | `User \| null` | Dados do usuário logado |
| `isAuthenticated` | `boolean` | Flag de autenticação |
| `isLoading` | `boolean` | Indica se hydrate está em andamento |

| Action | O que faz |
|--------|-----------|
| `login(credentials)` | `POST /auth/login` → atualiza `user` e `isAuthenticated` |
| `logout()` | `POST /auth/logout` → limpa estado + redirect para `/login` |
| `hydrate()` | `GET /auth/me` → verifica token existente (cookie) |

**Relação com o viewer:** O viewer lê apenas `isAuthenticated` para decidir se mostra o botão "Login" no header. O viewer funciona normalmente sem autenticação.

**NÃO há stores Zustand específicas para o viewer/navigator.** Todo o estado da navegação SVG vive em `useRef` (mutáveis) e `useState` (local) dentro do `useSvgNavigatorLogic` e `PublicViewPage`.

---

## 8. Dependências a Remover — react-inlinesvg

### 8.1 Onde é importado

| Arquivo | Importação | Uso |
|---------|-----------|-----|
| `components/processogram/ProcessogramViewer.tsx` | `import SVG from "react-inlinesvg"` | **Único local de uso real** |

### 8.2 Como é usado

```tsx
<SVG
  src={svgUrl}                    // URL do endpoint GET /processograms/:id/svg
  innerRef={handleSvgRef}         // Callback que recebe o <svg> DOM real
  className="size-full"
  title="Processogram SVG"
/>
```

O `react-inlinesvg`:
1. Faz fetch da URL (`svgUrl`)
2. Parseia o SVG string
3. Injeta como DOM real (não `dangerouslySetInnerHTML`)
4. Chama `innerRef` com o `<SVGElement>` real

O callback `handleSvgRef`:
1. Recebe o `<SVGElement>`
2. Sanitiza: garante `viewBox`, substitui `width`/`height` fixos por `100%`, define `preserveAspectRatio`
3. Chama `onSvgReady(svgEl)` → que é `updateSvgElement` do orquestrador

### 8.3 Impacto para o Canvas 2D

Para substituir por Canvas 2D, é necessário:
- Remover o `react-inlinesvg`
- O `ProcessogramViewer` passa a renderizar um `<canvas>` em vez de `<SVG>`
- Todo o sistema de `sanitizeSvgElement` fica obsoleto
- A rotina de `onSvgReady` que alimenta o orquestrador precisa de uma nova interface
- O `navigateToLevel` e `changeLevelTo` que dependem de `svgElement.querySelector` e `closest()` precisam de reimplementação

### 8.4 Versão no `package.json`

```json
"react-inlinesvg": "^4.2.0"
```

---

## 9. Dependências a Remover — GSAP

### 9.1 Arquivos que importam GSAP

| Arquivo | Importação | O que faz com o GSAP |
|---------|-----------|---------------------|
| `navigator/useSvgNavigatorLogic.ts` | `import { gsap } from "gsap"` | `gsap.to()` para animar viewBox de volta ao original no reset; `gsap.set()` para restaurar opacidade; `gsap.killTweensOf()` para limpar tweens antes de transições |
| `navigator/hooks/useNavigator.ts` | `import { gsap } from "gsap"` | **Principal consumidor.** `gsap.to(svgElement, { attr: { viewBox } })` para animar a câmera; `gsap.set()` para isolamento visual instantâneo (opacity); `gsap.killTweensOf()` para blindagem de eventos; `.revert()` na animação de out-of-focus |
| `navigator/hooks/useHoverEffects.ts` | `import { gsap } from "gsap"` | `gsap.to()` para animar opacity no hover; `gsap.set()` para restauro instantâneo no `clearHover()` |

### 9.2 Resumo de funcionalidades GSAP usadas

| Funcionalidade | Arquivos | Descrição |
|----------------|----------|-----------|
| `gsap.to(svgElement, { attr: { viewBox } })` | `useNavigator.ts`, `useSvgNavigatorLogic.ts` | **Animação da câmera** — interpola o atributo viewBox do SVG |
| `gsap.set(elements, { opacity })` | `useNavigator.ts`, `useHoverEffects.ts`, `useSvgNavigatorLogic.ts` | **Isolamento visual** — aplica opacity instantânea (sem animação) |
| `gsap.to(elements, { opacity })` | `useNavigator.ts`, `useHoverEffects.ts`, `useSvgNavigatorLogic.ts` | **Transição de opacity** — animação suave de brilho/fade |
| `gsap.killTweensOf(elements)` | `useNavigator.ts`, `useSvgNavigatorLogic.ts` | **Blindagem** — cancela animações em curso para evitar conflitos |
| `tween.revert()` | `useNavigator.ts` | **Limpeza** — reverte animação de out-of-focus antes de nova transição |
| `gsap.set(svgElement, { pointerEvents })` | `useNavigator.ts`, `useSvgNavigatorLogic.ts` | **Blindagem de eventos DOM** — desativa/ativa interação durante animações |

### 9.3 Versão no `package.json`

```json
"gsap": "^3.12.7"
```

---

## 10. Análise: usePrefetchRaster

**Arquivo:** `frontend/src/components/processogram/navigator/hooks/usePrefetchRaster.ts`

### O que faz

Realiza o **download silencioso** das imagens PNG pré-renderizadas pelo backend para a RAM do browser no momento da montagem do componente.

### Pipeline

1. Recebe `rasterImages: Record<string, RasterImage> | undefined` como prop
2. Para cada `[id, data]` em `rasterImages`:
   - Cria `const img = new Image()`
   - `img.crossOrigin = "anonymous"`
   - `img.src = data.src` → inicia download HTTP
   - `img.decode()` → aguarda descodificação GPU
   - Na resolução: `imageCache.current.set(id, img)`
3. Retorna `imageCache: RefObject<Map<string, HTMLImageElement>>`

### Dependências e parâmetros

| Parâmetro | Tipo | Origem |
|-----------|------|--------|
| `rasterImages` | `Record<string, RasterImage> \| undefined` | `processogram.raster_images_dark` ou `raster_images_light` (selecionado pelo tema) |

| Dependência | Descrição |
|-------------|-----------|
| `RasterImage.src` | URL da imagem PNG no GCS |
| `img.decode()` | API nativa do browser |

### Segurança

- Flag `aborted` previne callbacks stale após cleanup
- Cleanup: `img.src = ""` cancela downloads pendentes
- Cache limpo ao mudar de processograma ou tema
- Falha silenciosa: se `decode()` falha, o id não é guardado no cache

### Retorno

```ts
{ imageCache: RefObject<Map<string, HTMLImageElement>> }
```

Consumido pelo `useOptimizeSvgParts` como sinal de readiness.

---

## 11. Análise: useOptimizeSvgParts

**Arquivo:** `frontend/src/components/processogram/navigator/hooks/useOptimizeSvgParts.ts`

### O que faz

Substitui grupos SVG complexos (`<g>`) por imagens PNG pré-renderizadas quando fora de foco, e restaura quando necessário.

### LOD Swap — Detecção de drill-down e troca

**Detecção:** O hook NÃO detecta drill-down por si. Quem detecta é o `useNavigator`, que chama `optimizeLevelElements(currentElement, outOfFocusElements)` após calcular quais elementos estão fora de foco.

**Troca (Swap O(1)):**

```
rasterizeElement(element):
  1. Guard: já rasterizado? → skip
  2. Guard: rasterImages tem coordenadas para este id? → skip se não
  3. Guard: imageCache tem a imagem decoded? → skip se não (graceful)
  4. Criar <image> SVG com: href=data.src, x, y, width, height (do backend)
  5. Copiar filtro inline (opacity/brightness) do <g> original
  6. element.style.display = "none"  ← oculta o <g>
  7. insertBefore(<image>, element.nextSibling) ← insere como sibling
```

**Estratégia DOM:**
- O `<g>` NÃO é removido — é ocultado com `display:none`
- O `<image data-rasterized-for="id">` é inserido como sibling
- Preserva referências GSAP e permite restauro atómico

**Async Batching (Time-Slicing via rAF):**
- O swap é dividido em chunks de `CHUNK_SIZE = 400` elementos
- Cada chunk processado num `requestAnimationFrame` separado
- Epoch counter previne race conditions entre navegações

### Restauração

```ts
restoreAllRasterized():
  1. Restaura z-order do elemento elevado (que foi movido para o fim do parent)
  2. Para cada id rasterizado:
     - element.style.display = ""  ← restaura visibilidade do <g>
     - remove <image data-rasterized-for> do DOM
  3. Remove <image> órfãos (segurança extra)
  4. Limpa o Set de IDs
```

### Dependências

| Parâmetro | Tipo | Origem |
|-----------|------|--------|
| `svgElement` | `SVGElement \| null` | Do estado local do orquestrador |
| `rasterImages` | `Record<string, RasterImage> \| undefined` | Da API (metadados) |
| `imageCache` | `RefObject<Map<string, HTMLImageElement>>` | De `usePrefetchRaster` |

### Retorno

```ts
{
  optimizeLevelElements: (currentElement, outOfFocusElements) => void,
  restoreAllRasterized: () => void
}
```

---

## 12. Análise: useClickHandler

**Arquivo:** `frontend/src/components/processogram/navigator/hooks/useClickHandler.ts`

### Como usa `closest()` para hit-testing

O `getClickedStage(target, level)`:

```ts
const nextLevelSuffix = INVERSE_DICT[level + 1];
// Ex: se currentLevel=0, nextLevelSuffix="--lf"

return target.closest<SVGElement>(`[id*="${nextLevelSuffix}" i]`);
// Ex: seletor = [id*="--lf" i]
```

### Seletor exato usado

O seletor CSS é **dinâmico**, baseado no nível atual:

| Nível atual | `INVERSE_DICT[level + 1]` | Seletor CSS |
|-------------|---------------------------|-------------|
| 0 (root) | `"--lf"` | `[id*="--lf" i]` |
| 1 (Life Fate) | `"--ph"` | `[id*="--ph" i]` |
| 2 (Phase) | `"--ci"` | `[id*="--ci" i]` |
| 3 (Circumstance) | `undefined` | **null** (nível folha, sem drill-down) |

O `i` no seletor torna a busca case-insensitive.

### Fluxo de decisão do `handleClick`

```
Clique no window
  ├─ lockInteraction? → ignora
  ├─ target fora do SVG? → ignora
  ├─ stopPropagation()
  ├─ getClickedStage(target, currentLevel)
  │   ├─ Achou grupo semântico ≠ elemento focado? → DRILL-DOWN
  │   │   └─ changeLevelTo(clickedStage, false)
  │   └─ Não achou? → DRILL-UP
  │       ├─ prevLevel < 0? → onClose() (fechar)
  │       ├─ prevLevel < 1? → changeLevelTo(svgElement, true) (root)
  │       └─ prevLevel >= 1? → historyLevel[prevLevel] → changeLevelTo(element, true)
  └─ Fallback: changeLevelTo(svgElement, true) se elemento não encontrado
```

### Listener global

O listener é registrado no `window` (não no SVG) porque eventos de clique em `<text>`, `<path>` e `<tspan>` dentro do SVG não propagam de forma confiável para o `<svg>`.

---

## 13. Análise: useHoverEffects

**Arquivo:** `frontend/src/components/processogram/navigator/hooks/useHoverEffects.ts`

### Como aplica opacity via DOM

O hook registra **dois listeners DOM nativos** diretamente no `<svg>`:

1. **`mousemove`**: resolve o grupo sob o cursor via `closest(nextLevelKey)`
2. **`mouseleave`**: restaura estado visual de navegação

### Fluxo do `mousemove`:

```
mousemove no <svg>
  ├─ lockInteraction? → return
  ├─ nextLevelKey = INVERSE_DICT[currentLevel + 1]
  │   (se undefined → nível folha, return)
  ├─ target.closest(`[id*="${nextLevelKey}" i]`)
  │   ├─ null → clearHover() + return
  │   ├─ id === currentElementId → return (não hover no focado)
  │   ├─ id === hoveredElementId → return (spam prevention)
  │   └─ NOVO GRUPO:
  │       ├─ hoveredElementId.current = group.id
  │       ├─ gsap.to(group, { opacity: FOCUSED_OPACITY })        ← destaque
  │       └─ gsap.to(siblings, { opacity: UNFOCUSED_OPACITY })    ← reduz irmãos
  └─ (tudo via refs — zero re-renders React)
```

### Fluxo do `clearHover`:

```
clearHover()
  ├─ Guard: hoveredElementId === null? → return
  ├─ Elemento que estava hovered → gsap.set(opacity: UNFOCUSED)
  ├─ Siblings do nível → gsap.to(opacity: UNFOCUSED, duration: half)
  └─ Elemento focado + filhos do próximo nível → gsap.to(opacity: FOCUSED)
```

### Performance

- **Zero re-renders React** — tudo via `useRef` e manipulação DOM direta
- Duração das animações: `ANIMATION_DURATION / 2` (metade da transição de câmera)
- O tema é lido via `themeRef` para evitar re-registar listeners a cada troca

---

## 14. SidePanel — Elemento Focado

**Arquivo:** `frontend/src/components/processogram/SidePanel.tsx`

### Como o SidePanel sabe qual elemento está focado

Via **props** passadas pelo `PublicViewPage`:

```tsx
<SidePanel
  processogramId={params.id!}
  selectedElementId={selectedElementId}   // ← vem do useState no page.tsx
  onClose={clearSelection}
  activeElementData={activeElementData}   // ← montado no handleNavigatorChange
  breadcrumbPath={breadcrumbPath}         // ← atualizado pelo navigator
  onBreadcrumbClick={navigateUp}
/>
```

**Cadeia de dados:**
1. `useSvgNavigatorLogic` chama `onChange(identifier, hierarchy)` a cada mudança de nível
2. `handleNavigatorChange` (no page.tsx) mapeia `HierarchyItem[]` → `BreadcrumbItem[]`
3. Atualiza `selectedElementId`, `breadcrumbPath`, `activeLevelIndex` e `activeElementData` via `setState`
4. SidePanel recebe tudo via props

**Nota:** `activeElementData` e `breadcrumbPath` são recebidos como props mas estão marcados como `@typescript-eslint/no-unused-vars` — o SidePanel atualmente não os utiliza diretamente para renderização. A descrição do elemento é buscada via fetch próprio.

---

## 15. ChatWidget — Dependência do elementId

**Arquivo:** `frontend/src/components/chat/ChatWidget.tsx`

### Como recebe o elementId

Via prop `elementContext`:

```tsx
<ChatWidget
  processogramId={processogramId}
  elementContext={selectedElementId}       // ← string | undefined
  suggestedQuestions={suggestedQuestions}
/>
```

### Como usa o elementId

1. **Foco no input** ao mudar de elemento:
   ```tsx
   useEffect(() => {
     inputRef.current?.focus();
   }, [elementContext]);
   ```

2. **Prefixo contextual nas mensagens enviadas:**
   ```tsx
   const fullMessage = elementContext
     ? `[Contexto: Elemento selecionado "${elementContext}"]\n\n${trimmed}`
     : trimmed;
   ```

3. O `elementContext` é injetado como **prefixo da mensagem** no body do POST para `/chat/stream`, não como parâmetro separado.

---

## 16. Breadcrumb — Nível e Histórico

**Arquivo:** `frontend/src/components/processogram/ProcessogramBreadcrumb.tsx`

### Como sabe o nível atual e o histórico

Via **props** passadas pelo `PublicViewPage`:

```tsx
<ProcessogramBreadcrumb
  breadcrumbPath={breadcrumbPath}          // ← BreadcrumbItem[]
  activeLevelIndex={activeLevelIndex}      // ← número 0–3
  onNavigate={navigateUp}                  // ← callback para drill-up
  onReset={clearSelection}                 // ← callback para voltar à visão global
/>
```

**`breadcrumbPath`** é um array de `BreadcrumbItem`, onde cada item contém:
- `id` — rawId do elemento SVG (ex: `"growing--lf1"`)
- `label` — nome legível (ex: `"Growing"`)
- `levelName` — tipo do nível (`"production system"`, `"life-fate"`, `"phase"`, `"circumstance"`)

**`activeLevelIndex`** indica qual item do breadcrumb está ativo (faded vs. highlighted). Itens anteriores (isPast) são clicáveis para drill-up. Itens futuros (isFuture) são desabilitados.

**Exibição visual:** Cada item mostra uma abreviação colorida do nível (SYS, LF, PH, CI) com cores distintas:
- `"production system"` → SYS → sky-400
- `"life-fate"` → LF → amber-400
- `"phase"` → PH → emerald-400
- `"circumstance"` → CI → rose-400

---

## 17. Autenticação e Rotas

### A página do viewer exige autenticação?

**NÃO.** A página `/view/[id]` é **pública**.

Evidências:
1. **Middleware Next.js** (`middleware.ts`): `/view` está em `PUBLIC_PREFIXES` → `isProtected()` retorna `false`
2. **Interceptor Axios** (`api.ts`): `/view` está em `PUBLIC_PATHS` → 401 não redireciona para login
3. **Endpoints backend**: `GET /processograms/:id`, `GET /processograms/:id/svg`, `GET /processograms/:id/data/public`, `GET /processograms/:id/questions/public` e `POST /processograms/:id/chat/stream` são todos **públicos** (sem auth middleware)

**Rotas protegidas (requerem autenticação):**
- `/admin/**` → middleware Next.js redireciona para `/login?redirect=...` se não há cookie `token`
- Endpoints de CRUD (POST/PUT/DELETE em species, modules, processograms) → backend requer auth + role admin

---

## 18. URL Completa do Viewer

| Item | Valor |
|------|-------|
| **URL** | `/view/{id}` |
| **Exemplo** | `/view/6832abc123def456...` |
| **Parâmetro dinâmico** | `id` — chave `_id` do documento MongoDB do processograma |
| **Tipo** | ObjectId MongoDB (string hexadecimal de 24 caracteres) |

Não há parâmetros de query obrigatórios. O tema é detectado via `next-themes` (`useTheme()` → `resolvedTheme`).

---

## 19. Diagrama da Árvore de Componentes

```
RootLayout (layout.tsx)
  └─ AppProviders
       ├─ QueryClientProvider (TanStack Query)
       ├─ ThemeProvider (next-themes)
       ├─ TooltipProvider (Radix)
       ├─ AuthHydrator → useAuthStore.hydrate()
       └─ Toaster (Sonner)

PublicViewPage (app/view/[id]/page.tsx)
  │
  │  ┌──── Dados ────────────────────────────────────┐
  │  │ useParams<{ id }>                              │
  │  │ useTheme() → resolvedTheme                     │
  │  │ useAuthStore(s => s.isAuthenticated)            │
  │  │ api.get<Processogram>(`/processograms/${id}`)  │
  │  │ processogramService.getElementData(id)          │
  │  └────────────────────────────────────────────────┘
  │
  │  ┌──── Hook Orquestrador ────────────────────────┐
  │  │ useSvgNavigatorLogic({                         │
  │  │   currentTheme,                                │
  │  │   onChange: handleNavigatorChange,              │
  │  │   onClose: handleNavigatorClose,               │
  │  │   rasterImages                                 │
  │  │ })                                             │
  │  │   ├─ usePrefetchRaster(rasterImages)           │
  │  │   │    └→ imageCache (RefMap)                  │
  │  │   ├─ useOptimizeSvgParts({svgEl, raster, cache})│
  │  │   │    └→ optimizeLevelElements,               │
  │  │   │       restoreAllRasterized                 │
  │  │   ├─ useNavigator({..., optimize, restore})    │
  │  │   │    └→ changeLevelTo(target, toPrev)        │
  │  │   │       ├─ getElementViewBox()               │
  │  │   │       ├─ gsap.to(viewBox)  ← CÂMERA       │
  │  │   │       ├─ gsap.set(opacity) ← ISOLAMENTO   │
  │  │   │       └─ onChange(id, hierarchy) → page.tsx │
  │  │   ├─ useClickHandler({..., changeLevelTo})     │
  │  │   │    └→ handleClick (window listener)        │
  │  │   │       ├─ closest() → DRILL-DOWN            │
  │  │   │       └─ historyLevel → DRILL-UP           │
  │  │   └─ useHoverEffects({svgEl, lockRef, ...})    │
  │  │        └→ mousemove/mouseleave (DOM nativo)    │
  │  │           └─ gsap.to(opacity)                  │
  │  └→ { updateSvgElement, navigateToLevel }         │
  │  └────────────────────────────────────────────────┘
  │
  ├─── <header> (inline)
  │     ├─ Logo WelfareData + Link "/"
  │     ├─ Nome do processograma
  │     └─ Botão Login (se !isAuthenticated)
  │
  ├─── <Loader2> (se status === "loading")
  ├─── <AlertTriangle> (se status === "error")
  │
  └─── (se status === "ready")
       ├─── ProcessogramBreadcrumb
       │     ├─ Props: breadcrumbPath, activeLevelIndex
       │     ├─ onNavigate → navigateUp → navigateToLevel(i)
       │     └─ onReset → clearSelection → navigateToLevel(-1)
       │
       ├─── ProcessogramViewer
       │     ├─ Props: svgUrl
       │     ├─ onSvgReady → updateSvgElement(svgEl)
       │     ├─ <SVG src={svgUrl} innerRef={...}> (react-inlinesvg)
       │     └─ sanitizeSvgElement() no callback
       │
       └─── SidePanel
             ├─ Props: processogramId, selectedElementId
             ├─ onClose → clearSelection
             ├─ Fetch: /data/public, /questions/public
             └─── ChatWidget
                   ├─ Props: processogramId, elementContext
                   ├─ POST /chat/stream (SSE)
                   └─── SuggestedQuestions
                         └─ Props: questions[], onQuestionClick
```

---

## 20. Funcionamento Completo do Frontend e Ligação com o Backend

### 20.1 Arquitetura Geral

O WelfareData é uma aplicação **monolítica com dois processos**:

| Processo | Framework | Porta (dev) | Responsabilidade |
|----------|-----------|-------------|------------------|
| **Backend** | Express 5 + TypeScript | `8080` | API REST, processamento SVG (Puppeteer), IA (Gemini), MongoDB |
| **Frontend** | Next.js 16 + React 19 | `3000` | UI, SSR, routing, proxy de API |

### 20.2 Comunicação Frontend ↔ Backend

```
Browser → Next.js (porta 3000) → Proxy → Express (porta 8080) → MongoDB / GCS / Gemini
```

**Mecanismo de proxy:** O `next.config.ts` define rewrites que redirecionam todas as chamadas `/api/v1/*` para `http://localhost:8080/api/v1/*`:

```ts
async rewrites() {
  return [
    { source: "/api/v1/:path*", destination: "http://localhost:8080/api/v1/:path*" }
  ];
}
```

**Timeout do proxy:** 360 segundos (para suportar processamento pesado de SVG via Puppeteer).

**Autenticação:** JWT via cookie httpOnly chamado `token`. O backend define o cookie no login; o frontend envia automaticamente via `withCredentials: true` (Axios) ou `credentials: "include"` (fetch).

### 20.3 Camada de HTTP do Frontend

```
Componentes/Pages
  ├─ Hooks TanStack Query (useProcessograms, useModules, useSpecies)
  │     └─ Services (processogramService, moduleService, specieService)
  │           └─ api (Axios instance, baseURL: /api/v1, withCredentials: true)
  │                 └─ Next.js rewrite → Express backend
  │
  ├─ Zustand (authStore)
  │     └─ api (Axios instance)
  │
  └─ fetch() nativo (SidePanel, ChatWidget)
        └─ Next.js rewrite → Express backend
```

### 20.4 Providers e Inicialização

A cadeia de providers no `RootLayout`:

```
<html>
  <body>
    <AppProviders>
      <QueryClientProvider>        ← TanStack Query (staleTime: 60s, retry: 1)
        <ThemeProvider>            ← next-themes (default: dark, enableSystem: false)
          <TooltipProvider>        ← Radix UI tooltips
            <AuthHydrator>         ← GET /auth/me para verificar cookie
              {children}           ← Páginas da aplicação
            </AuthHydrator>
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
      <Toaster />                  ← Sonner (toasts, top-right)
    </AppProviders>
  </body>
</html>
```

### 20.5 Fluxo do Admin Dashboard

```
/ → redirect → /admin (DashboardLayout)
  ├─ AppSidebar (navegação lateral)
  ├─ AppHeader (header com menu mobile)
  └─ Páginas:
     ├─ /admin            → Dashboard overview
     ├─ /admin/species    → CRUD de espécies (useSpecies + useCreateSpecie + useDeleteSpecie)
     ├─ /admin/modules    → CRUD de módulos (useModules + useCreateModule + useDeleteModule)
     └─ /admin/processograms → CRUD de processogramas
         ├─ UploadZone (drag & drop SVG)
         ├─ ProcessogramCard (listagem com status)
         └─ useProcessograms + useUploadProcessogram + useDeleteProcessogram
```

### 20.6 Fluxo Completo do Viewer Público

```
1. Usuário acessa /view/{id}
2. Next.js middleware: /view está em PUBLIC_PREFIXES → passa
3. PublicViewPage monta

4. useEffect → fetchProcessogram():
   ├─ GET /api/v1/processograms/{id} → Processogram (metadados + raster_images)
   ├─ svgUrl = /api/v1/processograms/{id}/svg?theme=dark
   └─ processogramService.getElementData(id) → ProcessogramElement[]

5. Estado: { status: "ready", processogram, svgUrl }

6. useSvgNavigatorLogic inicializa:
   ├─ usePrefetchRaster: para cada rasterImage, cria Image() + decode()
   ├─ useOptimizeSvgParts: pronto para trocar <g> por <image>
   ├─ useNavigator: pronto com changeLevelTo()
   ├─ useClickHandler: handleClick registrado no window
   └─ useHoverEffects: mousemove/mouseleave registados no <svg>

7. ProcessogramViewer renderiza:
   ├─ <SVG src={svgUrl}> → react-inlinesvg faz GET do SVG
   ├─ innerRef → handleSvgRef → sanitize → updateSvgElement()
   └─ useSvgNavigatorLogic recebe o svgElement via setSvgElement()

8. Hover:
   ├─ mousemove no <svg> → closest([id*="--lf" i])
   ├─ Grupo encontrado → gsap.to(opacity: 1), siblings → gsap.to(opacity: 0.15)
   └─ Zero re-renders React

9. Drill-down (clique num grupo):
   ├─ window click → target.closest([id*="--lf" i])
   ├─ changeLevelTo(element, false):
   │   ├─ clearHover()
   │   ├─ restoreAllRasterized()
   │   ├─ getElementViewBox(target) → "x y w h"
   │   ├─ lockInteraction + pointerEvents: none
   │   ├─ gsap.set(outOfFocus, { opacity: 0.15 })
   │   ├─ onChange(identifier, hierarchy) → page.tsx atualiza breadcrumb/SidePanel
   │   ├─ optimizeLevelElements(target, outOfFocus) → swap <g> → <image> via rAF
   │   └─ gsap.to(svgElement, { viewBox }) → animação de câmera 0.7s
   └─ SidePanel aparece com dados do elemento

10. SidePanel:
    ├─ fetch /data/public → procura descrição do element
    ├─ fetch /questions/public → filtra perguntas do element
    └─ ChatWidget:
        ├─ input de texto + sugestões
        └─ POST /chat/stream → SSE → chunks → renderização incremental

11. Drill-up (clique no vazio):
    ├─ Sem grupo encontrado → prevLevel
    ├─ historyLevel[prevLevel] → elemento anterior
    └─ changeLevelTo(element, true)

12. Reset (Home / breadcrumb root):
    ├─ navigateToLevel(-1)
    ├─ restoreAllRasterized()
    ├─ gsap.to(viewBox → original) → volta à visão global
    └─ onClose() → limpa estado React
```

### 20.7 Mapa Completo de Endpoints da API

| Método | URL | Auth | Consumidor no Frontend |
|--------|-----|------|----------------------|
| **Auth** | | | |
| `POST` | `/api/v1/auth/register` | Público | — |
| `POST` | `/api/v1/auth/login` | Público | `authStore.login` |
| `GET` | `/api/v1/auth/me` | Auth | `authStore.hydrate` |
| `POST` | `/api/v1/auth/logout` | Público | `authStore.logout` |
| **Species** | | | |
| `GET` | `/api/v1/species` | Auth | `useSpecies` |
| `POST` | `/api/v1/species` | Admin | `useCreateSpecie` |
| `DELETE` | `/api/v1/species/:id` | Admin | `useDeleteSpecie` |
| `PATCH` | `/api/v1/species/:id` | Admin | — (não usado no frontend) |
| **Módulos** | | | |
| `GET` | `/api/v1/production-modules` | Auth | `useModules` |
| `POST` | `/api/v1/production-modules` | Admin | `useCreateModule` |
| `DELETE` | `/api/v1/production-modules/:id` | Admin | `useDeleteModule` |
| `PATCH` | `/api/v1/production-modules/:id` | Admin | — (não usado no frontend) |
| **Processogramas** | | | |
| `GET` | `/api/v1/processograms` | Auth | `useProcessograms` |
| `GET` | `/api/v1/processograms/:id` | **Público** | `page.tsx (viewer)` |
| `GET` | `/api/v1/processograms/:id/svg` | **Público** | `react-inlinesvg (viewer)` |
| `POST` | `/api/v1/processograms` | Admin | `useUploadProcessogram` |
| `DELETE` | `/api/v1/processograms/:id` | Admin | `useDeleteProcessogram` |
| `PUT` | `/api/v1/processograms/:id` | Admin | — (não usado no frontend) |
| `POST` | `/api/v1/processograms/:id/analyze` | Admin | — (não usado no frontend) |
| **Dados Públicos** | | | |
| `GET` | `/api/v1/processograms/:id/data/public` | **Público** | `processogramService.getElementData` + `SidePanel fetch` |
| `GET` | `/api/v1/processograms/:id/questions/public` | **Público** | `SidePanel fetch` |
| **Chat** | | | |
| `POST` | `/api/v1/processograms/:id/chat/stream` | **Público** | `ChatWidget fetch (SSE)` |
| `POST` | `/api/v1/chat/stream` | Auth | — (não usado no frontend) |
| **Edição de Dados** | | | |
| `PUT` | `/api/v1/processogram-data/:id` | Admin | — (não usado no frontend) |
| `PUT` | `/api/v1/processogram-questions/:id` | Admin | — (não usado no frontend) |

### 20.8 Stack Tecnológico Completo

| Camada | Tecnologia | Versão |
|--------|------------|--------|
| **Runtime** | Node.js | — |
| **Framework Frontend** | Next.js | 16.1.6 |
| **React** | React | 19 |
| **Compilador** | React Compiler | Ativado via `next.config.ts` |
| **Framework Backend** | Express | 5 |
| **Banco de Dados** | MongoDB | 6.0 (via Docker) |
| **ORM** | Mongoose | 9 |
| **State Management** | Zustand | — |
| **Server State** | TanStack React Query | — |
| **HTTP Client** | Axios | — |
| **CSS** | Tailwind CSS | 4 |
| **UI Components** | shadcn/ui (Radix UI) | — |
| **Animações UI** | Framer Motion | — |
| **Animações SVG** | GSAP | 3.12.7 |
| **SVG Inline** | react-inlinesvg | 4.2.0 |
| **Ícones** | Lucide React | — |
| **Tema** | next-themes | — |
| **Validação** | Zod | — |
| **Auth** | JWT (jsonwebtoken) + bcryptjs | — |
| **IA** | Google Gemini (@google/generative-ai) | — |
| **Processamento SVG** | Puppeteer + Sharp + SVGO + Cheerio + jsdom | — |
| **Storage** | Google Cloud Storage | — |
| **Upload** | Multer (memoryStorage) | — |
| **Toasts** | Sonner | — |
| **Formulários** | React Hook Form | — |
| **Drag & Drop** | react-dropzone | — |

### 20.9 Resumo das Dependências Críticas para o Motor Canvas 2D

Para migrar o viewer de SVG DOM inline (react-inlinesvg + GSAP viewBox) para Canvas 2D:

| Dependência | Status | Impacto |
|-------------|--------|---------|
| `react-inlinesvg` | **A remover** | Substituir por renderização Canvas. Usado apenas em `ProcessogramViewer.tsx` |
| `gsap` | **A remover** | Usado em 3 arquivos do navigator para animação de viewBox e opacity. Substituir por interpolação Canvas nativa ou Web Animations API |
| `element.closest()` | **A reimplementar** | Usado em `useClickHandler` e `useHoverEffects` para hit-testing. No Canvas, precisa de hit-testing matemático ou overlay |
| `element.querySelector()` | **A reimplementar** | Usado extensivamente no navigator para encontrar elementos por ID. No Canvas, precisa de data structure (Map) |
| `getBBox()` / `getCTM()` | **A reimplementar** | Usado em `getElementViewBox` para cálculo de câmera. No Canvas, precisa de geometria pré-computada |
| `viewBox` attribute | **A reimplementar** | A "câmera" atual manipula o atributo `viewBox`. No Canvas, precisa de Transform Matrix (`ctx.setTransform`) |
| `opacity` CSS | **A reimplementar** | Isolamento visual via GSAP `opacity`. No Canvas, precisa de `globalAlpha` ou layer composition |
| `display: none` | **A reimplementar** | LOD swap oculta `<g>` com `display:none`. No Canvas, basta não renderizar |
| `insertBefore(<image>)` | **Desnecessário** | LOD swap insere `<image>` sibling. No Canvas, basta `drawImage()` diretamente |
| `rasterImages` metadata | **Reutilizável** | Coordenadas `x, y, width, height` e URLs são independentes do renderer |
| `hierarchy.ts` | **Parcialmente reutilizável** | A lógica de hierarquia depende de `closest()` no DOM. Precisa de lookup table |
| `extractInfoFromId.ts` | **100% reutilizável** | Parser de IDs é puro (string → dados). Sem dependência DOM |
| `consts.ts` | **100% reutilizável** | Constantes de animação e hierarquia |
| `types.ts` | **100% reutilizável** | Interfaces TypeScript |

---

## Notas Adicionais

### Componentes/hooks NÃO encontrados

Os seguintes itens mencionados na requisição **NÃO existem** no codebase:
- ~~Controles de zoom (botões +/-)~~ — O zoom é implícito via drill-down/drill-up, sem controles explícitos
- ~~Store Zustand do viewer~~ — Não há store específica para o viewer; todo estado é local
- ~~TanStack Query no viewer~~ — O viewer usa fetch direto, não React Query para seus dados

### Convenção de IDs SVG

O sistema inteiro depende da convenção de IDs semânticos nos `<g>` do SVG:

```
{nome-slugificado}--{alias}[dígitos opcionais]
```

| Alias | Nível | Exemplo |
|-------|-------|---------|
| `ps` | 0 — Production System | `broiler--ps` |
| `lf` | 1 — Life Fate | `growing--lf1` |
| `ph` | 2 — Phase | `feeding--ph2` |
| `ci` | 3 — Circumstance | `heat-stress--ci1` |

Elementos com prefixo `CANVAS--` (ex: `CANVAS--CI`) são wrappers de fundo e são excluídos de toda interação.
