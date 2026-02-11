# 12 - Análise Inteligente de Processogramas com Google Gemini

## Visão Geral

Sistema de análise automatizada on-demand que extrai a hierarquia de elementos de um processograma (SVG) e gera:
1. **Descrições técnicas** concisas para cada elemento
2. **Perguntas de quiz** (múltipla escolha) para avaliação de conhecimento

Utiliza o **Google Gemini 1.5 Flash** para processamento rápido e de baixo custo.

---

## Arquitetura

```
POST /processograms/:id/analyze
         ↓
ProcessogramAIController.analyze
         ↓
AnalyzeProcessogramUseCase
         ↓
    ┌────┴────┬─────────┬─────────────┐
    ↓         ↓         ↓             ↓
MongoDB   GCS      Cheerio       Gemini
(busca)  (download)  (parse)    (análise)
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
- `{processogramId, elementId}` → Permite múltiplas perguntas por elemento

---

## 2. Serviços

### `GeminiService`

**Localização**: `src/infrastructure/services/ai/GeminiService.ts`

#### Configuração

```env
GEMINI_API_KEY=your-api-key
```

#### Método principal

```typescript
async generateBulkAnalysis(
  context: string,
  elementIds: string[]
): Promise<BulkAnalysisResult>
```

**Configuração do modelo**:
- **Modelo**: `gemini-1.5-flash`
- **Response MIME**: `application/json` (retorno estruturado)
- **Temperature**: `0.4` (equilíbrio criatividade/consistência)

**Prompt de sistema**:
> Você é um especialista veterinário em bem-estar animal e sistemas de produção pecuária.

**Contexto enviado**:
```
Processograma: "Conventional Cages"
Espécie: Aves
Módulo de Produção: Hatchery
Identificador: aves-hatchery-conventional-cages
Total de elementos interativos: 310
IDs dos elementos: conventional_cages--ps, laying_hen--lf, ...
```

**Formato de resposta**:
```json
{
  "elements": [
    {
      "elementId": "laying_hen--lf",
      "description": "Fase do ciclo produtivo onde...",
      "questions": [
        {
          "question": "Qual a densidade populacional ideal?",
          "options": ["300 cm²/ave", "450 cm²/ave", "600 cm²/ave", "750 cm²/ave"],
          "correctAnswerIndex": 2
        }
      ]
    }
  ]
}
```

---

## 3. Use Case: `AnalyzeProcessogramUseCase`

**Localização**: `src/application/useCases/processogram/AnalyzeProcessogramUseCase.ts`

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

**4. Extração de IDs com Cheerio**
```typescript
const $ = cheerio.load(svgContent, { xml: true });
const elementIds: string[] = [];

$('[id]').each((_, el) => {
  const id = $(el).attr('id');
  if (id && isAnalyzableId(id)) {  // Prefixos: --ps, --lf, --ph, --ci
    elementIds.push(id);
  }
});
```

**Prefixos rasterizáveis**:
| Prefixo | Significado |
|---------|-------------|
| `--ps` | Processo/etapa |
| `--lf` | Fluxo lógico |
| `--ph` | Fase |
| `--ci` | Indicador crítico |

**5. Montar Contexto**
```typescript
const context = [
  `Processograma: "${processogram.name}"`,
  `Espécie: ${specie?.name}`,
  `Módulo de Produção: ${module?.name}`,
  `Identificador: ${processogram.identifier}`,
  `Total de elementos interativos: ${elementIds.length}`,
  `IDs dos elementos: ${elementIds.join(', ')}`
].filter(Boolean).join('\n');
```

**6. Chamar Gemini**
```typescript
const gemini = getGeminiService();
const analysis = await gemini.generateBulkAnalysis(context, elementIds);
```

**7. Bulk Upsert de Descrições**
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

**8. Bulk Replace de Perguntas**
```typescript
const questionOps = [];
for (const el of analysis.elements) {
  questionOps.push({
    deleteMany: { filter: { processogramId, elementId: el.elementId } }
  });
  for (const q of el.questions) {
    questionOps.push({
      insertOne: { document: { processogramId, elementId: el.elementId, ...q } }
    });
  }
}

