# 12 - Análise Inteligente de Processogramas com Google Gemini

## Visão Geral

Sistema de análise automatizada on-demand que extrai a hierarquia de elementos de um processograma (SVG) e gera:
1. **Descrições técnicas** concisas para cada elemento (3-6 frases)
2. **Perguntas de quiz** (múltipla escolha, 1 por elemento) para avaliação de conhecimento

Utiliza o **Google Gemini 2.5 Flash** em duas chamadas sequenciais (descrições → perguntas).

---

## Arquitetura

```
POST /processograms/:id/analyze
         ↓
ProcessogramAIController.analyze
         ↓
AnalyzeProcessogramUseCase
         ↓
    ┌────┴────┬──────────────┬──────────────────────────┐
    ↓         ↓              ↓                          ↓
MongoDB   GCS          SvgParser               Gemini × 2
(busca)  (download)  (Cheerio interno)   (descrições + perguntas)
                          ↓
               Bulk Write → ProcessogramData + ProcessogramQuestion
```

---

## 1. Modelos de Dados

### `ProcessogramData`

Armazena descrições técnicas dos elementos.

```typescript
{
  processogramId: string (ref: Processogram),
  elementId: string,           // Ex: "laying_hen--lf"
  description: string,         // Max 60 palavras
  videoUrl?: string,           // Opcional (futuro)
  createdAt: Date,
  updatedAt: Date
}
```

**Índices**:
- `{processogramId, elementId}` → Unique compound index (upsert idempotente)

### `ProcessogramQuestion`

Armazena perguntas de quiz por elemento.

```typescript
{
  processogramId: string,
  elementId: string,
  question: string,
  options: string[],           // Array com 4 opções
  correctAnswerIndex: number,  // 0-3
  createdAt: Date,
  updatedAt: Date
}
```

**Índices**:
- `{processogramId, elementId}` → Compound index (1 pergunta por elemento garantida pelo upsert)

---

## 2. Serviços

### `GeminiService`

**Localização**: `src/infrastructure/services/ai/GeminiService.ts`

#### Configuração

```env
GEMINI_API_KEY=your-api-key
```

#### Métodos de Análise

O serviço faz **duas chamadas separadas** ao Gemini — uma para descrições e outra para perguntas:

**1. `generateBulkAnalysis(elements)`** — Gera descrições

```typescript
async generateBulkAnalysis(elements: ElementInput[]): Promise<BulkAnalysisResult>
```

- **Modelo**: `gemini-2.5-flash`
- **Response MIME**: `application/json`
- **Temperature**: `0.4`
- **Prompt**: `DESCRIPTION_SYSTEM_PROMPT` (especialista em ciência animal)
- **Input**: `elementId`, `level`, `name`, `parents`
- **Output**: descrição de 3-6 frases por elemento

**2. `generateBulkQuestions(elementsWithDescriptions)`** — Gera perguntas

```typescript
async generateBulkQuestions(
  elementsWithDescriptions: { elementId: string; level: string; name: string; parents: string; description: string }[]
): Promise<BulkQuestionsResult>
```

- **Modelo**: `gemini-2.5-flash`
- **Response MIME**: `application/json`
- **Temperature**: `0.5`
- **Prompt**: `QUESTIONS_SYSTEM_PROMPT` (professor universitário, múltipla escolha)
- **Input**: todos os campos + `description` (gerada na etapa 1)
- **Output**: exatamente **1 pergunta** por elemento (4 opções, `correctAnswerIndex` 0-based)

> **Pipeline sequencial**: O `ProcessogramProcessor` primeiro chama `generateBulkAnalysis`
> para obter as descrições, depois alimenta essas descrições ao `generateBulkQuestions`.
> As perguntas dependem das descrições para serem contextualizadas.

**Formato de resposta — Descrições**:
```json
{
  "elements": [
    {
      "elementId": "laying_hen--lf",
      "description": "Fase do ciclo produtivo onde..."
    }
  ]
}
```

