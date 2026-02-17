# Camada Interativa & Chat Contextual — Visualizador Público

## Visão Geral

O Visualizador Público (`/view/[id]`) permite que qualquer pessoa visualize um processograma e interaja com seus elementos. Ao clicar em um elemento do SVG, um Painel Lateral (HUD) desliza da direita, exibindo detalhes do elemento e um Chat contextual com IA (RAG).

---

## Arquitetura de Componentes

```
page.tsx (Public View)
├── ProcessogramInteractiveLayer    ← Delegação de eventos
│   └── ProcessogramViewer          ← SVG + Zoom/Pan
└── SidePanel                       ← Painel HUD lateral
    └── ChatWidget                  ← Chat com streaming SSE
```

---

## 1. Delegação de Eventos no SVG

**Arquivo:** `components/processogram/ProcessogramInteractiveLayer.tsx`

### Como Funciona

O SVG renderizado via `dangerouslySetInnerHTML` gera elementos DOM reais. A camada interativa usa **Event Delegation** — um único `onClick` no container pai captura cliques em qualquer elemento interno:

```
Clique no SVG
  → event.target (elemento clicado)
  → .closest('[id]') (encontra ancestral com ID)
  → Extrai o ID
  → Chama onElementSelect(id)
```

### Feedback Visual

Quando um elemento é selecionado:
1. A classe CSS `processogram-element-highlight` é adicionada ao elemento
2. Produz brilho vermelho via `outline` + `drop-shadow`
3. Remove automaticamente após 2 segundos
4. Hover sobre elementos com `[id]` mostra sutil `drop-shadow`

### IDs Filtrados

- IDs vazios, `"svg"`, e prefixados com `"__"` são ignorados
- O `#` prefixo é removido automaticamente

---

## 2. Painel Lateral HUD

**Arquivo:** `components/processogram/SidePanel.tsx`

### Animação

Usa `framer-motion` variants com spring animation:
- **Entrada:** Desliza da direita (`x: 100% → 0`)
- **Saída:** Desliza de volta (`x: 0 → 100%`)
- Spring com `damping: 28, stiffness: 300` para movimento orgânico

### Dados do Elemento

Ao selecionar um elemento, o painel busca descrições da API:
```
GET /api/v1/processograms/:processogramId/data/public
```
Filtra pelo `elementId` correspondente. Se não houver descrição, exibe mensagem genérica.

### Layout

| Seção | Conteúdo |
|-------|----------|
| Header | Nome formatado + ID raw + botão fechar |
| Dados | Descrição do elemento (via `ProcessogramData`) |
| Chat | Widget de chat contextual (flex-1, preenche resto) |

---

## 3. Chat Widget com Streaming

**Arquivo:** `components/chat/ChatWidget.tsx`

### Fluxo de Dados Completo

```
[1] Usuário digita mensagem no ChatWidget
     │
[2] POST /api/v1/processograms/:id/chat/stream
     │  Body: { message, history }
     │  + Contexto do elemento selecionado é prefixado à mensagem
     │
[3] Next.js Proxy (next.config.ts rewrite)
     │  /api/v1/* → http://localhost:8080/api/v1/*
     │
[4] Express Backend (processogramRoutes.ts)
     │  /:processogramId/chat/stream → ChatController.stream
     │
[5] StreamChatUseCase
     │  - Busca ProcessogramData do MongoDB (descrições de todos os elementos)
     │  - Monta contexto RAG com lista de elementos
     │  - Chama Gemini AI com streaming
     │
[6] SSE Response (text/event-stream)
     │  data: {"text": "chunk1"}
     │  data: {"text": "chunk2"}
     │  data: [DONE]
     │
[7] ChatWidget lê stream via ReadableStream API
     │  response.body.getReader() → decoder → parse SSE
     │
[8] Estado atualizado chunk por chunk (efeito de digitação)
```

### Protocolo SSE

O backend envia Server-Sent Events:
- **Chunk de texto:** `data: {"text": "..."}\n\n`
- **Erro:** `data: {"error": "..."}\n\n`
- **Fim:** `data: [DONE]\n\n`

O frontend mantém um buffer para lidar com chunks parciais que podem não terminar em `\n`.

### Contexto do Elemento

Quando há um elemento selecionado, o contexto é prefixado à mensagem:
```
[Contexto: Elemento selecionado "insensibilizacao-eletrica"]

Qual é o objetivo desta etapa?
```

O backend então utiliza os dados RAG (todas as descrições do processograma) para responder com foco naquele elemento.

### Histórico

O ChatWidget mantém array de `ChatMessage[]` com `role: "user" | "model"` e `parts: string`, enviado como `history` a cada requisição para manter contexto conversacional.

---

## 4. Estilos CSS

**Arquivo:** `globals.css`

```css
/* Highlight de elementos selecionados */
.processogram-element-highlight {
  outline: 2px solid oklch(0.637 0.237 25.331 / 80%);
  filter: drop-shadow(0 0 8px oklch(0.637 0.237 25.331 / 50%));
}

/* Cursor pointer em elementos clicáveis */
.processogram-svg-container [id] {
  cursor: pointer;
}

/* Hover sutil */
.processogram-svg-container [id]:hover {
  filter: drop-shadow(0 0 4px oklch(0.637 0.237 25.331 / 30%));
}
```

---

## 5. Rotas Públicas (Backend)

Duas novas rotas foram adicionadas sem `AuthMiddleware`:

| Rota | Método | Propósito |
|------|--------|-----------|
| `/:processogramId/data/public` | GET | Lista descrições dos elementos |
| `/:processogramId/chat/stream` | POST | Stream de chat via SSE |

---

## 6. Considerações de UX

- **"Inspecionando uma máquina":** O painel lateral com fundo glassmorphism (`bg-black/80 backdrop-blur-xl`) e borda vermelha sutil simula um painel de diagnóstico
- **IA como a máquina respondendo:** Respostas em `font-mono` reforçam a sensação de output de sistema
- **Feedback imediato:** Highlight visual no clique + skeleton loading para dados + animação de "Processando..." enquanto a IA gera resposta
- **Toggle:** Clicar no mesmo elemento fecha o painel; clicar em outro troca contexto
- **Mobile:** O painel ocupa `w-full` em telas pequenas, `sm:w-95` em médias, `lg:w-105` em grandes