await ProcessogramQuestionModel.bulkWrite(questionOps);
```

**9. Retornar Resumo**
```typescript
{
  processogramId,
  message: "Analysis complete: 310 elements processed",
  elementsFound: 310,
  elementsAnalyzed: 310,
  descriptionsUpserted: 310,
  questionsUpserted: 930  // 310 elementos × 3 perguntas
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
  "message": "Analysis complete: 310 elements processed",
  "elementsFound": 310,
  "elementsAnalyzed": 310,
  "descriptionsUpserted": 310,
  "questionsUpserted": 930
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
curl -i -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@welfare.com","password":"password123"}' \
  -c cookies.txt
```

### Análise

```bash
# Disparar análise
curl -X POST http://localhost:8080/processograms/698bdcf03d60b37e230bc9e9/analyze \
  -b cookies.txt
```

### Resposta esperada

```json
{
  "processogramId": "698bdcf03d60b37e230bc9e9",
  "message": "Analysis complete: 310 elements processed",
  "elementsFound": 310,
  "elementsAnalyzed": 310,
  "descriptionsUpserted": 310,
  "questionsUpserted": 930
}
```

### Consultar resultados

```bash
# Ver descrições de um elemento específico
curl "http://localhost:8080/processogram-data?processogramId=698bdcf03d60b37e230bc9e9&elementId=laying_hen--lf" \
  -b cookies.txt

# Ver perguntas de quiz
curl "http://localhost:8080/processogram-questions?processogramId=698bdcf03d60b37e230bc9e9&elementId=laying_hen--lf" \
  -b cookies.txt
```

---

## 6. Características Técnicas

### Idempotência

A análise pode ser executada múltiplas vezes no mesmo processograma:
- **Descrições**: Upsert preserva `createdAt` original, atualiza `description` e `updatedAt`
- **Perguntas**: Delete + Insert — substitui completamente as perguntas antigas

### Performance

| SVG | Elementos | Tempo médio |
|-----|-----------|-------------|
| Pequeno (~1 MB, 50 IDs) | 50 | 8-12s |
| Médio (~2 MB, 150 IDs) | 150 | 20-30s |
| Grande (~3 MB, 310 IDs) | 310 | 45-90s |

Gargalos:
1. Download do SVG do GCS
2. Parsing com Cheerio (negligível)
3. **Gemini API call** (maior latência)
4. Bulk write no MongoDB

### Custos Gemini

**Gemini 1.5 Flash** (preços referência):
- **Input**: ~$0.075 / 1M tokens
- **Output**: ~$0.30 / 1M tokens

Exemplo para 310 elementos:
- Input: ~5k tokens (contexto + IDs)
- Output: ~50k tokens (descrições + perguntas)
- **Custo total**: ~$0.02 por análise

---

## 7. Limitações e Melhorias Futuras

### Limitações Atuais

1. **Análise sequencial**: Processa todos os elementos de uma vez (pode travar em SVGs com 1000+ IDs)
2. **Sem cache**: Re-análise completa a cada execução
3. **Sem versionamento**: Sobrescreve dados antigos sem histórico
4. **Idioma fixo**: Prompt em português brasileiro

### Roadmap

**v1.1 - Batch Processing**
- Dividir análise em lotes de 50 elementos
- Progress tracking com WebSockets

**v1.2 - Human-in-the-Loop**
- Endpoint `PATCH /processogram-data/:id` para edição manual
- Flag `isManuallyEdited` para preservar edições na re-análise

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

**Causa**: SVG não tem IDs com prefixos `--ps`, `--lf`, `--ph`, `--ci`

**Solução**:
1. Validar SVG antes do upload
2. Adicionar prefixos aos IDs no editor (Inkscape/Figma)
3. Ajustar `RASTERIZABLE_PREFIXES` no código se necessário

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
