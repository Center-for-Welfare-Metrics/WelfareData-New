# Data Flow — Do Upload do SVG ao Chat Contextual

## Visão Geral

Este documento descreve o fluxo de dados crítico do WelfareData Backend, desde o momento em que um administrador faz upload de um arquivo SVG de processograma até a interação do usuário final via chat contextual com streaming. O fluxo é composto por cinco estágios sequenciais, cada um com responsabilidades bem definidas.

```
Upload SVG ──► Otimização & Rasterização ──► Enriquecimento IA ──► Persistência ──► Chat RAG
 (Multer)        (SVGO + Puppeteer)            (Gemini)            (MongoDB)       (SSE Stream)
```

---

## Passo 1: Upload & Validação

**Rota:** `POST /processograms`  
**Responsável:** `ProcessogramController.create` → `CreateProcessogramUseCase`  
**Middleware:** `AuthMiddleware` → `requireRole('admin')` → `uploadSvg.single('file')`

### Fluxo

1. O administrador envia um `multipart/form-data` com o arquivo SVG e metadados (`name`, `specieId`, `productionModuleId`).
2. **Multer** (MemoryStorage) intercepta o upload:
   - Valida MIME type: apenas `image/svg+xml`
   - Limita tamanho: máximo 10 MB
   - Armazena o arquivo em buffer (memória), sem gravar em disco
3. **Zod** valida os metadados no Use Case:
   - `name`: string obrigatória
   - `specieId`: ObjectId válido, existência verificada no banco
   - `productionModuleId`: ObjectId válido, existência verificada no banco
4. Um `identifier` UUID e `slug` são gerados para o processograma.
5. O status é definido como `processing`.

### Saída

Buffer SVG em memória + documento Processogram criado no MongoDB com status `processing`.

---

## Passo 2: Otimização SVGO & Rasterização Puppeteer

**Responsável:** `SvgProcessorService.process()`  
**Dependências:** SVGO 4, Puppeteer 24, Sharp, JSDOM

### Fluxo

```
SVG Buffer
    │
    ▼
┌──────────────────────────────────┐
│  SVGO Optimization               │
│  • preset-default                 │
│  • cleanupIds: false (CRÍTICO)    │
│  • fixMissingSvgIdPlugin          │
│  • removeBxAttributesPlugin       │
│  Resultado: SVG otimizado         │
│  preservando todos os IDs         │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  ID Extraction                    │
│  JSDOM parse → querySelectorAll   │
│  Regex: /(?:--|_)(ps|lf|ph|ci)   │
│  (?:[_-]\d+[_-]?)?$/             │
│  Resultado: lista de IDs          │
│  interativos com sufixo válido    │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  Puppeteer Rasterization          │
│  • Browser per-request            │
│  • Timeout: 5 min (Promise.race)  │
│  • Para cada ID:                  │
│    1. Carrega SVG na page         │
│    2. Extrai BBox via script      │
│    3. Clip e screenshot (PNG)     │
│    4. Sharp compression           │
│  • SIGKILL fallback on timeout    │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  Google Cloud Storage Upload      │
│  • SVG otimizado → GCS            │
│  • Cada PNG rasterizado → GCS     │
│  • Path: processograms/{id}/...   │
│  Resultado: URLs públicas          │
└──────────────────────────────────┘
```

### Configurações Críticas

| Parâmetro | Valor | Justificativa |
|-----------|-------|---------------|
| `cleanupIds` | `false` | IDs dos elementos são usados para rasterização e análise IA |
| Browser lifecycle | Per-request | Singleton causava server hang quando o browser morria |
| Timeout | 300.000ms | SVGs complexos podem ter centenas de elementos |
| Sharp quality | 80 | Balanço entre tamanho e qualidade visual |
| Sharp compression | 9 | Compressão máxima PNG |

### Regex de IDs Interativos

```
/(?:--|_)(ps|lf|ph|ci)(?:[_-]\d+[_-]?)?$/
```

Captura elementos cujo ID termina com um sufixo que indica seu nível hierárquico:

| Sufixo | Nível | Exemplo |
|--------|-------|---------|
| `ps` | Production System | `sow--ps`, `broiler_ps` |
| `lf` | Life-Fate | `laying_hen--lf`, `sow_lf` |
| `ph` | Phase | `growing--ph`, `brooding_ph` |
| `ci` | Circumstance | `crate--ci-42`, `feeder_ci_144_` |

### Saída

Processograma atualizado no MongoDB com URLs do SVG otimizado e mapa de imagens rasterizadas. Status muda para `ready`.

---

## Passo 3: Enriquecimento IA (Gemini — Descrições)

**Rota:** `POST /processograms/:id/analyze`  
**Responsável:** `AnalyzeProcessogramUseCase`  
**Dependências:** Cheerio, GeminiService

### Fluxo

1. O SVG otimizado é baixado do GCS como texto.
2. **Cheerio** faz parse do SVG e extrai todos os elementos com `[id]`.
3. Para cada ID que satisfaz o regex de sufixo:
   - **Level** é extraído do sufixo (`ps` → `production system`, etc.)
   - **Name** é humanizado a partir do ID (ex: `laying_hen` → `laying hen`)
   - **Parents** são extraídos pela hierarquia DOM (ancestrais com IDs válidos)