**Formato de resposta — Perguntas**:
```json
{
  "questions": [
    {
      "elementId": "laying_hen--lf",
      "question": "What is the ideal stocking density?",
      "options": ["300 cm²/bird", "450 cm²/bird", "600 cm²/bird", "750 cm²/bird"],
      "correctAnswerIndex": 2
    }
  ]
}
```

---

## 3. Use Case: `AnalyzeProcessogramUseCase`

**Localização**: `src/application/useCases/processogram/AnalyzeProcessogramUseCase.ts`

O UseCase busca o processograma, faz download do SVG e delega o processamento para o `ProcessogramProcessor` (`src/application/services/ProcessogramProcessor.ts`).

### Fluxo de Execução

**1. Buscar Processograma**
```typescript
const processogram = await ProcessogramModel.findById(id)
  .populate('specieId', 'name pathname')
  .populate('productionModuleId', 'name slug');
```

Validação: Lança `Processogram not found` (404) se não existir.

**2. Validar SVG**
```typescript
if (!processogram.svg_url_light) {
  throw new Error('Processogram has no SVG file to analyze');
}
```

**3. Download do SVG**
```typescript
const storage = getStorageService();
const svgContent = await storage.downloadAsText(processogram.svg_url_light);
```

Usa o método `downloadAsText()` do `GoogleStorageService` (extrai path da URL → download → UTF-8).

**4. Extração de Elementos com `SvgParser`**

O `SvgParser` (`src/domain/services/SvgParser.ts`) usa Cheerio internamente para extrair todos os IDs semânticos e construir a hierarquia:

```typescript
const svgParser = new SvgParser();
const elements: ParsedElement[] = svgParser.parse(svgContent);
// Retorna: { elementId, level, name, parents }[]
```

O parser identifica IDs que terminam com os sufixos semânticos (`--ps`, `--lf`, `--ph`, `--ci`) e resolve a hierarquia de pais percorrendo o DOM SVG para cima.

**Níveis semânticos**:
| Sufixo | Nível |
|--------|-------|
| `--ps` | production system |
| `--lf` | life-fate |
| `--ph` | phase |
| `--ci` | circumstance |

**5. Chamar Gemini (Etapa 1 — Descrições)**

Os `ParsedElement[]` são enviados diretamente ao `generateBulkAnalysis`:

```typescript
const gemini = getGeminiService();
const analysis = await gemini.generateBulkAnalysis(elements);
```

O prompt (`DESCRIPTION_SYSTEM_PROMPT`) recebe `elementId`, `level`, `name`, `parents` e gera uma descrição de 3-6 frases por elemento.

**6. Bulk Upsert de Descrições**
```typescript
const dataOps = analysis.elements.map(el => ({
  updateOne: {
    filter: { processogramId, elementId: el.elementId },
    update: {
      $set: { description: el.description, updatedAt: new Date() },
      $setOnInsert: { processogramId, elementId: el.elementId, createdAt: new Date() }
    },
    upsert: true
  }
}));

await ProcessogramDataModel.bulkWrite(dataOps);
```

**7. Chamar Gemini (Etapa 2 — Perguntas)**

Alimenta as descrições geradas na etapa anterior como contexto:
```typescript
const elementsWithDescriptions = elements
  .filter(el => descriptionsMap.has(el.elementId))
  .map(el => ({
    elementId: el.elementId,
    level: el.level,
    name: el.name,
    parents: el.parents,
    description: descriptionsMap.get(el.elementId)!,
  }));

const questionsResult = await gemini.generateBulkQuestions(elementsWithDescriptions);
```

