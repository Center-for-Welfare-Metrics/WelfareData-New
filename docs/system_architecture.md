# System Architecture

## Visão Geral

O WelfareData é uma aplicação **monolítica integrada**: um único servidor Express serve a API REST (sob `/api/v1`) e, em produção, os estáticos do frontend Next.js. O backend segue os princípios de **Clean Architecture**, com camadas concêntricas e dependência unidirecional.

---

## Diagrama Geral

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                            │
│  Next.js 15 · App Router · Tailwind · shadcn/ui · Framer Motion     │
│  TanStack Query · React Zoom Pan Pinch · SSE Consumer               │
└────────────────────────────┬────────────────────────────────────────┘
                             │ HTTP / SSE
                             │ Cookies HttpOnly
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       EXPRESS SERVER (:8080)                        │
│                                                                     │
│  GET /                  → "API v1 running. Frontend under..."       │
│  /api/v1/*              → API REST + SSE (todas as rotas)           │
│  /* (produção)          → Next.js estáticos (build output)          │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                     PRESENTATION LAYER                              │
│  Controllers · Routes · Middlewares (Auth, RBAC)                    │
│  Express Request/Response · Zod Validation · SSE Streaming          │
├─────────────────────────────────────────────────────────────────────┤
│                     APPLICATION LAYER                               │
│  Use Cases · Services · Interfaces (Ports)                          │
│  Orquestração de fluxos · Regras de negócio                         │
├─────────────────────────────────────────────────────────────────────┤
│                     DOMAIN LAYER                                    │
│  Interfaces (Entities) · Tipos puros                                │
│  IUser · ISpecie · IProcessogram · IProcessogramData                │
├─────────────────────────────────────────────────────────────────────┤
│                     INFRASTRUCTURE LAYER                            │
│  Models (Mongoose) · Database · Services · Config                   │
│  GCS · Gemini · SVGO · Puppeteer · Sharp · Multer                   │
└──────────┬──────────────────┬──────────────────┬────────────────────┘
           │                  │                  │
           ▼                  ▼                  ▼
     ┌──────────┐    ┌──────────────┐    ┌────────────┐
     │ MongoDB  │    │ Google Cloud │    │  Google    │
     │ Atlas    │    │ Storage      │    │  Gemini    │
     └──────────┘    └──────────────┘    └────────────┘
```

---

## Estratégia de Deploy: Monolito Integrado

### Produção

Em produção, o Express serve o build estático do Next.js como middleware:

```
Express Server (:8080)
├── /api/v1/*        → API handlers (rotas Express)
└── /*               → next.js static export (HTML/JS/CSS)
```

O Next.js é compilado com `next build` e o output é servido pelo Express via `express.static()` ou via custom server integration. Isso elimina a necessidade de dois processos separados e simplifica o deploy em containers (Docker) ou Cloud Run.

### Desenvolvimento

Em desenvolvimento, frontend e backend rodam como processos separados para hot-reload independente:

```
┌────────────────────────┐     ┌────────────────────────┐
│  Next.js Dev Server    │     │  Express Dev Server    │
│  :3000                 │────►│  :8080                 │
│  (npm run dev)         │proxy│  (npm run dev)         │
└────────────────────────┘     └────────────────────────┘
```

O `next.config.ts` define `rewrites` para proxiar chamadas `/api/v1/*` para `http://localhost:8080/api/v1`, simulando o ambiente de produção.

---

## Camadas

### Domain (`src/domain/`)

Contém exclusivamente as **interfaces TypeScript** que definem a forma das entidades do sistema. Sem dependências externas, sem lógica, sem side effects.

```
src/domain/interfaces/
├── IUser.ts
├── ISpecie.ts
├── IProductionModule.ts
├── IProcessogram.ts
├── IProcessogramData.ts
└── IProcessogramQuestion.ts
```

**Princípio:** As interfaces de domínio são o contrato central. Todas as camadas acima referenciam essas interfaces, nunca implementações concretas de banco.

### Application (`src/application/`)

Orquestra os **fluxos de negócio** (Use Cases) e define as **interfaces de porta** (Ports) para serviços externos.

```
src/application/
├── interfaces/
│   ├── IStorageService.ts      # Port para storage (GCS)
│   └── ISvgProcessor.ts        # Port para processamento SVG
├── services/
│   └── AuthService.ts          # Hash, JWT, verificação
└── useCases/
    ├── auth/                   # Register, Login, Logout
    ├── species/                # CRUD
    ├── productionModules/      # CRUD
    ├── processogram/           # CRUD, Analyze
    ├── processogramData/       # List, Update (Human-in-the-Loop)
    ├── processogramQuestion/   # List, Update (Human-in-the-Loop)
    └── chat/                   # StreamChat (RAG + SSE)
```

**Princípio:** Cada Use Case é uma classe com um único método `execute()`. Validação de input via Zod schemas co-localizados no mesmo arquivo do Use Case.

### Infrastructure (`src/infrastructure/`)

Implementações concretas de **persistência**, **serviços externos** e **configuração**.

```
src/infrastructure/
├── config/
│   └── upload.ts               # Multer (MemoryStorage, SVG filter, 10MB)
├── database/
│   └── mongoose.ts             # Conexão MongoDB (pool, timeouts)
├── models/                     # Mongoose Schemas + Documents
│   ├── UserModel.ts
│   ├── SpecieModel.ts
│   ├── ProductionModuleModel.ts
│   ├── ProcessogramModel.ts
│   ├── ProcessogramDataModel.ts
│   └── ProcessogramQuestionModel.ts
└── services/
    ├── ai/
    │   ├── GeminiService.ts    # Bulk analysis + Chat streaming
    │   └── index.ts
    ├── storage/
    │   ├── GoogleStorageService.ts  # Upload, download, delete (ADC)
    │   └── index.ts
    └── svg/
        ├── SvgProcessorService.ts   # SVGO + Puppeteer + Sharp
        ├── plugins/                  # SVGO custom plugins
        └── index.ts
```

### Presentation (`src/presentation/`)

Camada HTTP: **controllers**, **routes** e **middlewares**. Responsável por traduzir HTTP requests em chamadas de Use Cases e formatar respostas.

```
src/presentation/
├── controllers/
│   ├── AuthController.ts
│   ├── SpecieController.ts
│   ├── ProductionModuleController.ts
│   ├── ProcessogramController.ts
│   ├── ProcessogramAIController.ts
│   ├── ProcessogramDataController.ts
│   ├── ProcessogramQuestionController.ts
│   └── ChatController.ts
├── middlewares/
│   ├── AuthMiddleware.ts        # JWT cookie verification
│   └── RoleMiddleware.ts        # RBAC (admin/user)
└── routes/
    ├── authRoutes.ts
    ├── specieRoutes.ts
    ├── productionModuleRoutes.ts
    ├── processogramRoutes.ts
    ├── processogramDataRoutes.ts
    ├── processogramQuestionRoutes.ts
    └── chatRoutes.ts
```

---

## Integrações Externas

### MongoDB (Atlas / Local)

- **Driver:** Mongoose 9.x
- **Pool:** 10 conexões
- **Timeouts:** 5s server selection, 45s socket
- **Uso:** Persistência de todas as entidades (Users, Species, ProductionModules, Processograms, ProcessogramData, ProcessogramQuestions)

### Google Cloud Storage

- **SDK:** `@google-cloud/storage` 7.x
- **Autenticação:** Application Default Credentials (ADC) — sem chaves JSON
- **Uso:** Armazenamento de SVGs otimizados e imagens rasterizadas (PNG)
- **Operações:** Upload, download (como texto/buffer), delete, delete por prefixo

### Google Gemini

- **SDK:** `@google/generative-ai` 0.24+
- **Modelos:**
  - `gemini-2.5-flash` — análise bulk de elementos (descrições técnicas), temperature 0.4, JSON mode
  - `gemini-2.5-flash` — geração de perguntas de quiz (1 por elemento), temperature 0.5, JSON mode
  - `gemini-2.5-flash` — chat contextual com streaming, temperature 0.3, system instruction com RAG
- **Uso:** Geração de descrições científicas e perguntas de quiz para elementos de processogramas, e chat interativo

### Puppeteer

- **Versão:** 24.x
- **Uso:** Rasterização de elementos SVG para imagens PNG
- **Ciclo de vida:** Browser per-request (não singleton) com timeout de 5 minutos e SIGKILL fallback
- **Modo:** Headless, sem sandbox, sem GPU

### SVGO

- **Versão:** 4.x
- **Uso:** Otimização de SVGs preservando IDs interativos
- **Config:** `preset-default` com `cleanupIds: false` + plugins customizados (`fixMissingSvgId`, `removeBxAttributes`)

### Sharp

- **Versão:** 0.34+
- **Uso:** Compressão de PNGs rasterizados (quality 80, compression level 9)

---

## Servidor (`src/server.ts`)

- **Express 5** com `express.json()`, `express.urlencoded()`, `cookie-parser`
- **Namespace:** Todas as rotas API sob `/api/v1` via `express.Router()`
- **Endpoint raiz:** `GET /` retorna status temporário (frontend em construção)
- **Timeout middleware** adaptativo:
  - 30s para rotas padrão
  - 360s (6 min) para POST/PUT de processogramas (SVG processing)
  - Sem timeout para `POST /api/v1/chat/stream` (SSE)
- **Graceful shutdown:** Captura SIGTERM/SIGINT, encerra browsers Puppeteer pendentes
- **Health check:** `GET /api/v1/health` com status, timestamp e environment

---

## Convenções

| Aspecto | Padrão |
|---------|--------|
| Nomenclatura de arquivos | `PascalCase` para classes, `camelCase` para utilitários |
| Nomenclatura de variáveis | `camelCase` |
| Interfaces de domínio | Prefixo `I` (ex: `IProcessogram`) |
| Validação | Zod schemas co-localizados nos Use Cases |
| Error handling | `throw new Error()` nos Use Cases, catch no Controller |
| TypeScript | Strict mode, target ES2020, CommonJS |
| Comentários | Apenas quando adicionam valor técnico não óbvio |
