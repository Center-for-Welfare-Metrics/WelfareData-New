# 13 — Human-in-the-Loop: Leitura e Edição de Dados de IA

## Visão Geral

Após a análise automática do processograma pela IA (Gemini), os dados gerados precisam ser revisados e refinados por um humano antes de serem publicados. Esta camada implementa endpoints de **leitura** e **edição** para `ProcessogramData` (descrições) e `ProcessogramQuestion` (questões).

---

## Rotas

| Método | Rota | Auth | Role | Descrição |
|--------|------|------|------|-----------|
| `GET` | `/processograms/:processogramId/data` | ✅ | any | Lista todas as descrições de um processograma |
| `GET` | `/processograms/:processogramId/data/public` | ❌ | — | Lista descrições (rota pública, shareability) |
| `PUT` | `/processogram-data/:id` | ✅ | admin | Edita uma descrição específica |
| `GET` | `/processograms/:processogramId/questions` | ✅ | any | Lista todas as questões de um processograma |
| `GET` | `/processograms/:processogramId/questions/public` | ❌ | — | Lista questões (rota pública, usada pelo SidePanel) |
| `PUT` | `/processogram-questions/:id` | ✅ | admin | Edita uma questão específica |

---

## Estrutura de Arquivos

```
src/
├── application/useCases/
│   ├── processogramData/
│   │   ├── ListProcessogramDataUseCase.ts
│   │   └── UpdateProcessogramDataUseCase.ts
│   └── processogramQuestion/
│       ├── ListProcessogramQuestionsUseCase.ts
│       └── UpdateProcessogramQuestionUseCase.ts
├── presentation/
│   ├── controllers/
│   │   ├── ProcessogramDataController.ts
│   │   └── ProcessogramQuestionController.ts
│   └── routes/
│       ├── processogramDataRoutes.ts
│       ├── processogramQuestionRoutes.ts
│       └── processogramRoutes.ts  (rotas GET adicionadas)
└── server.ts  (rotas registradas)
```

---

## Detalhes dos Endpoints

### GET `/processograms/:processogramId/data`

Retorna todas as `ProcessogramData` vinculadas ao processograma, ordenadas por `elementId`.

**Response `200`:**
```json
[
  {
    "id": "...",
    "processogramId": "...",
    "elementId": "sow--ps",
    "description": "Sistema de produção de suínos...",
    "videoUrl": "https://...",
    "createdAt": "...",
    "updatedAt": "..."
  }
]
```

**Response `404`:** Processograma não encontrado.

---

### PUT `/processogram-data/:id`

Edita a descrição e/ou videoUrl de um registro específico.

**Body (parcial):**
```json
{
  "description": "Descrição revisada pelo especialista",
  "videoUrl": "https://youtube.com/..."
}
```

- Enviar `videoUrl: ""` remove o campo.
- Todos os campos são opcionais.

**Response `200`:** Registro atualizado.  
**Response `404`:** Registro não encontrado.  
**Response `400`:** Erro de validação (Zod).

---

### GET `/processograms/:processogramId/questions`

Retorna todas as `ProcessogramQuestion` vinculadas ao processograma, ordenadas por `elementId` e `createdAt`.

**Response `200`:**
```json
[
  {
    "id": "...",
    "processogramId": "...",
    "elementId": "sow--ps",
    "question": "What is the main production system?",
    "options": ["Intensive", "Extensive", "Semi-intensive", "Free-range"],
    "correctAnswerIndex": 0,
    "createdAt": "...",
    "updatedAt": "..."
  }
]
```

**Response `404`:** Processograma não encontrado.

---

### PUT `/processogram-questions/:id`

Edita uma questão específica.

**Body (parcial):**
```json
{
  "question": "Pergunta revisada",
  "options": ["A", "B", "C", "D"],
  "correctAnswerIndex": 2
}
```

**Validações:**
- `options` deve ter no mínimo 2 itens.
- `correctAnswerIndex` deve estar dentro do range de `options` (quando ambos são enviados juntos, a validação é feita no Zod `refine`; quando apenas `correctAnswerIndex` é enviado, é validado contra as opções existentes no banco).

**Response `200`:** Registro atualizado.  
**Response `404`:** Registro não encontrado.  
**Response `400`:** Erro de validação.

---

## Validação (Zod)

### UpdateProcessogramDataSchema

| Campo | Tipo | Regra |
|-------|------|-------|
| `description` | `string` | min 1 char, opcional |
| `videoUrl` | `string \| ""` | URL válida ou string vazia (para remover), opcional |

### UpdateProcessogramQuestionSchema

| Campo | Tipo | Regra |
|-------|------|-------|
| `question` | `string` | min 1 char, opcional |
| `options` | `string[]` | min 2 itens, cada item min 1 char, opcional |
| `correctAnswerIndex` | `number` | inteiro >= 0, opcional |

Refinamento: se `options` e `correctAnswerIndex` forem enviados juntos, `correctAnswerIndex < options.length`.

---

## Fluxo Human-in-the-Loop

```
1. Admin faz POST /:id/analyze       → IA gera descrições + perguntas
2. Admin faz GET /:processogramId/data     → Visualiza descrições geradas
3. Admin faz PUT /processogram-data/:id    → Corrige/refina descrição
4. Admin faz GET /:processogramId/questions → Visualiza questões geradas
5. Admin faz PUT /processogram-questions/:id → Corrige questão
```

> As rotas públicas (`/data/public`, `/questions/public`) são usadas pelo frontend
> (`SidePanel`) para exibir descrições e sugestões de perguntas (chips) sem
> necessidade de autenticação.