**8. Bulk Upsert de Perguntas (1 por elemento)**
```typescript
const questionOps = questionsResult.questions
  .filter(q => q.options?.length === 4 && typeof q.correctAnswerIndex === 'number')
  .map(q => ({
    updateOne: {
      filter: { processogramId, elementId: q.elementId },
      update: {
        $set: {
          question: q.question,
          options: q.options,
          correctAnswerIndex: q.correctAnswerIndex,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          processogramId,
          elementId: q.elementId,
          createdAt: new Date(),
        },
      },
      upsert: true,
    },
  }));

await ProcessogramQuestionModel.bulkWrite(questionOps);
```

> **Nota**: O prompt gera exatamente 1 pergunta por elemento. O `updateOne` com
> `upsert: true` garante idempotência — re-análise sobrescreve a pergunta existente
> sem criar duplicatas.

**9. Retornar Resumo**
```typescript
{
  processogramId,
  elementsFound: 310,
  descriptionsUpserted: 310,
  questionsUpserted: 310,  // 1 pergunta por elemento
  errors: [],
}
```

---

## 4. Endpoint

### `POST /processograms/:id/analyze`

**Autenticação**: Cookie HttpOnly (admin only)

**Controller**: `ProcessogramAIController.analyze`

**Parâmetros**:
- `:id` — ID do processograma (MongoDB ObjectId)

**Resposta de sucesso (200)**:
```json
{
  "processogramId": "698bdcf03d60b37e230bc9e9",
  "elementsFound": 310,
  "descriptionsUpserted": 310,
  "questionsUpserted": 310,
  "errors": []
}
```

**Erros**:

| Código | Erro | Causa |
|--------|------|-------|
| 400 | `Processogram has no SVG file to analyze` | `svg_url_light` ausente |
| 404 | `Processogram not found` | ID inválido |
| 502 | `AI service returned invalid response` | Gemini retornou JSON malformado |
| 503 | `AI service not configured` | `GEMINI_API_KEY` ausente |

---

## 5. Exemplo de Uso

### Setup

```bash
# 1. Configurar API key no .env
echo "GEMINI_API_KEY=your-key-here" >> .env

# 2. Login (admin)
curl -i -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@welfare.com","password":"password123"}' \
  -c cookies.txt
```

### Análise

```bash
# Disparar análise
curl -X POST http://localhost:8080/api/v1/processograms/698bdcf03d60b37e230bc9e9/analyze \
  -b cookies.txt
```

### Resposta esperada

```json
{
  "processogramId": "698bdcf03d60b37e230bc9e9",
  "elementsFound": 310,
  "descriptionsUpserted": 310,
  "questionsUpserted": 310,
  "errors": []
}
```

### Consultar resultados

```bash
# Ver descrições (rota pública)
curl "http://localhost:8080/api/v1/processograms/698bdcf03d60b37e230bc9e9/data/public"

# Ver descrições (rota autenticada, mesmos dados)
curl "http://localhost:8080/api/v1/processograms/698bdcf03d60b37e230bc9e9/data" \
  -b cookies.txt

# Ver perguntas de quiz (rota pública)
curl "http://localhost:8080/api/v1/processograms/698bdcf03d60b37e230bc9e9/questions/public"

# Ver perguntas (rota autenticada)
curl "http://localhost:8080/api/v1/processograms/698bdcf03d60b37e230bc9e9/questions" \
  -b cookies.txt
```

---

## 6. Características Técnicas

### Idempotência

A análise pode ser executada múltiplas vezes no mesmo processograma:
- **Descrições**: Upsert preserva `createdAt` original, atualiza `description` e `updatedAt`
- **Perguntas**: Upsert por `{processogramId, elementId}` — sobrescreve a pergunta existente, preserva `createdAt`

### Performance

| SVG | Elementos | Tempo médio |
|-----|-----------|-------------|
| Pequeno (~1 MB, 50 IDs) | 50 | 8-12s |
| Médio (~2 MB, 150 IDs) | 150 | 20-30s |
| Grande (~3 MB, 310 IDs) | 310 | 45-90s |

