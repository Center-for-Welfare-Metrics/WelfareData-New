# 14 — Chat Contextual com Streaming (Gemini AI)

## Visão Geral

Endpoint de chat que permite aos usuários interagir com os dados técnicos do processograma usando IA generativa. Utiliza RAG simplificado: as descrições validadas (`ProcessogramData`) são injetadas como contexto para o modelo Gemini 1.5 Flash, que responde via Server-Sent Events (SSE).

---

## Rota

| Método | Rota | Auth | Role | Descrição |
|--------|------|------|------|-----------|
| `POST` | `/chat/stream` | ✅ | any | Chat contextual com streaming SSE |

---

## Estrutura de Arquivos

```
src/
├── application/useCases/chat/
│   └── StreamChatUseCase.ts
├── infrastructure/services/ai/
│   ├── GeminiService.ts       (método streamChat adicionado)
│   └── index.ts               (ChatMessage exportado)
├── presentation/
│   ├── controllers/
│   │   └── ChatController.ts
│   └── routes/
│       └── chatRoutes.ts
└── server.ts                  (rota /chat registrada, timeout bypass para SSE)
```

---

## Fluxo de Execução

```
Cliente → POST /chat/stream { processogramId, message, history }
  │
  ├─ StreamChatUseCase
  │   ├─ Valida input (Zod)
  │   ├─ Busca Processogram no banco (404 se não encontrado)
  │   ├─ Busca ProcessogramData pelo processogramId
  │   ├─ Monta system context com as descrições (ou fallback genérico)
  │   └─ Chama geminiService.streamChat(context, message, history)
  │
  └─ ChatController
      ├─ Configura headers SSE
      ├─ Itera chunks do stream
      ├─ Envia: data: {"text":"chunk..."}\n\n
      ├─ Ao finalizar: data: [DONE]\n\n
      └─ Trata desconexão do cliente (sem crash)
```

---

## Request

```http
POST /chat/stream
Content-Type: application/json
Cookie: token=<jwt>

{
  "processogramId": "665abc...",
  "message": "Quais são as fases do sistema de produção de suínos?",
  "history": [
    { "role": "user", "parts": "O que é este diagrama?" },
    { "role": "model", "parts": "Este diagrama representa o fluxo de produção..." }
  ]
}
```

### Validação (Zod)

| Campo | Tipo | Regra |
|-------|------|-------|
| `processogramId` | `string` | obrigatório, min 1 char |
| `message` | `string` | obrigatório, min 1 char |
| `history` | `array` | opcional (default `[]`) |
| `history[].role` | `'user' \| 'model'` | obrigatório |
| `history[].parts` | `string` | obrigatório, min 1 char |

---

## Response (SSE)

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

data: {"text":"As fases"}

data: {"text":" do sistema"}

data: {"text":" incluem..."}

data: [DONE]
```

### Erros

| Status | Condição |
|--------|----------|
| `400` | Validação do input falhou |
| `404` | Processograma não encontrado |
| `503` | `GEMINI_API_KEY` não configurada |
| `500` | Erro interno |

---

## Configuração do Modelo

| Parâmetro | Valor | Justificativa |
|-----------|-------|---------------|
| Model | `gemini-1.5-flash` | Otimizado para streaming e baixa latência |
| Temperature | `0.3` | Foco em respostas factuais e precisas |
| System Instruction | Contexto RAG | Descrições do processograma injetadas |

---

## System Context (RAG)

### Com descrições disponíveis:
```
Você é um especialista em bem-estar animal e sistemas de produção.
O usuário está visualizando um diagrama de processograma com os seguintes elementos técnicos:

- [sow--ps]: Sistema de produção de suínos reprodutoras...
- [sow--lf]: Caminho de vida da matriz suína...
...

Responda com base nesses dados técnicos. Seja preciso, objetivo e cite os elementos pelo nome quando relevante.
Se a pergunta do usuário não tiver relação com os dados do diagrama, responda educadamente que seu foco é auxiliar na compreensão do processograma.
```

### Sem descrições (fallback):
```
Você é um especialista em bem-estar animal e sistemas de produção.
O usuário está visualizando um diagrama de processograma, mas ainda não há descrições técnicas geradas para os elementos.
Informe educadamente que os dados ainda não foram processados e responda de forma genérica com base no seu conhecimento.
```

---

## Timeout

A rota `POST /chat/stream` é excluída do middleware de timeout do servidor, pois SSE mantém a conexão aberta por tempo indeterminado. A desconexão do cliente é tratada via listener `req.on('close')`.

---

## Tratamento de Desconexão

O controller monitora `req.on('close')` e seta um flag `clientDisconnected`. Durante a iteração do stream:
- Se o cliente desconectou, o loop é interrompido via `break`.
- `res.end()` só é chamado se o cliente ainda estiver conectado.
- Erros durante o streaming são enviados como evento SSE de erro, sem crashar o servidor.