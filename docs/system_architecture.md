# System Architecture

## Visão Geral

O WelfareData Backend segue os princípios de **Clean Architecture**, organizando o código em camadas concêntricas com dependência unidirecional: camadas internas não conhecem camadas externas. Essa abordagem garante testabilidade, manutenibilidade e independência de frameworks.

---

## Diagrama de Camadas

```
┌─────────────────────────────────────────────────────────────┐
│                     PRESENTATION                            │
│  Controllers · Routes · Middlewares (Auth, RBAC)            │
│  Express Request/Response · Zod Validation · SSE Streaming  │
├─────────────────────────────────────────────────────────────┤
│                     APPLICATION                             │
│  Use Cases · Services · Interfaces (Ports)                  │
│  Orquestração de fluxos · Regras de negócio                 │
├─────────────────────────────────────────────────────────────┤
│                     DOMAIN                                  │
│  Interfaces (Entities) · Tipos puros                        │
│  IUser · ISpecie · IProcessogram · IProcessogramData        │
├─────────────────────────────────────────────────────────────┤
│                     INFRASTRUCTURE                          │
│  Models (Mongoose) · Database · Services · Config           │
│  GCS · Gemini · SVGO · Puppeteer · Sharp · Multer           │
└─────────────────────────────────────────────────────────────┘
```

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
  - `gemini-2.5-flash` — chat contextual com streaming, temperature 0.3, system instruction com RAG
- **Uso:** Geração de descrições científicas de elementos de processogramas e chat interativo

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
- **Timeout middleware** adaptativo:
  - 30s para rotas padrão
  - 360s (6 min) para POST/PUT de processogramas (SVG processing)
  - Sem timeout para `POST /chat/stream` (SSE)
- **Graceful shutdown:** Captura SIGTERM/SIGINT, encerra browsers Puppeteer pendentes
- **Health check:** `GET /health` com status, timestamp e environment

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