Gargalos:
1. Download do SVG do GCS
2. Parsing com SvgParser (negligível)
3. **Gemini API call × 2** (descrições + perguntas — maior latência)
4. Bulk write no MongoDB

### Custos Gemini

**Gemini 2.5 Flash** (preços referência):
- **Input**: ~$0.15 / 1M tokens
- **Output**: ~$0.60 / 1M tokens

Exemplo para 310 elementos (2 chamadas):
- Input: ~5k + ~25k tokens (contexto + IDs + descrições)
- Output: ~50k + ~15k tokens (descrições + perguntas)
- **Custo total**: ~$0.04 por análise

---

## 7. Limitações e Melhorias Futuras

### Limitações Atuais

1. **Análise sequencial**: Processa todos os elementos de uma vez (pode travar em SVGs com 1000+ IDs)
2. **Sem cache**: Re-análise completa a cada execução
3. **Sem versionamento**: Sobrescreve dados antigos sem histórico
4. **Idioma fixo**: Prompts em inglês (output em inglês)
5. **1 pergunta por elemento**: O prompt gera exatamente 1 question por element. Para mais perguntas, é preciso alterar o prompt + schema.

### Roadmap

**v1.1 - Batch Processing**
- Dividir análise em lotes de 50 elementos
- Progress tracking com WebSockets

**v1.2 - Human-in-the-Loop** ✅ (implementado)
- Endpoints `GET` + `PUT` para edição manual de descrições e questões
- Rotas públicas para consumo pelo frontend (`/data/public`, `/questions/public`)

**v1.3 - Multi-idioma**
- Detectar idioma do frontend
- Gerar descrições/perguntas em EN/ES/PT

**v1.4 - Versionamento**
- Histórico de análises com diff
- Rollback de versões anteriores

---

## 8. Troubleshooting

### Gemini retorna JSON inválido

**Sintoma**: Erro 502 `AI service returned invalid response`

**Causa**: Prompt muito longo ou modelo "alucinando" texto fora do JSON

**Solução**:
1. Reduzir número de IDs enviados (batch)
2. Aumentar `temperature` para 0.2 (mais determinístico)
3. Adicionar validação de schema com Zod antes do parse

### Timeout em SVGs grandes

**Sintoma**: Request nunca retorna, timeout de 30s

**Causa**: Gemini demorou mais que o timeout do Express

**Solução**:
```typescript
// server.ts
app.use(express.json({ limit: '50mb' }));
app.use((req, res, next) => {
  req.setTimeout(180_000); // 3 minutos para análise
  next();
});
```

### Elementos não são encontrados

**Sintoma**: `elementsFound: 0`

**Causa**: SVG não tem IDs com sufixos semânticos (`--ps`, `--lf`, `--ph`, `--ci`)

**Solução**:
1. Validar SVG antes do upload
2. Adicionar sufixos aos IDs no editor (Inkscape/Figma)
3. Ajustar `ANALYZABLE_PATTERN` no `SvgParser.ts` se necessário
4. Rodar o `normalizeSemanticIdsPlugin` (SVGO) se os IDs usam `_` em vez de `--`

---

## 9. Segurança

### API Key

- **Armazenamento**: `.env` (nunca commitar)
- **Rotação**: Recomendado mensalmente via Google Cloud Console
- **Restrições**: Configurar IP allowlist no GCP

### Rate Limiting

Sem rate limit implementado. Recomendações:

```typescript
import rateLimit from 'express-rate-limit';

const analyzeRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10, // 10 análises por IP
  message: 'Too many analysis requests, please try again later'
});

router.post('/:id/analyze', analyzeRateLimiter, ...);
```

### Auditoria

Adicionar log de análises:
```typescript
await AnalysisLog.create({
  processogramId,
  userId: req.user.id,
  elementsAnalyzed: result.elementsAnalyzed,
  tokensUsed: analysis.usage.totalTokens,
  executionTime: endTime - startTime
});
```
