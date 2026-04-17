# WelfareData — Análise Completa do Sistema

> Documento gerado a partir da leitura completa do codebase e documentação.  
> **Objetivo:** Fornecer contexto para integração do novo motor Canvas 2D.

---

## ÍNDICE

1. [Stack e Infraestrutura (Q1–Q5)](#1-stack-e-infraestrutura)
2. [Fluxo do SVG (Q6–Q8)](#2-fluxo-do-svg)
3. [Rasterização Atual (Q9–Q11)](#3-rasterização-atual)
4. [Renderização e Interatividade (Q12–Q14)](#4-renderização-e-interatividade)
5. [Gargalos e Problemas (Q15–Q17)](#5-gargalos-e-problemas)
6. [Integração com o Novo Motor (Q18–Q21)](#6-integração-com-o-novo-motor)
7. [Arquitetura do Upload (Q22–Q24)](#7-arquitetura-do-upload)
8. [Diagrama do Fluxo Completo](#8-diagrama-do-fluxo-completo)

---

## 1. Stack e Infraestrutura

### Q1 — Linguagens e Frameworks

| Camada | Tecnologia | Detalhes |
|--------|-----------|----------|
| **Backend** | Node.js + Express 5 + TypeScript (strict) | Clean Architecture: Controller → UseCase → Service → Model |
| **Frontend** | Next.js 16.1.6 + React 19.2.3 + TypeScript | App Router, Tailwind CSS v4, shadcn/ui |
| **Processamento SVG** | SVGO 4 (Worker Thread) + Puppeteer 24 + Sharp 0.34 | SVGO otimiza o SVG; Puppeteer rasteriza elementos; Sharp comprime PNGs |
| **IA** | Google Gemini 2.5-Flash (`@google/generative-ai`) | Gera descrições, questões e chat contextual com streaming |
| **State Management** | Zustand (auth) + TanStack Query v5 (server state) | — |
| **Animação** | GSAP (viewBox transitions, opacity, z-order) | Zero re-renders — DOM direto |
| **Validação** | Zod 4 (backend e frontend) | Input validation em todas as rotas |

### Q2 — Banco de Dados

**MongoDB 6.0** via Mongoose 9.

- Rodando em Docker (`docker-compose.yml` → `mongo:6.0`, container `welfare_db_v2`, porta 27017).
- Interface visual opcional: **Mongo Express** na porta 8081.
- Env var: `MONGO_URI` (default: `mongodb://localhost:27017/WelfareData_New`).
- Pool: 10 conexões, socket timeout: 45s, server selection timeout: 5s.

**Coleções principais:**

| Collection | Campos-chave | Uso |
|-----------|-------------|-----|
| `users` | email (unique), passwordHash (hidden), role (admin/user) | Autenticação |
| `species` | name, pathname (unique, imutável) | Hierarquia: Espécie |
| `productionmodules` | name, slug, specieId — compound index `{slug, specieId}` unique | Hierarquia: Módulo de produção |
| `processograms` | identifier, slug, status, svg_url_light/dark, raster_images_light/dark (Map), specieId, productionModuleId | **Entidade central** |
| `processogramdatas` | processogramId, elementId, description, videoUrl — compound `{processogramId, elementId}` unique | Descrições IA por elemento |
| `processogramquestions` | processogramId, elementId, question, options[], correctAnswerIndex | Questões IA por elemento |

### Q3 — Google Cloud Storage (GCS)

**Sim, Google Cloud Storage.** Não há S3.

- Configuração via `GCS_PROJECT_ID` e `GCS_BUCKET_NAME` (env vars).
- Autenticação: **Application Default Credentials (ADC)** — `GOOGLE_APPLICATION_CREDENTIALS` apontando para service account JSON.
- Cache-Control: `public, max-age=31536000` (1 ano).
- URLs públicas: `https://storage.googleapis.com/{bucket}/{path}`.

**Estrutura de paths no bucket:**

```
processograms/
  {specie.pathname}/
    {module.slug}/
      {processogram.slug}/
        light/
          {slug}.svg                    ← SVG otimizado
          raster/
            {elementId}.png             ← PNG @2x de cada elemento
        dark/
          {slug}.svg                    ← (planejado, não implementado)
          raster/
            {elementId}.png             ← (planejado, não implementado)
```

**Operações do `GoogleStorageService`:**
- `upload(buffer, path, mimeType)` → retorna URL pública
- `delete(path)` / `deleteByUrl(url)` / `deleteByPrefix(prefix)` → limpeza
- `downloadAsText(url)` → baixa SVG como string (usado na análise IA)

### Q4 — CDN

**Não há CDN configurada.** Os arquivos são servidos diretamente do bucket GCS com cache-control de 1 ano. O GCS funciona como pseudo-CDN por ter edge caching global nativo, mas não há CloudFlare, Fastly, Cloud CDN ou similar explicitamente configurado.

### Q5 — Puppeteer: Onde Exatamente

Puppeteer é usado **exclusivamente** em `src/infrastructure/services/svg/SvgProcessorService.ts`.

- **Não é** um script standalone, worker separado ou serviço independente.
- É um **serviço chamado inline** dentro do pipeline de upload (UseCase → Service).
- Roda no **mesmo processo Node.js** do backend Express.
- Lifecycle: **per-request** — um browser é lançado para cada `process()` e destruído ao final.
- Flags: `--no-sandbox --disable-dev-shm-usage --disable-gpu --disable-software-rasterizer`.
- Timeout total: 5 minutos.

---

## 2. Fluxo do SVG

### Q6 — Fluxo Completo: Upload do Admin até Pixel na Tela

```
ETAPA 1: UPLOAD (Admin Panel — Next.js)
├── Admin acessa /admin/processograms
├── Clica "Novo Processograma"
├── Drag-and-drop do arquivo .svg (aceita apenas image/svg+xml, max 10MB)
├── Preenche: nome, espécie, módulo de produção
└── POST /api/v1/processograms (multipart/form-data)
    ↓

ETAPA 2: MULTER PARSING (Backend Express)
├── Multer recebe o arquivo em memória (MemoryStorage)
├── Valida MIME type (image/svg+xml)
├── Limite: 10MB
└── req.file.buffer disponível
    ↓

ETAPA 3: VALIDAÇÃO DE NEGÓCIO (CreateProcessogramUseCase)
├── Valida schema com Zod (name, specieId, productionModuleId, creatorId)
├── Verifica se Specie existe
├── Verifica se ProductionModule existe e pertence à Specie
├── Gera slug a partir do name
└── Verifica unicidade de slug dentro do módulo
    ↓

ETAPA 4: PROCESSAMENTO SVG (SvgProcessorService)
├── 4A: SVGO OPTIMIZATION (Worker Thread)
│   ├── plugins: preset-default, normalizeSemanticIds, fixMissingSvgId, removeBxAttributes
│   ├── multipass: true se <1MB, false se ≥1MB
│   ├── cleanupIds: false (preserva IDs semânticos!)
│   └── Output: SVG otimizado em string
│
├── 4B: METADATA EXTRACTION (JSDOM)
│   ├── Parseia SVG, extrai width, height, viewBox
│   └── Fallback: 1920×1080 se ausente
│
└── 4C: RASTERIZAÇÃO (Puppeteer + Sharp)
    ├── Lança browser headless
    ├── Cria page com viewport = SVG dimensions @2x (deviceScaleFactor: 2)
    ├── Injeta SVG como HTML
    ├── Injeta JS para encontrar elementos rasterizáveis (IDs: --ps, --lf, --ph, --ci)
    ├── Para cada elemento:
    │   ├── Calcula bounding box com CTM (Current Transformation Matrix)
    │   ├── Screenshot da região (PNG, background transparente)
    │   └── Comprime com Sharp (PNG, compressionLevel: 6)
    ├── Timeout: 5 minutos
    └── Fecha browser
    ↓

ETAPA 5: UPLOAD PARA GCS (GoogleStorageService)
├── Upload do SVG otimizado → processograms/{specie}/{module}/{slug}/light/{slug}.svg
├── Upload de cada raster PNG → processograms/{specie}/{module}/{slug}/light/raster/{elementId}.png
│   (paralelo em batches de 20)
└── Retorna URLs públicas do GCS
    ↓

ETAPA 6: PERSISTÊNCIA (MongoDB)
├── Cria documento Processogram:
│   ├── status: "ready"
│   ├── svg_url_light: URL pública do SVG no GCS
│   ├── svg_bucket_key_light: path no bucket
│   ├── original_size_light, final_size_light
│   ├── raster_images_light: Map<elementId, {src, bucket_key, width, height, x, y}>
│   └── identifier: "{specie.pathname}-{module.slug}-{slug}"
└── Retorna 201 + JSON do processograma criado
    ↓

ETAPA 7: ANÁLISE IA (Background — fire-and-forget)
├── Baixa SVG do GCS
├── Parseia com SvgParser (cheerio) → extrai elementos com nível hierárquico
├── Gemini 2.5-Flash: gera descrição científica para cada elemento
├── Upsert em processogramdatas
├── Gemini 2.5-Flash: gera questões multiple-choice
└── Upsert em processogramquestions
    ↓

ETAPA 8: VISUALIZAÇÃO (Viewer — Next.js, rota pública /view/[id])
├── GET /api/v1/processograms/{id} → metadata + raster_images_light map
├── GET /api/v1/processograms/{id}/svg?theme=light → SVG como texto
├── react-inlinesvg injeta SVG como DOM real
├── usePrefetchRaster: pré-carrega PNGs do imageCache (new Image() → decode())
├── useOptimizeSvgParts: swap <g> → <image> (LOD via PNG)
├── useNavigator: animação viewBox com GSAP
├── useClickHandler: drill-down/up na hierarquia
├── useHoverEffects: opacity delegation (zero re-renders)
└── SidePanel: descrições IA + chat contextual
```

### Q7 — Como o SVG É Servido

O SVG é servido de **duas formas**:

1. **Via API endpoint (para o viewer)**:
   - `GET /api/v1/processograms/:id/svg?theme=light` (rota PÚBLICA)
   - O controller faz `downloadAsText(svg_url_light)` do GCS
   - Retorna `Content-Type: image/svg+xml` como texto
   - O frontend usa `react-inlinesvg` que recebe essa URL e injeta no DOM

2. **Via URL pública do GCS (para raster images)**:
   - As PNGs são acessadas diretamente via URL: `https://storage.googleapis.com/{bucket}/processograms/.../raster/{id}.png`
   - O campo `raster_images_light[elementId].src` contém a URL pública
   - O frontend acessa via `new Image().src = url` (prefetch)

**A URL do endpoint SVG:** `/api/v1/processograms/:id/svg?theme=light|dark`

### Q8 — SVG Completo ou Streaming/Chunking

**O SVG é entregue completo de uma vez.** Não há streaming nem chunking do SVG.

O controller baixa o SVG inteiro do GCS como string e retorna na resposta HTTP. O `react-inlinesvg` recebe o SVG completo e injeta no DOM.

O único streaming no sistema é o **chat** (Server-Sent Events via Gemini).

---

## 3. Rasterização Atual

### Q9 — Como Está Sendo Feita

A rasterização opera em **duas camadas**:

| Camada | Quando | Como | Output |
|--------|--------|------|--------|
| **Server-side (Puppeteer)** | No upload, uma única vez | Screenshot de cada elemento via Puppeteer @2x + Sharp PNG | PNGs no GCS |
| **Client-side (LOD Swap)** | Em runtime, durante navegação | Swap `<g>` → `<image>` com PNGs pré-renderizados | Redução de nós DOM ativos |

**Não existe rasterização client-side "real"** (Canvas, OffscreenCanvas, etc.) na v2 atual. A v1 usava Canvas client-side (30-80ms/elemento), mas foi abandonada. A v2 usa apenas lookup no cache + criação de `<image>` DOM node (~0.1ms/elemento).

### Q10 — Puppeteer: Em Qual Etapa e Outputs

**Etapa:** Durante o `CreateProcessogramUseCase.execute()` — step 4C do pipeline de upload.

**Processo detalhado:**
1. Puppeteer lança browser headless
2. Viewport configurado para dimensões exatas do SVG com `deviceScaleFactor: 2` (retina)
3. SVG otimizado (pós-SVGO) é injetado como HTML
4. JavaScript é avaliado no contexto do browser para:
   - Encontrar todos os elementos com IDs semânticos (`--ps`, `--lf`, `--ph`, `--ci`)
   - Calcular bounding box real (com CTM — Current Transformation Matrix)
5. Para cada elemento encontrado:
   - `page.screenshot({ type: 'png', clip: {...}, omitBackground: true })`
   - `sharp(buffer).png({ compressionLevel: 6 }).toBuffer()`
6. Resultado: `Map<elementId, { buffer, width, height, x, y }>`

**Formato de output:** PNG com transparência, compressão nível 6, resolução @2x (deviceScaleFactor: 2).

**Não gera:**
- WebP (apenas PNG)
- Tiles (apenas recorte por elemento)
- Múltiplas resoluções (apenas @2x)

### Q11 — Tamanho Médio dos SVGs Problemáticos

**Dados encontrados no código e docs:**

| Métrica | Valor |
|---------|-------|
| Limite de upload | 10MB (Multer) |
| Threshold para SVGO multipass | 1MB (acima disso, single pass) |
| Timeout de processamento | 5 minutos |
| Timeout de request HTTP | 360 segundos (para rotas SVG) |
| Elementos rasterizáveis típicos | ~1200+ em SVGs complexos |
| Tempo de rasterização (grande) | 30-60 segundos (Puppeteer sequencial) |
| Tipo de SVGs problemáticos | "SVGs complexos com centenas de elementos" |

**Observação:** Não há referência explícita ao "SVG do Salmão" no código ou docs, mas a arquitetura toda (LOD swap, rAF time-slicing, Worker Threads, timeouts de 5min) foi claramente projetada para lidar com SVGs de alta complexidade (1200+ elementos vetoriais).

**Output rasterizado:** Cada elemento gera um PNG individual. Para um SVG com 200 elementos, são 200 PNGs separados no GCS. O tamanho de cada PNG depende das dimensões do elemento, mas o `compressionLevel: 6` e @2x resultam em arquivos moderados.

---

## 4. Renderização e Interatividade

### Q12 — Método de Renderização no Browser

**DOM SVG inline** via `react-inlinesvg`.

- O componente `ProcessogramViewer` usa `<SVG>` do `react-inlinesvg`
- O SVG é baixado (fetch) e injetado como elementos DOM SVG reais no HTML
- Na carga: width/height são forçados para `"100%"`, `preserveAspectRatio="xMidYMid meet"`
- O viewBox é garantido (criado a partir de width/height se ausente)
- Resultados: `<svg>` real com todos os `<g>`, `<path>`, `<text>` como nós DOM manipuláveis

**Não usa:**
- `<img src="...svg">` (sem interatividade)
- `<object>` ou `<embed>`
- Canvas 2D ou WebGL
- Nenhuma biblioteca SVG (D3, Snap.svg, svg.js)

### Q13 — Por Que DOM SVG

O DOM SVG foi escolhido porque:

1. **Interatividade nativa:** Cada elemento SVG é um nó DOM, permitindo event handlers diretos (click, hover, mousemove)
2. **Navegação hierárquica:** `element.closest('[id*="--lf"]')` — DOM traversal nativo para encontrar ancestrais
3. **CSS nativo:** Opacity, filters, transitions aplicáveis diretamente via GSAP ou CSS
4. **IDs semânticos:** O sistema de IDs (`nome--ps`, `nome--lf`, `nome--ph`, `nome--ci`) permite query direta via `getElementById`
5. **GSAP ViewBox animation:** GSAP anima `viewBox` do `<svg>` diretamente para drill-down

**Nenhuma biblioteca SVG** (D3, Snap.svg, svg.js) está sendo usada. A manipulação é feita com:
- DOM nativo (`getElementById`, `closest`, `querySelectorAll`, `getBBox`, `getCTM`)
- GSAP para animações (viewBox, opacity)
- Event delegation direta (não React synthetic events)

### Q14 — Interatividade Implementada

A interatividade é dividida em **5 sub-sistemas**, todos compostos no hook `useSvgNavigatorLogic`:

#### 1. Click Handler (`useClickHandler`)
- Listener **no window** (não no SVG) — para capturar cliques em `<path>`, `<text>` que bubblam
- **Drill-down:** Clique em elemento do próximo nível → `changeLevelTo(element, false)`
- **Drill-up:** Clique em área sem próximo nível → volta para nível anterior (history)
- **Exit:** No nível 0, clique geral → `onClose()`

#### 2. Hover Effects (`useHoverEffects`)
- Listeners `mousemove`/`mouseleave` diretos no `<svg>` DOM element
- **Zero re-renders React** — useRef para estado, GSAP para animações
- Hover aplica: target = `opacity: 1`, irmãos = `opacity: 0.15` (dark) / `0.2` (light)
- Debounce implícito: se `hoveredElementId === previous`, skip

#### 3. Navigator/Camera (`useNavigator`)
- Anima `viewBox` do `<svg>` com GSAP (`duration: 0.7s`, `ease: "power1.inOut"`)
- Calcula viewBox alvo via `getElementViewBox()`:
  - CTM (Current Transformation Matrix) para coordenadas reais
  - Zoom Floor (mínimo 5% do SVG total)
  - Padding adaptativo (0%, 15% ou 25%)
  - Aspect-ratio lock (match viewport do browser)
  - Clamp aos limites do SVG

#### 4. LOD Rasterization (`usePrefetchRaster` + `useOptimizeSvgParts`)
- **Prefetch:** Na montagem do viewer, cria `new Image()` para cada PNG do `raster_images_light` e chama `.decode()`
- **Swap:** Ao navegar, elementos fora de foco são substituídos: `<g style="display:none">` + `<image>` sibling
- **Restore:** Ao navegar de volta, restaura `<g>` e remove `<image>`
- **Chunking:** 400 elementos por frame via `requestAnimationFrame`

#### 5. Breadcrumb Navigation (`ProcessogramBreadcrumb`)
- Floating overlay no viewer
- Mostra caminho hierárquico: SYS → LF → PH → CI
- Clique em nível anterior → `navigateToLevel(index)` → drill-up para esse nível
- Home button → reset total

**Tooltips:** Implementados via `SidePanel` (painel lateral), não tooltips inline. Ao selecionar um elemento, o SidePanel mostra:
- Nome e ID do elemento
- Descrição gerada por IA
- Widget de chat contextual
- Questões sugeridas

---

## 5. Gargalos e Problemas

### Q15 — Gargalo Principal com SVGs Grandes

Os gargalos estão documentados e identificados em múltiplas camadas:

| # | Gargalo | Camada | Severidade | Evidência no código |
|---|---------|--------|-----------|---------------------|
| **1** | **Rasterização Puppeteer sequencial** | Server (upload) | **ALTA** | Loop `for...of elements` — 1 screenshot por vez, 30-60s para 200+ el. |
| **2** | **DOM SVG parse de 1200+ elementos** | Client (viewer) | **ALTA** | `react-inlinesvg` injeta TODOS os nós DOM de uma vez |
| **3** | **Dark mode sem PNG swap** | Client (viewer) | **ALTA** | `raster_images_dark: {}` — sempre vazio, zero LOD em dark mode |
| **4** | **Prefetch de TODOS os PNGs no mount** | Client (viewer) | MÉDIA | `usePrefetchRaster` carrega todas as imagens na montagem (mitigado por 1yr cache) |
| **5** | **GSAP viewBox animation com 1200+ nós DOM** | Client (viewer) | MÉDIA (mitigada pelo LOD swap) | Sem swap, cada frame rasteriza todos os nós visíveis |

**O gargalo #1 (Puppeteer)** não afeta o viewer, mas torna o upload de SVGs complexos muito lento (30-60s por processamento sequencial).

**O gargalo #2 e #5** são mitigados pelo sistema LOD (swap `<g>` → `<image>`), mas o **parse inicial** do SVG (browser precisa construir todo o DOM) ainda é pesado para SVGs com milhares de nós. O `react-inlinesvg` não faz lazy loading — injeta tudo de uma vez.

**O gargalo #3** é o mais grave para UX em dark mode: nenhum PNG é gerado para o tema escuro, então todos os 1200+ elementos permanecem vetoriais durante navegação, causando potenciais frame drops.

### Q16 — INP (Interaction to Next Paint)

**Não há dados de INP registrados no código.** Não foi encontrado:
- Nenhuma integração com web-vitals
- Nenhum PerformanceObserver para INP
- Nenhum analytics de performance
- Nenhum dashboard de métricas

**Dados de performance disponíveis** (do código e docs):
- Hover: ~0 re-renders (medido qualitativamente — zero useState)
- LOD Swap: ~0.05-0.1ms por elemento (estimativa do ADR-004)
- rAF budget: 400 el/frame ≈ 20ms (dentro dos 16.6ms com margem GSAP ~2ms)
- GSAP drill-down: 0.7s total animation

### Q17 — Dispositivos/Browsers Problemáticos

**Não há dados específicos de dispositivos no código.** Não foi encontrado:
- Nenhum user-agent detection
- Nenhum feature detection para capability
- Nenhum breakpoint de performance por device class

**Inferências pela arquitetura:**
- **Mobile:** Provavelmente mais afetado — DOM SVG com 1200+ nós é extremamente pesado em dispositivos com menos RAM e GPU fraca
- **Tablets:** Intermediário
- **Dark mode em qualquer device:** Sem LOD swap, performance degrada significativamente
- **Safari:** Historicamente pior com DOM SVG grandes (re-rasterização agressiva)
- **Decisão de viewport @2x no backend:** Os PNGs são gerados com `deviceScaleFactor: 2`, adequado para retina mas gera imagens maiores

---

## 6. Integração com o Novo Motor

### Q18 — Substituir ou Coexistir

**Baseado na arquitetura atual, o novo motor Canvas 2D pode substituir completamente o DOM SVG no viewer.** O sistema já foi projetado com separação clara:

- O SVG é armazenado como arquivo no GCS (não acoplado ao renderer)
- Os metadados (rasterImages, hierarchy, etc.) estão no MongoDB
- As PNGs pré-renderizadas já existem no GCS e são servidas via URL pública
- O viewer (`/view/[id]`) é um componente React substituível

**Componentes que seriam substituídos:**
- `ProcessogramViewer.tsx` (react-inlinesvg → Canvas)
- `navigator/hooks/useNavigator.ts` (GSAP viewBox → camera Canvas)
- `navigator/hooks/useClickHandler.ts` (DOM closest() → hit-testing Canvas)
- `navigator/hooks/useHoverEffects.ts` (DOM opacity → Canvas render)
- `navigator/hooks/useOptimizeSvgParts.ts` (DOM swap → desnecessário em Canvas)
- `navigator/hooks/usePrefetchRaster.ts` (pode ser reaproveitado para tiles)

**Componentes que podem ser reutilizados:**
- `navigator/extractInfoFromId.ts` (parsing de IDs semânticos)
- `navigator/consts.ts` (níveis, duração, ease)
- `navigator/types.ts` (types compartilhados)
- `navigator/hierarchy.ts` (breadcrumb path builder — precisa adaptar de DOM para dados)
- `ProcessogramBreadcrumb.tsx` (UI overlay)
- `SidePanel.tsx` (painel lateral com IA)

### Q19 — API/Endpoint para Consumir SVG

Sim, existem endpoints prontos:

| Endpoint | Método | Auth | Retorno |
|----------|--------|------|---------|
| `GET /api/v1/processograms/:id` | GET | Público | JSON com metadata completa: `svg_url_light`, `raster_images_light` (Map) |
| `GET /api/v1/processograms/:id/svg?theme=light` | GET | Público | SVG como `image/svg+xml` (texto) |
| `GET /api/v1/processograms/:id/data/public` | GET | Público | Array de `{elementId, description, videoUrl}` |
| `GET /api/v1/processograms/:id/questions/public` | GET | Público | Array de questions |

**Para o motor Canvas 2D, os endpoints mais úteis são:**
1. `GET /:id` → para obter `raster_images_light` com coordenadas (x, y, width, height) e URLs dos PNGs
2. `GET /:id/svg` → para obter o SVG como texto (para parse e extração de paths/geometria)

**As URLs das PNGs** no `raster_images_light` são URLs públicas do GCS, acessíveis sem autenticação.

### Q20 — Autenticação no Acesso aos SVGs

**As rotas de visualização são PÚBLICAS.** Sem necessidade de login:

- `GET /processograms/:id` — público (show)
- `GET /processograms/:id/svg` — público (download SVG)
- `GET /processograms/:processogramId/data/public` — público (descrições)
- `GET /processograms/:processogramId/questions/public` — público (questões)
- `POST /processograms/:processogramId/chat/stream` — público (chat)

**As rotas de administração SÃO protegidas:**
- `POST /processograms` (create) — auth + admin
- `PUT /processograms/:id` (update) — auth + admin
- `DELETE /processograms/:id` (delete) — auth + admin
- `POST /processograms/:id/analyze` (re-analisar) — auth + admin

**Autenticação:** JWT em HttpOnly cookie, sameSite: strict, secure em produção.

### Q21 — Versionamento dos SVGs

**Não existe versionamento.** Quando o Admin sobe uma nova versão de um SVG (via `PUT /processograms/:id`):

1. O SVG antigo é **deletado** do GCS (`deleteByUrl`)
2. Todos os PNGs rasterizados antigos são **deletados** (`deleteByPrefix`)
3. O novo SVG é processado e uploaded
4. O documento MongoDB é atualizado com as novas URLs
5. **A versão anterior não é preservada**

---

## 7. Arquitetura do Upload

### Q22 — Painel Admin

O Admin é uma **página web** em Next.js, acessível em `/admin/processograms`:

- Layout: Sidebar com navegação (Dashboard, Processograms, Species, Modules) + header com breadcrumb, theme toggle e user menu
- Design system: "Red Sci-Fi" com dark mode padrão, glassmorphism
- Componentes shadcn/ui + Tailwind CSS
- Proteção: middleware Next.js redireciona para `/login` se não autenticado

**Funcionalidades do painel de processogramas:**
- **Lista** com cards mostrando: nome, ID, status (badge animado para "Processando"), descrição, data
- **Dialog de upload** com:
  - Dropzone (drag-and-drop .svg)
  - Form fields: nome, espécie (select), módulo de produção (select)
  - Progress bar durante upload (estimativa linear até 92%)
- **Ações:** VIEW (abre viewer em nova aba), DELETE (com confirmação)

### Q23 — Pipeline Completo do Upload

```
1. VALIDAÇÃO DO ARQUIVO (Frontend — UploadZone)
   ├── react-dropzone aceita apenas .svg (MIME: image/svg+xml)
   ├── Validação do form com react-hook-form + zod
   └── Envia POST multipart/form-data

2. VALIDAÇÃO DO ARQUIVO (Backend — Multer)
   ├── MemoryStorage (arquivo fica em req.file.buffer)
   ├── Limite: 10MB
   ├── Filtro MIME: image/svg+xml apenas
   └── Debug logging do parse

3. VALIDAÇÃO DE NEGÓCIO (CreateProcessogramUseCase)
   ├── Zod: name (string), specieId (ObjectId), productionModuleId (ObjectId)
   ├── Specie existe?
   ├── ProductionModule existe? Pertence à Specie?
   ├── Slug gerado do name → único dentro do módulo?
   └── Qualquer falha → 400/404

4. PROCESSAMENTO (SvgProcessorService)
   ├── SVGO otimização (Worker Thread — não bloqueia event loop)
   │   ├── normalizeSemanticIdsPlugin: canoniza IDs (sow_lf → sow--lf)
   │   ├── fixMissingSvgIdPlugin: valida IDs interativos
   │   ├── removeBxAttributesPlugin: remove atributos de editor (bx:*, inkscape:*)
   │   └── multipass: true se <1MB, false se ≥1MB
   │
   ├── Metadata extraction (JSDOM): width, height, viewBox
   │
   └── Puppeteer rasterização
       ├── Lança browser headless
       ├── Viewport = SVG dimensions @2x
       ├── Injeta script de encontrar elementos (IDs --ps/--lf/--ph/--ci)
       ├── getBBox + CTM para coordenadas absolutas
       ├── Screenshot + Sharp PNG (compressionLevel: 6) por elemento
       └── Fecha browser (5 min timeout)

5. ARMAZENAMENTO (GoogleStorageService → GCS)
   ├── Upload SVG optimizado → {specie}/{module}/{slug}/light/{slug}.svg
   ├── Upload PNGs em batches de 20 parallel
   │   → {specie}/{module}/{slug}/light/raster/{elementId}.png
   └── Retorna URLs públicas

6. PERSISTÊNCIA (MongoDB)
   ├── Cria documento Processogram com:
   │   ├── status: "ready"
   │   ├── svg_url_light, svg_bucket_key_light
   │   ├── raster_images_light: Map<id, {src, bucket_key, w, h, x, y}>
   │   └── original_size, final_size
   └── Retorna 201 + JSON

7. ANÁLISE IA (Background — fire-and-forget)
   ├── Download SVG do GCS
   ├── Parse com cheerio → elementos com nível hierárquico
   ├── Gemini bulk descriptions → upsert ProcessogramData
   └── Gemini bulk questions → upsert ProcessogramQuestion
```

### Q24 — Sistema de Filas

**Não há sistema de filas.** O processamento é:

- **Síncrono** no handler do request Express (etapas 2-6)
- **Fire-and-forget** para análise IA (etapa 7 — Promise não-awaited)
- Timeout especial: 360 segundos para rotas de processamento SVG (vs 30s padrão)

**Riscos identificados:**
- Se dois uploads pesados ocorrem simultaneamente, ambos lançam Puppeteer browsers no mesmo servidor
- Não há retry automático em caso de falha
- O status do processograma é "ready" assim que o SVG+PNGs são uploaded, mesmo que a análise IA ainda esteja rodando (a análise é background)
- Não há Bull, BullMQ, RabbitMQ, Cloud Tasks ou similar

---

## 8. Diagrama do Fluxo Completo

```
╔══════════════════════════════════════════════════════════════════════════╗
║                    WELFAREDATA — FLUXO COMPLETO                        ║
║              Do Upload do Admin até o Pixel no Viewer                  ║
╚══════════════════════════════════════════════════════════════════════════╝

┌─────────────────────────────────────────────────────────────────────────┐
│                        ADMIN (Next.js /admin)                          │
│                                                                        │
│  ┌────────────┐    ┌──────────────┐    ┌──────────────────────────┐    │
│  │ Dropzone   │───▶│ Form (name,  │───▶│ POST /api/v1/            │    │
│  │ .svg file  │    │ specie,      │    │   processograms          │    │
│  │ ≤10MB      │    │ module)      │    │ (multipart/form-data)    │    │
│  └────────────┘    └──────────────┘    └────────────┬─────────────┘    │
└─────────────────────────────────────────────────────│──────────────────┘
                                                      │
                                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     BACKEND (Express + Node.js)                        │
│                                                                        │
│  ┌─────────┐   ┌──────────┐   ┌──────────────────────────────────┐    │
│  │ Multer  │──▶│ Zod      │──▶│ CreateProcessogramUseCase        │    │
│  │ Memory  │   │ Validate │   │                                  │    │
│  │ Storage │   │ + Check  │   │  ┌────────────────────────────┐  │    │
│  └─────────┘   │ Specie & │   │  │ SvgProcessorService        │  │    │
│                │ Module   │   │  │                            │  │    │
│                └──────────┘   │  │  ┌──────────────────────┐  │  │    │
│                               │  │  │ 1. SVGO (Worker)     │  │  │    │
│                               │  │  │    normalize IDs      │  │  │    │
│                               │  │  │    remove bx:*        │  │  │    │
│                               │  │  │    optimize           │  │  │    │
│                               │  │  └──────────┬───────────┘  │  │    │
│                               │  │             ▼              │  │    │
│                               │  │  ┌──────────────────────┐  │  │    │
│                               │  │  │ 2. JSDOM metadata    │  │  │    │
│                               │  │  │    width, height,    │  │  │    │
│                               │  │  │    viewBox           │  │  │    │
│                               │  │  └──────────┬───────────┘  │  │    │
│                               │  │             ▼              │  │    │
│                               │  │  ┌──────────────────────┐  │  │    │
│                               │  │  │ 3. Puppeteer @2x     │  │  │    │
│                               │  │  │    Para cada --ps,   │  │  │    │
│                               │  │  │    --lf, --ph, --ci: │  │  │    │
│                               │  │  │    ┌───────────────┐  │  │    │
│                               │  │  │    │ CTM BBox calc │  │  │    │
│                               │  │  │    │ Screenshot    │  │  │    │
│                               │  │  │    │ Sharp PNG     │  │  │    │
│                               │  │  │    └───────────────┘  │  │    │
│                               │  │  └──────────┬───────────┘  │  │    │
│                               │  └─────────────┘              │  │    │
│                               └──────────────┬───────────────┘    │
│                                              ▼                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ GoogleStorageService                                          │  │
│  │                                                               │  │
│  │  ┌─────────────────────────────────────────────────────────┐  │  │
│  │  │ GCS Bucket                                              │  │  │
│  │  │                                                         │  │  │
│  │  │  processograms/{specie}/{module}/{slug}/                │  │  │
│  │  │    light/                                               │  │  │
│  │  │      {slug}.svg            ← SVG otimizado              │  │  │
│  │  │      raster/                                            │  │  │
│  │  │        {element1}.png      ← PNG @2x                   │  │  │
│  │  │        {element2}.png      ← PNG @2x                   │  │  │
│  │  │        ...                                              │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                              ▼                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ MongoDB                                                       │  │
│  │                                                               │  │
│  │  processograms: {                                             │  │
│  │    status: "ready",                                           │  │
│  │    svg_url_light: "https://storage.googleapis.com/...",       │  │
│  │    raster_images_light: {                                     │  │
│  │      "broiler--ps": { src, width, height, x, y },            │  │
│  │      "growing--lf1": { src, width, height, x, y },           │  │
│  │      ...                                                      │  │
│  │    }                                                          │  │
│  │  }                                                            │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                     │                          │                    │
│                     │ (201 Response)           │ (Background)       │
│                     ▼                          ▼                    │
│              ┌──────────┐            ┌─────────────────────┐       │
│              │ Admin    │            │ AnalyzeUseCase      │       │
│              │ recebe   │            │  ├── Download SVG   │       │
│              │ sucesso  │            │  ├── Parse (cheerio)│       │
│              └──────────┘            │  ├── Gemini desc.   │       │
│                                      │  ├── Upsert Data   │       │
│                                      │  ├── Gemini quest.  │       │
│                                      │  └── Upsert Quest.  │       │
│                                      └─────────────────────┘       │
└─────────────────────────────────────────────────────────────────────┘

                              ═══════════

┌─────────────────────────────────────────────────────────────────────────┐
│                      VIEWER (Next.js /view/[id])                       │
│                           ROTA PÚBLICA                                 │
│                                                                        │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ 1. FETCH DADOS                                                    │  │
│  │    GET /processograms/:id        → metadata + raster_images map   │  │
│  │    GET /processograms/:id/svg    → SVG texto (image/svg+xml)      │  │
│  │    GET /processograms/:id/data   → descrições IA por elemento     │  │
│  └───────────────────────────────────────────┬───────────────────────┘  │
│                                              ▼                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ 2. INJEÇÃO SVG (react-inlinesvg)                                  │  │
│  │    ├── Fetch SVG → parse → inject como DOM SVG real               │  │
│  │    ├── Sanitize: viewBox, width="100%", preserveAspectRatio       │  │
│  │    └── callback: onSvgReady(svgElement)                           │  │
│  └───────────────────────────────────────────┬───────────────────────┘  │
│                                              ▼                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ 3. SVG NAVIGATOR SYSTEM (useSvgNavigatorLogic)                    │  │
│  │                                                                    │  │
│  │  ┌─────────────────────┐  ┌───────────────────────────────────┐   │  │
│  │  │ usePrefetchRaster   │  │ useOptimizeSvgParts (LOD Swap)    │   │  │
│  │  │ ├── new Image()     │  │ ├── Ao drill-down:               │   │  │
│  │  │ │   para cada PNG   │  │ │   ├── <g> out-of-focus →       │   │  │
│  │  │ │   do rasterImages │  │ │   │   display:none             │   │  │
│  │  │ ├── img.decode()    │  │ │   └── <image> sibling          │   │  │
│  │  │ │   (GPU upload)    │  │ │       (PNG pré-renderizado)     │   │  │
│  │  │ └── imageCache Map  │  │ ├── rAF time-slicing (400/frame) │   │  │
│  │  └─────────────────────┘  │ └── Epoch-based abort safety     │   │  │
│  │                           └───────────────────────────────────┘   │  │
│  │  ┌─────────────────────┐  ┌───────────────────────────────────┐   │  │
│  │  │ useNavigator        │  │ useClickHandler                   │   │  │
│  │  │ (Camera Motor)      │  │ ├── Window click listener         │   │  │
│  │  │ ├── GSAP viewBox    │  │ ├── closest() para próximo nível │   │  │
│  │  │ │   animation 0.7s  │  │ ├── Drill-down: changeLevelTo()  │   │  │
│  │  │ ├── CTM → viewBox   │  │ └── Drill-up: history restore    │   │  │
│  │  │ │   math pipeline   │  │                                   │   │  │
│  │  │ ├── Zoom Floor 5%   │  └───────────────────────────────────┘   │  │
│  │  │ ├── Adaptive padding│                                          │  │
│  │  │ ├── Aspect lock     │  ┌───────────────────────────────────┐   │  │
│  │  │ └── Clamp bounds    │  │ useHoverEffects                   │   │  │
│  │  └─────────────────────┘  │ ├── mousemove/leave on <svg> DOM  │   │  │
│  │                           │ ├── GSAP opacity tweening         │   │  │
│  │                           │ ├── Zero React re-renders         │   │  │
│  │                           │ └── Ref-based state management    │   │  │
│  │                           └───────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                              ▼                         │
│  ┌──────────────────────┐  ┌─────────────────────────────────────────┐  │
│  │ Breadcrumb (overlay) │  │ SidePanel (right)                       │  │
│  │ SYS → LF → PH → CI  │  │ ├── Descrição IA do elemento           │  │
│  │ Click = drill-up     │  │ ├── ChatWidget (SSE streaming)         │  │
│  └──────────────────────┘  │ └── Questões sugeridas                 │  │
│                            └─────────────────────────────────────────┘  │
│                                              ▼                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                    🖥️ PIXEL NA TELA                                │  │
│  │                                                                    │  │
│  │  ┌─────────────────────────────────────────────────────────┐      │  │
│  │  │ SVG DOM (viewBox animado por GSAP)                      │      │  │
│  │  │                                                         │      │  │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │      │  │
│  │  │  │ <g> foco │ │<image>   │ │<image>   │ │<image>   │  │      │  │
│  │  │  │ vectorial│ │ PNG LOD  │ │ PNG LOD  │ │ PNG LOD  │  │      │  │
│  │  │  │ opacity:1│ │ op: 0.15 │ │ op: 0.15 │ │ op: 0.15 │  │      │  │
│  │  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │      │  │
│  │  └─────────────────────────────────────────────────────────┘      │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘


                    ╔═══════════════════════════════╗
                    ║  TECNOLOGIAS POR CAMADA       ║
                    ╠═══════════════════════════════╣
                    ║ Admin UI:  Next.js + shadcn   ║
                    ║ Viewer UI: react-inlinesvg    ║
                    ║           + GSAP + useRef DOM  ║
                    ║ API:       Express 5           ║
                    ║ SVG Proc:  SVGO (Worker)       ║
                    ║           + Puppeteer + Sharp   ║
                    ║ Storage:   Google Cloud Storage ║
                    ║ Database:  MongoDB 6 + Mongoose ║
                    ║ IA:        Gemini 2.5-Flash     ║
                    ║ Auth:      JWT HttpOnly Cookie   ║
                    ╚═══════════════════════════════╝
```

---

## Resumo Executivo para Integração do Motor Canvas 2D

### O que o novo motor pode aproveitar imediatamente:

1. **PNGs pré-renderizados no GCS** — Já existem tiles por elemento com coordenadas (x, y, width, height). O motor Canvas pode desenhá-los diretamente com `drawImage()`.

2. **API pública** — Endpoints sem autenticação para obter SVG (texto) + metadata + raster images map.

3. **IDs semânticos** — Sistema de naming convention (`{name}--{level}`) já estabelecido e normalizado pelo SVGO plugin.

4. **Hierarquia 4 níveis** — PS → LF → PH → CI. Parsing e hierarchy building já implementados e podem ser portados para dados puros (sem dependência DOM).

5. **Breadcrumb + SidePanel + Chat** — Componentes de UI desacoplados do renderer SVG, podem coexistir com Canvas.

### O que precisará ser desenvolvido:

1. **Hit-testing** — Substituir `element.closest('[id*="--lf"]')` por quadtree ou similar no Canvas.

2. **Camera engine** — Substituir GSAP viewBox animation por transformação de matrix no Canvas.

3. **Hover effects** — Substituir opacity DOM por re-render seletivo no Canvas.

4. **Tile system** — Os PNGs atuais são recortes por elemento, não tiles de zoom level. O motor Canvas pode precisar de um esquema de tiling mais granular para SVGs enormes.

5. **Dark mode** — Atualmente sem PNGs para tema escuro. O motor Canvas precisará de solução (CSS filter no Canvas, ou gerar tiles dark no backend).
