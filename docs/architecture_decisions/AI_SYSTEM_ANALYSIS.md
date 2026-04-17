# WelfareData — Análise Completa do Sistema de IA, Descrições e Chat

> Documento gerado automaticamente a partir da análise do código-fonte.
> Nenhum arquivo foi alterado.

---

## Índice

1. [Geração de Descrições (Q1–Q7)](#geração-de-descrições)
2. [Geração de Questões (Q8–Q10)](#geração-de-questões)
3. [Endpoints de Dados Públicos (Q11–Q13)](#endpoints-de-dados-públicos)
4. [Chat com IA (Q14–Q17)](#chat-com-ia)
5. [Fluxo Completo (Q18–Q20)](#fluxo-completo)

---

## Geração de Descrições

### Q1 — Onde exatamente as descrições são geradas?

As descrições são geradas pela seguinte cadeia de arquivos:

| Camada | Arquivo | Função/Classe |
|--------|---------|---------------|
| Rota | `src/presentation/routes/processogramRoutes.ts` | `POST /:id/analyze` |
| Controller | `src/presentation/controllers/ProcessogramAIController.ts` | `ProcessogramAIController.analyze()` |
| UseCase | `src/application/useCases/processogram/AnalyzeProcessogramUseCase.ts` | `AnalyzeProcessogramUseCase.execute()` |
| Processor | `src/application/services/ProcessogramProcessor.ts` | `ProcessogramProcessor.execute()` |
| AI Service | `src/infrastructure/services/ai/GeminiService.ts` | `GeminiService.generateBulkAnalysis()` |
| Prompts | `src/infrastructure/services/ai/prompts.ts` | `buildDescriptionPrompt()` |

**Fluxo interno do `ProcessogramProcessor.execute()`:**

```typescript
// src/application/services/ProcessogramProcessor.ts

// 1. Parse do SVG para extrair elementos
const elements = this.svgParser.parse(svgContent);

// 2. Chamada ao Gemini para gerar descrições em bulk
const analysis = await gemini.generateBulkAnalysis(elements);

// 3. Bulk write das descrições no MongoDB
const dataOps = analysis.elements.map((el) => ({
  updateOne: {
    filter: { processogramId, elementId: el.elementId },
    update: {
      $set: { description: el.description, updatedAt: new Date() },
      $setOnInsert: { processogramId, elementId: el.elementId, createdAt: new Date() },
    },
    upsert: true,
  },
}));
await ProcessogramDataModel.bulkWrite(dataOps);

// 4. Chamada ao Gemini para gerar questões (usando as descrições)
const questionsResult = await gemini.generateBulkQuestions(elementsWithDescriptions);

// 5. Bulk write das questões no MongoDB
await ProcessogramQuestionModel.bulkWrite(questionOps);
```

---

### Q2 — Quando são geradas?

As descrições **NÃO são geradas durante o upload do SVG**. São geradas em **momento separado**, via endpoint dedicado:

```
POST /api/v1/processograms/:id/analyze
```

- Requer autenticação (`AuthMiddleware`) e role `admin` (`requireRole('admin')`)
- Definido em `src/presentation/routes/processogramRoutes.ts`:

```typescript
router.post('/:id/analyze', AuthMiddleware, requireRole('admin'), ProcessogramAIController.analyze);
```

**O fluxo é:**
1. Admin faz upload do SVG → `POST /processograms` (cria o processograma, otimiza SVG, rasteriza elementos)
2. Admin dispara análise de IA → `POST /processograms/:id/analyze` (gera descrições + questões)

O `AnalyzeProcessogramUseCase` baixa o SVG do Google Cloud Storage e passa para o processor:

```typescript
// src/application/useCases/processogram/AnalyzeProcessogramUseCase.ts
const storage = getStorageService();
const svgContent = await storage.downloadAsText(processogram.svg_url_light);
const processor = new ProcessogramProcessor();
const result = await processor.execute(processogramId, svgContent);
```

---

### Q3 — Como o Gemini AI é chamado? Qual prompt? Streaming ou chamada única?

**Serviço:** `src/infrastructure/services/ai/GeminiService.ts`

**Modelo:** `gemini-2.5-flash`

**Chamada ÚNICA (não streaming)** — usa `model.generateContent()`:

```typescript
// src/infrastructure/services/ai/GeminiService.ts
async generateBulkAnalysis(elements: ElementInput[]): Promise<BulkAnalysisResult> {
  const model = this.genAI.getGenerativeModel({
    model: this.modelName,              // 'gemini-2.5-flash'
    generationConfig: {
      responseMimeType: 'application/json', // Força resposta JSON
      temperature: 0.4,
    },
  });

  const prompt = buildDescriptionPrompt(elementsPayload);
  const result = await model.generateContent(prompt);
  const text = result.response.text();
  return JSON.parse(text) as BulkAnalysisResult;
}
```

**Prompt completo (System + User):**

O prompt é construído por `buildDescriptionPrompt()` em `src/infrastructure/services/ai/prompts.ts`:

```typescript
export const DESCRIPTION_SYSTEM_PROMPT = `You are an animal scientist specializing in animal production systems.

Your task is to generate clear, accurate, and insightful descriptions of components in detailed
diagrams of animal production processes, based on the component's level and name. The level may be
production system (root level, overarching process), life-fate (animal's path or destiny),
phase (temporal stage), or circumstance (localized structure, space, equipment, operation, or animal
in context). Always base descriptions on established and verifiable scientific knowledge, focusing on
biological, commercial, and operational relevance, and highlight aspects affecting animal quality of
life (e.g., stress, injury risks, behavioral responses) when relevant to the component.

Important:
- Focus the description strictly on the named component, using the parent hierarchy only for brief
  contextual framing (e.g., "within [parent phase]") without shifting emphasis.
- Always integrate the species in focus, inferring from parents if not explicit, and tailor details
  to species-specific traits.
- Keep descriptions concise (3-6 sentences), neutral, grounded on representative commercial
  conditions, avoiding speculation.
- If the item is a 'production system', describe the overall production process, its structure,
  key sequences, typical stocking densities, housing conditions, light and feed schedules,
  water or air quality, husbandry procedures, commercial goals, and broad welfare implications.
- If the item is a 'life-fate', describe the animal type following this path, characterizing how it
  is used, its experience, key life stages, and welfare factors like housing conditions, space
  available, stocking densities, light schedules, whether the environment is barren or enriched,
  or typical husbandry procedures.
- If the item is a 'phase', describe the typical duration under commercial conditions, any
  differences with previous phases, changes in housing/environmental conditions, biological/
  commercial relevance, role in the sequence, and relevant quality of life impacts.
- If the item is a 'circumstance', describe it as a localized structure, space, equipment element
  animals interact with or an animal itself in that context, including function, design features,
  and direct welfare effects.
- If no parents are provided, treat the level as the root production system.
- If input is invalid or incomplete, output JSON with "description": "Error: Invalid input -
  [brief reason]".`;
```

**Payload enviado ao Gemini:**

```json
{
  "elements": [
    {
      "elementId": "laying-hen--lf",
      "level": "life-fate",
      "name": "laying hen",
      "parents": "production system - egg production"
    }
  ]
}
```

**Output format esperado:**

```json
{
  "elements": [
    {
      "elementId": "laying-hen--lf",
      "description": "Laying hens in egg production systems... (3-6 sentenças)"
    }
  ]
}
```

---

### Q4 — O que exatamente é gerado por elemento?

Para cada elemento, o sistema gera **dois artefatos em chamadas separadas**:

#### A. Descrição (3–6 sentenças)
- Campo: `description` (String)
- Conteúdo adaptado ao nível:
  - **production system** → Processo geral, sequências, densidades, alojamento, welfare amplo
  - **life-fate** → Tipo de animal, experiência, estágios, condições habitacionais, welfare
  - **phase** → Duração, diferenças da fase anterior, mudanças ambientais, relevância biológica
  - **circumstance** → Estrutura/equipamento, função, design, efeitos diretos no bem-estar

#### B. Questão de Múltipla Escolha (1 por elemento)
- Campos: `question`, `options` (4 strings), `correctAnswerIndex` (0–3)
- Gerada **depois** das descrições, usando-as como contexto

**NÃO são gerados** outros campos como título ou tags — apenas `description` e a questão associada.

---

### Q5 — Como os IDs dos elementos SVG são extraídos?

**Parser:** `src/domain/services/SvgParser.ts`

**Tecnologia:** **Cheerio** (parser XML/HTML server-side)

```typescript
// src/domain/services/SvgParser.ts
import * as cheerio from 'cheerio';

const ANALYZABLE_PATTERN = /(?:--|_)(ps|lf|ph|ci)(?:[_-]\d+[_-]?)?$/;

export class SvgParser {
  parse(svgContent: string): ParsedElement[] {
    const $ = cheerio.load(svgContent, { xml: true });
    const elements: ParsedElement[] = [];

    $('[id]').each((_, el) => {
      const id = $(el).attr('id');
      if (!id || !isAnalyzableId(id)) return;

      // Sobe na árvore DOM para encontrar pais semânticos
      const parentIds: string[] = [];
      let current = $(el).parent();
      while (current.length && current[0].type === 'tag' && (current[0] as any).name !== 'svg') {
        const parentId = current.attr('id');
        if (parentId && isAnalyzableId(parentId)) {
          parentIds.unshift(parentId);
        }
        current = current.parent();
      }

      elements.push({
        elementId: id,
        level: extractLevel(id),    // ps → "production system", lf → "life-fate", etc.
        name: extractName(id),      // Remove sufixo de nível, limpa separadores
        parents: buildParentString(parentIds), // "production system - egg production, life-fate - laying hen"
      });
    });

    return elements;
  }
}
```

**Padrão regex para IDs analisáveis:**

```
/(?:--|_)(ps|lf|ph|ci)(?:[_-]\d+[_-]?)?$/
```

**Exemplos de IDs válidos:**

| ID no SVG | Nível | Nome |
|-----------|-------|------|
| `laying-hen--lf` | life-fate | laying hen |
| `pig--ci-54` | circumstance | pig |
| `sow--focus--ph-1` | phase | sow focus |
| `gestation--ps` | production system | gestation |

**Mapa de níveis:**

```typescript
const LEVEL_MAP: Record<string, string> = {
  ps: 'production system',
  lf: 'life-fate',
  ph: 'phase',
  ci: 'circumstance',
};
```

---

### Q6 — Descrições são geradas para TODOS os níveis?

**SIM.** O `SvgParser` extrai elementos dos **4 níveis**: `ps`, `lf`, `ph`, `ci`.

O filtro é apenas o regex `ANALYZABLE_PATTERN` — qualquer elemento com ID terminando em `--ps`, `--lf`, `--ph`, `--ci` (com ou sem número) é incluído.

**Todos** os elementos extraídos são enviados em uma única chamada bulk ao Gemini:

```typescript
const analysis = await gemini.generateBulkAnalysis(elements); // TODOS os elementos de uma vez
```

---

### Q7 — Como as descrições são salvas no MongoDB?

#### Collection: `processogramdatas`

**Model:** `src/infrastructure/models/ProcessogramDataModel.ts`

```typescript
const ProcessogramDataSchema = new Schema<IProcessogramDataDocument>(
  {
    processogramId: { type: String, required: true, ref: 'Processogram', index: true },
    elementId:      { type: String, required: true, index: true },
    description:    { type: String, required: true },
    videoUrl:       { type: String },  // Campo opcional (não gerado pela IA)
  },
  {
    timestamps: true,   // Cria createdAt e updatedAt automáticos
    versionKey: false,
  }
);

// Índice composto único — impede duplicatas
ProcessogramDataSchema.index({ processogramId: 1, elementId: 1 }, { unique: true });
```

**Estratégia de escrita:** Bulk write com `upsert: true` (idempotente — re-analisar não cria duplicatas):

```typescript
const dataOps = analysis.elements.map((el) => ({
  updateOne: {
    filter: { processogramId, elementId: el.elementId },
    update: {
      $set: { description: el.description, updatedAt: new Date() },
      $setOnInsert: { processogramId, elementId: el.elementId, createdAt: new Date() },
    },
    upsert: true,
  },
}));
await ProcessogramDataModel.bulkWrite(dataOps);
```

---

## Geração de Questões

### Q8 — Questões são geradas no mesmo momento que as descrições?

**São geradas no mesmo fluxo (mesma chamada de `/analyze`), mas em etapa sequencial separada.**

Dentro de `ProcessogramProcessor.execute()`:

1. **Primeiro:** Gera descrições via `gemini.generateBulkAnalysis(elements)`
2. **Depois:** Usa as descrições como contexto para gerar questões via `gemini.generateBulkQuestions(elementsWithDescriptions)`

```typescript
// src/application/services/ProcessogramProcessor.ts

// Etapa 1: Descrições
const analysis = await gemini.generateBulkAnalysis(elements);
// ... salva descrições ...

// Etapa 2: Questões (usa as descrições da Etapa 1)
if (descriptionsMap.size > 0) {
  const elementsWithDescriptions = elements
    .filter((el) => descriptionsMap.has(el.elementId))
    .map((el) => ({
      elementId: el.elementId,
      level: el.level,
      name: el.name,
      parents: el.parents,
      description: descriptionsMap.get(el.elementId)!,  // ← descrição gerada na Etapa 1
    }));

  const questionsResult = await gemini.generateBulkQuestions(elementsWithDescriptions);
}
```

**Modelo e config para questões:**

```typescript
// GeminiService.generateBulkQuestions()
const model = this.genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: {
    responseMimeType: 'application/json',
    temperature: 0.5,           // Ligeiramente mais criativo que descrições (0.4)
  },
});
```

---

### Q9 — Qual é o formato das questões geradas?

**Múltipla escolha** com exatamente 4 opções:

```json
{
  "questions": [
    {
      "elementId": "laying-hen--lf",
      "question": "What is the typical stocking density for laying hens in enriched colony systems?",
      "options": [
        "200 cm²/bird",
        "450 cm²/bird",
        "750 cm²/bird",
        "1200 cm²/bird"
      ],
      "correctAnswerIndex": 2
    }
  ]
}
```

**Prompt de questões (`QUESTIONS_SYSTEM_PROMPT`):**

```typescript
export const QUESTIONS_SYSTEM_PROMPT = `You are an experienced university professor in animal science
and animal welfare, designing challenging yet fair multiple-choice questions for graduate-level students.

Your task is to create educational assessment questions about specific components in animal production
process diagrams. Each question must:
- Directly test knowledge about the specific element described, not general animal science.
- Be based on scientifically established facts relevant to the component.
- Include exactly 4 options (A, B, C, D) where only one is correct.
- Use plausible distractors that test genuine understanding.
- Cover aspects such as: welfare implications, design purposes, biological relevance, commercial
  impact, duration/timing, environmental conditions, or species-specific considerations.
- Be written in English, clear, and unambiguous.

Important:
- The correctAnswerIndex is 0-based (0 = A, 1 = B, 2 = C, 3 = D).
- Generate exactly 1 question per element.`;
```

**Validação antes de salvar:**

```typescript
const questionOps = questionsResult.questions
  .filter((q) => q.options?.length === 4 && typeof q.correctAnswerIndex === 'number')
  // ...
```

---

### Q10 — Como as questões são salvas no MongoDB?

#### Collection: `processogramquestions`

**Model:** `src/infrastructure/models/ProcessogramQuestionModel.ts`

```typescript
const ProcessogramQuestionSchema = new Schema<IProcessogramQuestionDocument>(
  {
    processogramId:   { type: String, required: true, ref: 'Processogram', index: true },
    elementId:        { type: String, required: true, index: true },
    question:         { type: String, required: true },
    options:          { type: [String], required: true },       // Array de 4 strings
    correctAnswerIndex: { type: Number, required: true },       // 0-based (0=A, 1=B, 2=C, 3=D)
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

ProcessogramQuestionSchema.index({ processogramId: 1, elementId: 1 });
```

**Escrita:** Mesmo padrão bulk upsert das descrições:

```typescript
const questionOps = questionsResult.questions
  .filter((q) => q.options?.length === 4 && typeof q.correctAnswerIndex === 'number')
  .map((q) => ({
    updateOne: {
      filter: { processogramId, elementId: q.elementId },
      update: {
        $set: {
          question: q.question,
          options: q.options,
          correctAnswerIndex: q.correctAnswerIndex,
          updatedAt: new Date(),
        },
        $setOnInsert: { processogramId, elementId: q.elementId, createdAt: new Date() },
      },
      upsert: true,
    },
  }));
await ProcessogramQuestionModel.bulkWrite(questionOps);
```

---

## Endpoints de Dados Públicos

### Q11 — GET /processograms/:id/data/public

| Aspecto | Detalhe |
|---------|---------|
| Rota | `GET /api/v1/processograms/:processogramId/data/public` |
| Auth | **Público** (sem autenticação) |
| Controller | `ProcessogramDataController.listByProcessogram()` |
| UseCase | `ListProcessogramDataUseCase.execute()` |

**O que retorna:** Array com **TODOS** os elementos de uma vez (não paginado, não filtrado por elementId):

```json
[
  {
    "id": "665a1b2c3d4e5f6a7b8c9d0e",
    "processogramId": "665a1b2c3d4e5f6a7b8c9d0f",
    "elementId": "laying-hen--lf",
    "description": "Laying hens in egg production systems typically...",
    "videoUrl": null,
    "createdAt": "2025-06-01T10:00:00.000Z",
    "updatedAt": "2025-06-01T10:00:00.000Z"
  },
  {
    "id": "...",
    "processogramId": "...",
    "elementId": "growing--ph-1",
    "description": "The growing phase typically lasts...",
    "videoUrl": null,
    "createdAt": "...",
    "updatedAt": "..."
  }
]
```

**Código do UseCase:**

```typescript
// src/application/useCases/processogramData/ListProcessogramDataUseCase.ts
async execute(processogramId: string) {
  const processogram = await ProcessogramModel.findById(processogramId);
  if (!processogram) throw new Error('Processogram not found');

  const data = await ProcessogramDataModel.find({ processogramId }).sort({ elementId: 1 });

  return data.map((item) => ({
    id: item._id.toString(),
    processogramId: item.processogramId,
    elementId: item.elementId,
    description: item.description,
    videoUrl: item.videoUrl,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }));
}
```

**A filtragem por `elementId` é feita no frontend** (dentro do `SidePanel.tsx`):

```typescript
const match = items.find((d) => d.elementId === selectedElementId);
```

---

### Q12 — GET /processograms/:id/questions/public

| Aspecto | Detalhe |
|---------|---------|
| Rota | `GET /api/v1/processograms/:processogramId/questions/public` |
| Auth | **Público** (sem autenticação) |
| Controller | `ProcessogramQuestionController.listByProcessogram()` |
| UseCase | `ListProcessogramQuestionsUseCase.execute()` |

**Retorna TODAS as questões de uma vez**, ordenadas por `elementId` e `createdAt`:

```json
[
  {
    "id": "665a1b2c3d4e5f6a7b8c9d10",
    "processogramId": "665a1b2c3d4e5f6a7b8c9d0f",
    "elementId": "laying-hen--lf",
    "question": "What is the typical stocking density for laying hens?",
    "options": ["200 cm²/bird", "450 cm²/bird", "750 cm²/bird", "1200 cm²/bird"],
    "correctAnswerIndex": 2,
    "createdAt": "2025-06-01T10:00:00.000Z",
    "updatedAt": "2025-06-01T10:00:00.000Z"
  }
]
```

**Código do UseCase:**

```typescript
// src/application/useCases/processogramQuestion/ListProcessogramQuestionsUseCase.ts
const questions = await ProcessogramQuestionModel.find({ processogramId }).sort({
  elementId: 1,
  createdAt: 1,
});
```

**Filtragem por `elementId` feita no frontend:**

```typescript
const matching = allQuestions
  .filter((q) => q.elementId === selectedElementId)
  .map((q) => q.question);
setSuggestedQuestions(matching);
```

---

### Q13 — Há alguma lógica de cache?

**Não há Redis nem cache em memória no servidor para estes endpoints.**

| Componente | Estratégia | Detalhe |
|-----------|-----------|---------|
| `/data/public` | Nenhum cache server-side | Fetch direto do MongoDB |
| `/questions/public` | Nenhum cache server-side | Fetch direto do MongoDB |
| `GET /:id` (processogram) | HTTP Cache Header | `Cache-Control: public, max-age=3600` |
| Arquivos SVG no GCS | HTTP Cache Header | `Cache-Control: public, max-age=31536000` (1 ano) |
| Chat stream | `no-cache` | `Cache-Control: no-cache` (streaming real-time) |
| Raster Images (frontend) | In-memory Map | `usePrefetchRaster` hook mantém `Map<string, HTMLImageElement>` |

---

## Chat com IA

### Q14 — POST /processograms/:id/chat/stream

| Aspecto | Detalhe |
|---------|---------|
| Rota | `POST /api/v1/processograms/:processogramId/chat/stream` |
| Auth | **Público** (sem AuthMiddleware na rota!) |
| Controller | `ChatController.stream()` |
| UseCase | `StreamChatUseCase.execute()` |
| AI Service | `GeminiService.streamChat()` |

**Request body:**

```json
{
  "message": "Como funciona o alojamento nesta fase?",
  "history": [
    { "role": "user", "parts": "mensagem anterior do usuário" },
    { "role": "model", "parts": "resposta anterior da IA" }
  ]
}
```

**Validação com Zod:**

```typescript
// src/application/useCases/chat/StreamChatUseCase.ts
export const StreamChatSchema = z.object({
  processogramId: z.string().min(1, 'processogramId is required'),
  message: z.string().min(1, 'message is required'),
  history: z.array(z.object({
    role: z.enum(['user', 'model']),
    parts: z.string().min(1),
  })).default([]),
});
```

**Como o contexto é construído:**

O `StreamChatUseCase` busca **TODAS** as descrições do processograma e monta o system prompt:

```typescript
// src/application/useCases/chat/StreamChatUseCase.ts
const descriptions = await ProcessogramDataModel.find({
  processogramId: data.processogramId,
}).sort({ elementId: 1 });

let context: string;

if (descriptions.length === 0) {
  context = 'Você é um especialista em bem-estar animal e sistemas de produção. ' +
    'O usuário está visualizando um diagrama de processograma, mas ainda não há ' +
    'descrições técnicas geradas para os elementos. Informe educadamente que os dados ' +
    'ainda não foram processados e responda de forma genérica com base no seu conhecimento.';
} else {
  const elementsList = descriptions
    .map((d) => `- [${d.elementId}]: ${d.description}`)
    .join('\n');

  context = 'Você é um especialista em bem-estar animal e sistemas de produção. ' +
    'O usuário está visualizando um diagrama de processograma com os seguintes ' +
    'elementos técnicos:\n\n' + elementsList +
    '\n\nResponda com base nesses dados técnicos. Seja preciso, objetivo e cite os ' +
    'elementos pelo nome quando relevante. Se a pergunta do usuário não tiver relação ' +
    'com os dados do diagrama, responda educadamente que seu foco é auxiliar na ' +
    'compreensão do processograma.';
}
```

**Como o `elementId` atual é usado:**

O contexto do elemento é injetado **pelo frontend** no corpo da mensagem (não como campo separado):

```typescript
// frontend/src/components/chat/ChatWidget.tsx
const fullMessage = elementContext
  ? `[Contexto: Elemento selecionado "${elementContext}"]\n\n${trimmed}`
  : trimmed;
```

Ou seja, a mensagem que chega ao server pode ser:
```
[Contexto: Elemento selecionado "laying-hen--lf"]

Como funciona o alojamento nesta fase?
```

O Gemini recebe isso como `userMessage` + tem todas as descrições no `systemInstruction`.

---

### Q15 — Streaming SSE — implementação

**Headers enviados:**

```typescript
// src/presentation/controllers/ChatController.ts
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');
res.setHeader('Connection', 'keep-alive');
res.flushHeaders();
```

**Formato dos chunks:**

```
data: {"text":"O alojamento nesta "}\n\n
data: {"text":"fase utiliza gaiolas "}\n\n
data: {"text":"enriquecidas com..."}\n\n
data: [DONE]\n\n
```

**Implementação do streaming:**

```typescript
// src/presentation/controllers/ChatController.ts
let clientDisconnected = false;
req.on('close', () => { clientDisconnected = true; });

try {
  for await (const chunk of streamResult.stream) {
    if (clientDisconnected) break;
    const text = chunk.text();
    if (text) {
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    }
  }
  if (!clientDisconnected) {
    res.write('data: [DONE]\n\n');
  }
} catch (error: any) {
  if (!clientDisconnected) {
    res.write(`data: ${JSON.stringify({ error: 'Stream interrupted' })}\n\n`);
  }
} finally {
  if (!clientDisconnected) {
    res.end();
  }
}
```

**No Gemini, usa `sendMessageStream()`:**

```typescript
// src/infrastructure/services/ai/GeminiService.ts
async streamChat(context: string, userMessage: string, history: ChatMessage[]) {
  const model = this.genAI.getGenerativeModel({
    model: this.modelName,
    generationConfig: { temperature: 0.3 },
    systemInstruction: context,           // ← System prompt com todas as descrições
  });

  const chatHistory: Content[] = history.map((msg) => ({
    role: msg.role,
    parts: [{ text: msg.parts }],
  }));

  const chat = model.startChat({ history: chatHistory });
  const result = await chat.sendMessageStream(userMessage);
  return result;
}
```

**Parsing no frontend (`ChatWidget.tsx`):**

```typescript
const reader = res.body?.getReader();
const decoder = new TextDecoder();
let buffer = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data: ")) continue;
    const payload = trimmed.slice(6);
    if (payload === "[DONE]") return;

    try {
      const parsed = JSON.parse(payload);
      if (parsed.error) throw new Error(parsed.error);
      if (parsed.text) onChunk(parsed.text);
    } catch { /* skip malformed chunk */ }
  }
}
```

---

### Q16 — O chat tem histórico de mensagens?

**SIM, mas apenas no CLIENTE (in-memory, não persistido).**

- O estado `messages` vive em `useState<ChatMessage[]>()` dentro do `ChatWidget.tsx`
- **Não é salvo** no banco de dados nem no servidor
- É **perdido** ao recarregar a página ou trocar de elemento
- A cada mensagem, o **histórico completo** é enviado no request body como `history`:

```typescript
// frontend/src/components/chat/ChatWidget.tsx
const historyForApi = messages.map((m) => ({
  role: m.role,
  parts: m.parts,
}));

await streamChat(processogramId, fullMessage, historyForApi, onChunk, signal);
```

O servidor usa esse `history` para iniciar um chat com contexto no Gemini:

```typescript
const chat = model.startChat({ history: chatHistory });
const result = await chat.sendMessageStream(userMessage);
```

---

### Q17 — Qual é o system prompt do chat?

**Com descrições disponíveis:**

```
Você é um especialista em bem-estar animal e sistemas de produção.
O usuário está visualizando um diagrama de processograma com os seguintes elementos técnicos:

- [laying-hen--lf]: Laying hens in egg production systems typically experience...
- [growing--ph-1]: The growing phase typically lasts 4-6 weeks...
- [feeding-trough--ci-3]: The feeding trough is a localized structure...

Responda com base nesses dados técnicos. Seja preciso, objetivo e cite os elementos pelo nome
quando relevante. Se a pergunta do usuário não tiver relação com os dados do diagrama, responda
educadamente que seu foco é auxiliar na compreensão do processograma.
```

**Sem descrições (fallback):**

```
Você é um especialista em bem-estar animal e sistemas de produção.
O usuário está visualizando um diagrama de processograma, mas ainda não há descrições técnicas
geradas para os elementos. Informe educadamente que os dados ainda não foram processados e
responda de forma genérica com base no seu conhecimento.
```

**O contexto do elemento selecionado** é injetado pela mensagem do usuário (prefixo `[Contexto: ...]`), não por um campo dedicado no system prompt.

---

## Fluxo Completo

### Q18 — Fluxo do Upload do SVG até a Descrição no SidePanel

```
ETAPA 1: UPLOAD E PROCESSAMENTO DO SVG
═══════════════════════════════════════

[Admin] POST /api/v1/processograms (multipart/form-data)
  │
  ├─ processogramRoutes.ts → AuthMiddleware + requireRole('admin') + multerDebug
  │
  └─ ProcessogramController.create()
       │
       ├─ CreateProcessogramUseCase.execute()
       │    ├─ Salva Processogram no MongoDB (status: "processing")
       │    ├─ SvgProcessorService → SVGO otimização + normalizeSemanticIds plugin
       │    │   └─ Worker Thread (não bloqueia event loop)
       │    ├─ Puppeteer → Rasterização de cada elemento semântico (2x DPI PNG)
       │    ├─ GoogleStorageService → Upload SVG + PNGs para GCS
       │    └─ Atualiza Processogram (status: "ready", svg_url, raster_images)
       │
       └─ Responde 201 com processograma criado


ETAPA 2: ANÁLISE DE IA (SEPARADA)
══════════════════════════════════

[Admin] POST /api/v1/processograms/:id/analyze
  │
  ├─ processogramRoutes.ts → AuthMiddleware + requireRole('admin')
  │
  └─ ProcessogramAIController.analyze()
       │
       └─ AnalyzeProcessogramUseCase.execute()
            │
            ├─ ProcessogramModel.findById() → busca processograma
            ├─ GoogleStorageService.downloadAsText() → baixa SVG do GCS
            │
            └─ ProcessogramProcessor.execute(processogramId, svgContent)
                 │
                 ├─ SvgParser.parse(svgContent) [Cheerio]
                 │   └─ Extrai ParsedElement[] { elementId, level, name, parents }
                 │
                 ├─ GeminiService.generateBulkAnalysis(elements)
                 │   ├─ buildDescriptionPrompt() → monta prompt JSON
                 │   ├─ model.generateContent() → chamada única ao Gemini 2.5 Flash
                 │   └─ JSON.parse() → BulkAnalysisResult
                 │
                 ├─ ProcessogramDataModel.bulkWrite() → salva descrições (upsert)
                 │
                 ├─ GeminiService.generateBulkQuestions(elementsWithDescriptions)
                 │   ├─ buildQuestionsPrompt() → monta prompt JSON com descrições
                 │   ├─ model.generateContent() → chamada única ao Gemini 2.5 Flash
                 │   └─ JSON.parse() → BulkQuestionsResult
                 │
                 └─ ProcessogramQuestionModel.bulkWrite() → salva questões (upsert)


ETAPA 3: EXIBIÇÃO NO FRONTEND
══════════════════════════════

[Usuário] Acessa /view/:id
  │
  └─ page.tsx (PublicViewPage)
       │
       ├─ useEffect → api.get(/processograms/:id) → metadados do processograma
       ├─ processogramService.getElementData() → cache local de descrições
       │
       ├─ ProcessogramViewer → renderiza SVG via react-inlinesvg
       │   └─ onSvgReady → registra <svg> element no navigator
       │
       └─ useSvgNavigatorLogic → orquestra navegação
            │
            [Usuário clica num elemento SVG]
            │
            ├─ useClickHandler → detecta click no SVG
            ├─ hierarchy.ts → sobe na árvore DOM para montar hierarquia
            ├─ extractInfoFromId → parseia elementId (baseName, level, number)
            │
            └─ onChange(identifier, hierarchy)
                 │
                 └─ page.tsx → setSelectedElementId(lastItem.rawId)
                      │
                      └─ SidePanel (selectedElementId = "laying-hen--lf")
                           │
                           ├─ useEffect → fetch paralelo:
                           │   ├─ GET /processograms/:id/data/public → ElementData[]
                           │   └─ GET /processograms/:id/questions/public → Questions[]
                           │
                           ├─ items.find(d => d.elementId === selectedElementId)
                           │   └─ Exibe elementData.description em "Dados do Elemento"
                           │
                           ├─ allQuestions.filter(q => q.elementId === selectedElementId)
                           │   └─ Passa questões como suggestedQuestions para ChatWidget
                           │
                           └─ ChatWidget (elementContext = selectedElementId)
                                └─ Pronto para interação via chat
```

---

### Q19 — Fluxo Completo de uma Mensagem de Chat

```
[Usuário] Digita "Como funciona o alojamento?" e pressiona Enter
  │
  └─ ChatWidget.tsx → handleSubmit(e) → sendMessage(input)
       │
       ├─ 1. Limpa input, seta isStreaming = true
       │
       ├─ 2. Prepend contexto do elemento:
       │      fullMessage = '[Contexto: Elemento selecionado "laying-hen--lf"]\n\n
       │                      Como funciona o alojamento?'
       │
       ├─ 3. Optimistic update: adiciona mensagem user + modelo vazio ao estado
       │      messages = [...prev, {role:"user",parts:"Como funciona..."}, {role:"model",parts:""}]
       │
       ├─ 4. Monta histórico: historyForApi = messages anteriores (antes desta)
       │
       └─ 5. streamChat(processogramId, fullMessage, historyForApi, onChunk, signal)
              │
              ├─ fetch POST /api/v1/processograms/:id/chat/stream
              │   body: { message: fullMessage, history: historyForApi }
              │
              └─ [SERVIDOR]
                   │
                   ├─ ChatController.stream(req, res)
                   │    └─ StreamChatUseCase.execute(input)
                   │         │
                   │         ├─ ProcessogramModel.findById() → verifica existência
                   │         │
                   │         ├─ ProcessogramDataModel.find({processogramId})
                   │         │   └─ Busca TODAS as descrições
                   │         │
                   │         ├─ Monta system prompt com lista de elementos:
                   │         │   "Você é um especialista... elementos:\n
                   │         │    - [laying-hen--lf]: Laying hens...\n
                   │         │    - [growing--ph-1]: The growing..."
                   │         │
                   │         └─ GeminiService.streamChat(context, userMessage, history)
                   │              │
                   │              ├─ model = getGenerativeModel({
                   │              │     model: 'gemini-2.5-flash',
                   │              │     temperature: 0.3,
                   │              │     systemInstruction: context  ← system prompt
                   │              │   })
                   │              │
                   │              ├─ chat = model.startChat({ history: chatHistory })
                   │              │
                   │              └─ chat.sendMessageStream(userMessage)
                   │                   └─ Retorna AsyncIterable de chunks
                   │
                   └─ ChatController faz streaming SSE:
                        │
                        ├─ res.setHeader('Content-Type', 'text/event-stream')
                        │
                        ├─ for await (chunk of stream):
                        │     res.write('data: {"text":"O alojamento "}\n\n')
                        │     res.write('data: {"text":"utiliza gaiolas "}\n\n')
                        │     res.write('data: {"text":"enriquecidas..."}\n\n')
                        │
                        └─ res.write('data: [DONE]\n\n')

              [FRONTEND - recebe stream]
              │
              ├─ reader.read() → decodifica chunks
              │
              ├─ Para cada "data: {text}" → onChunk(text)
              │   └─ setMessages: atualiza último message.parts += chunk
              │       → React re-renderiza → texto aparece incrementalmente
              │
              ├─ "data: [DONE]" → para o loop
              │
              └─ isStreaming = false → botão de envio reativado
```

---

### Q20 — Diagrama de Fluxo de Dados

```
┌─────────────────────────────────────────────────────────────────────┐
│                          MONGODB                                     │
│                                                                       │
│  ┌──────────────────────┐  ┌──────────────────────────┐              │
│  │  processogramdatas    │  │  processogramquestions    │              │
│  │                       │  │                           │              │
│  │  processogramId ──┐   │  │  processogramId ──┐      │              │
│  │  elementId        │   │  │  elementId        │      │              │
│  │  description      │   │  │  question         │      │              │
│  │  videoUrl         │   │  │  options[]        │      │              │
│  │  createdAt        │   │  │  correctAnswerIndex│     │              │
│  │  updatedAt        │   │  │  createdAt         │     │              │
│  └──────────────────┘│   │  │  updatedAt         │     │              │
│                       │   │  └───────────────────┘│     │              │
│                       │   │                       │     │              │
│  ┌────────────────┐  │   │                       │     │              │
│  │  processograms  │◄─┘   │                      │     │              │
│  │                 │◄──────┘                      │     │              │
│  │  name, slug     │                              │     │              │
│  │  svg_url_light  │                                    │              │
│  │  raster_images  │                                    │              │
│  └────────────────┘                                     │              │
└──────────────────────────────────────────────────────────┘

                    │                          │
                    ▼                          ▼
    ┌─────────────────────────┐  ┌─────────────────────────────┐
    │  GET /data/public        │  │  GET /questions/public       │
    │                          │  │                              │
    │  ListProcessogramData    │  │  ListProcessogramQuestions   │
    │  UseCase                 │  │  UseCase                     │
    │                          │  │                              │
    │  → Array<{               │  │  → Array<{                   │
    │      elementId,           │  │      elementId,              │
    │      description,         │  │      question,               │
    │      videoUrl             │  │      options[],              │
    │    }>                     │  │      correctAnswerIndex      │
    └──────────┬───────────────┘  │    }>                        │
               │                   └──────────┬──────────────────┘
               │                              │
               ▼                              ▼
    ┌──────────────────────────────────────────────────────────┐
    │                    FRONTEND                                │
    │                                                            │
    │  page.tsx (PublicViewPage)                                  │
    │    │                                                       │
    │    ├─ ProcessogramViewer ──────┐                           │
    │    │   (renderiza SVG)        │                           │
    │    │                          │ click → onChange()         │
    │    │                          ▼                           │
    │    ├─ useSvgNavigatorLogic                                │
    │    │   (resolve hierarchy,                                │
    │    │    extrai elementId)                                  │
    │    │          │                                            │
    │    │          ▼ setSelectedElementId                       │
    │    │                                                       │
    │    └─ SidePanel ──────────────────────────────────────┐   │
    │         │                                              │   │
    │         ├─ fetch /data/public                          │   │
    │         │   └─ .find(d => d.elementId === selected)    │   │
    │         │       └─ Exibe description                   │   │
    │         │                                              │   │
    │         ├─ fetch /questions/public                     │   │
    │         │   └─ .filter(q => q.elementId === selected)  │   │
    │         │       └─ Passa como suggestedQuestions        │   │
    │         │                                              │   │
    │         └─ ChatWidget ◄────────────────────────────────┘   │
    │              │                                              │
    │              ├─ SuggestedQuestions (chips clicáveis)        │
    │              │                                              │
    │              ├─ sendMessage()                               │
    │              │   └─ POST /chat/stream                      │
    │              │       body: { message, history }             │
    │              │                                              │
    │              └─ SSE reader                                  │
    │                  └─ onChunk → atualiza messages state       │
    │                      → texto aparece incrementalmente       │
    └────────────────────────────────────────────────────────────┘

                              ▲
                              │ POST /chat/stream
                              ▼

    ┌────────────────────────────────────────────────────────────┐
    │                     BACKEND (Chat)                           │
    │                                                              │
    │  ChatController.stream()                                     │
    │    └─ StreamChatUseCase.execute()                            │
    │         │                                                    │
    │         ├─ ProcessogramDataModel.find({processogramId})      │
    │         │   └─ Busca TODAS as descrições do processograma    │
    │         │                                                    │
    │         ├─ Monta system prompt:                              │
    │         │   "Você é um especialista...                       │
    │         │    elementos técnicos:                              │
    │         │    - [id1]: desc1                                   │
    │         │    - [id2]: desc2"                                  │
    │         │                                                    │
    │         └─ GeminiService.streamChat(context, msg, history)   │
    │              │                                                │
    │              ├─ systemInstruction: context                    │
    │              ├─ chat.startChat({ history })                   │
    │              └─ chat.sendMessageStream(userMessage)           │
    │                   └─ AsyncIterable<GenerateContentResponse>  │
    │                                                              │
    │  ──► SSE: data: {"text":"..."}\n\n                          │
    │  ──► SSE: data: [DONE]\n\n                                  │
    └──────────────────────────────────────────────────────────────┘
```

---

## Resumo das Collections MongoDB

| Collection | Campos | Índices |
|-----------|--------|---------|
| `processograms` | identifier, name, slug, description, specieId, productionModuleId, status, svg_url_light/dark, raster_images_light/dark, creatorId | _id |
| `processogramdatas` | processogramId, elementId, description, videoUrl, createdAt, updatedAt | { processogramId: 1, elementId: 1 } (unique) |
| `processogramquestions` | processogramId, elementId, question, options[], correctAnswerIndex, createdAt, updatedAt | { processogramId: 1, elementId: 1 } |

## Resumo dos Endpoints Relevantes

| Método | Rota | Auth | Propósito |
|--------|------|------|-----------|
| `POST` | `/processograms/:id/analyze` | Admin | Gera descrições + questões via Gemini |
| `GET` | `/processograms/:id/data/public` | Público | Lista todas as descrições de um processograma |
| `GET` | `/processograms/:id/questions/public` | Público | Lista todas as questões de um processograma |
| `POST` | `/processograms/:id/chat/stream` | Público | Chat streaming SSE com contexto do processograma |
| `GET` | `/processograms/:id/data` | Auth | Lista descrições (versão autenticada) |
| `GET` | `/processograms/:id/questions` | Auth | Lista questões (versão autenticada) |

## Arquivos-Chave

### Backend
- `src/domain/services/SvgParser.ts` — Parse do SVG com Cheerio
- `src/infrastructure/services/ai/GeminiService.ts` — Integração com Gemini 2.5 Flash
- `src/infrastructure/services/ai/prompts.ts` — Prompts de sistema e funções de construção
- `src/application/services/ProcessogramProcessor.ts` — Orquestrador da análise (descrições + questões)
- `src/application/useCases/processogram/AnalyzeProcessogramUseCase.ts` — UseCase de análise
- `src/application/useCases/chat/StreamChatUseCase.ts` — UseCase do chat streaming
- `src/infrastructure/models/ProcessogramDataModel.ts` — Model de descrições
- `src/infrastructure/models/ProcessogramQuestionModel.ts` — Model de questões
- `src/presentation/controllers/ChatController.ts` — Controller SSE do chat
- `src/presentation/controllers/ProcessogramAIController.ts` — Controller de análise

### Frontend
- `frontend/src/app/view/[id]/page.tsx` — Página principal do viewer
- `frontend/src/components/processogram/SidePanel.tsx` — Painel lateral com descrição + chat
- `frontend/src/components/chat/ChatWidget.tsx` — Widget de chat com SSE streaming
- `frontend/src/components/chat/SuggestedQuestions.tsx` — Chips de questões sugeridas
- `frontend/src/services/processograms.ts` — Service layer de API
- `frontend/src/components/processogram/navigator/` — Sistema de navegação SVG