4. O array de `ElementInput` é enviado ao **Gemini 2.5 Flash** com um prompt especializado em ciência animal.
5. O modelo retorna JSON com descrições de 3–6 sentenças para cada elemento.
6. Descrições são persistidas via **bulk upsert** no `ProcessogramDataModel`.

### Prompt

O prompt instrui o modelo a atuar como cientista animal especializado em sistemas de produção, gerando descrições baseadas em:
- Nível hierárquico do elemento (production system, life-fate, phase, circumstance)
- Espécie em foco (inferida dos pais hierárquicos)
- Condições comerciais representativas
- Impactos na qualidade de vida dos animais

### Configuração

| Parâmetro | Valor |
|-----------|-------|
| Model | `gemini-2.5-flash` |
| Temperature | 0.4 |
| Response format | `application/json` |

### Saída

Registros `ProcessogramData` no MongoDB: um por elemento, com `processogramId`, `elementId`, `description`.

---

## Passo 4: Persistência & Human-in-the-Loop

**Rotas de leitura:**
- `GET /processograms/:processogramId/data` — lista descrições
- `GET /processograms/:processogramId/questions` — lista questões

**Rotas de edição (admin):**
- `PUT /processogram-data/:id` — edita descrição/videoUrl
- `PUT /processogram-questions/:id` — edita questão

### Modelos

```
ProcessogramData
├── processogramId (ref → Processogram)
├── elementId (string, indexed)
├── description (string)
├── videoUrl (string, optional)
└── Compound unique index: {processogramId, elementId}

ProcessogramQuestion
├── processogramId (ref → Processogram)
├── elementId (string, indexed)
├── question (string)
├── options ([string])
├── correctAnswerIndex (number)
└── Compound index: {processogramId, elementId} (não unique)
```

### Fluxo Human-in-the-Loop

1. IA gera descrições brutas (Passo 3)
2. Administrador revisa via `GET .../data`
3. Administrador corrige via `PUT /processogram-data/:id`
4. Descrições validadas ficam disponíveis para o Chat (Passo 5)

---

## Passo 5: Consumo via Chat Streaming (RAG Simplificado)

**Rota:** `POST /chat/stream`  
**Responsável:** `StreamChatUseCase` → `ChatController`  
**Protocolo:** Server-Sent Events (SSE)

### Fluxo

```
Cliente
    │
    ▼ POST /chat/stream
    │ { processogramId, message, history }
    │
    ▼
┌──────────────────────────────────┐
│  StreamChatUseCase                │
│  1. Valida input (Zod)            │
│  2. Busca Processogram (404?)     │
│  3. Busca ProcessogramData        │
│     pelo processogramId           │
│  4. Monta System Instruction      │
│     com todas as descrições       │
│  5. Chama gemini.streamChat()     │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  GeminiService.streamChat()       │
│  • Model: gemini-2.5-flash        │
│  • Temperature: 0.3               │
│  • systemInstruction: context RAG │
│  • History: mensagens anteriores  │
│  • sendMessageStream(message)     │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  ChatController (SSE Pipe)        │
│  Headers:                         │
│    Content-Type: text/event-stream│
│    Cache-Control: no-cache        │
│    Connection: keep-alive         │
│  Para cada chunk:                 │
│    → data: {"text":"..."}\n\n     │
│  Ao finalizar:                    │
│    → data: [DONE]\n\n             │
│  Desconexão cliente:              │
│    → break loop, sem crash        │
└──────────────────────────────────┘
```

### RAG Simplificado

O contexto é montado pela concatenação de todas as descrições do processograma no `systemInstruction`:

```
Você é um especialista em bem-estar animal e sistemas de produção.
O usuário está visualizando um diagrama de processograma com os seguintes elementos técnicos:

- [sow--ps]: Sistema de produção de suínos reprodutoras...
- [sow--lf]: Caminho de vida da matriz suína...
- [growing--ph]: Fase de crescimento com duração de...
...

Responda com base nesses dados técnicos.
```

**Fallback (sem descrições):** Se o processograma ainda não foi analisado, o modelo é instruído a informar educadamente e responder genericamente.

### Configuração

| Parâmetro | Valor | Justificativa |
|-----------|-------|---------------|
| Model | `gemini-2.5-flash` | Otimizado para streaming e baixa latência |
| Temperature | 0.3 | Foco em respostas factuais |
| Timeout | Nenhum (SSE) | Conexão mantida até encerramento |

---

## Diagrama Completo

```
                    ┌──────────┐
                    │  Admin   │
                    └────┬─────┘
                         │
              ┌──────────▼──────────┐
              │  POST /processograms │
              │  (Upload SVG)        │
              └──────────┬──────────┘
                         │
              ┌──────────▼──────────┐
              │  SVGO + Puppeteer    │
              │  + Sharp + GCS       │
              └──────────┬──────────┘
                         │
              ┌──────────▼──────────┐
              │  POST /:id/analyze   │
              │  (Gemini Bulk)       │
              └──────────┬──────────┘
                         │
              ┌──────────▼──────────┐
              │  Human-in-the-Loop   │
              │  GET/PUT data        │
              └──────────┬──────────┘
                         │
                    ┌────▼─────┐
                    │  MongoDB │
                    └────┬─────┘
                         │
              ┌──────────▼──────────┐
              │  POST /chat/stream   │◄── User
              │  (RAG + SSE)         │
              └─────────────────────┘
```
