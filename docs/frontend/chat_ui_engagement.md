# Suggested Questions — Chat UI Engagement

> Data: 26/02/2026 (atualizado: 26/02/2026)  
> Componente: `frontend/src/components/chat/SuggestedQuestions.tsx`

---

## Visão Geral

O `SuggestedQuestions` exibe pílulas/chips clicáveis com perguntas geradas pela IA para o elemento SVG atualmente focado. O objetivo é eliminar a "síndrome da tela em branco" — quando o painel de chat abre e o utilizador não sabe o que perguntar.

## Arquitetura

```
page.tsx
  │
  │  handleNavigatorChange() → setSelectedElementId(id)
  │
  ▼
SidePanel  (prop: processogramId, selectedElementId)
  │
  │  useEffect → Promise.allSettled([
  │    fetch("/api/v1/processograms/{id}/data/public"),
  │    fetch("/api/v1/processograms/{id}/questions/public")
  │  ])
  │  → filtra por selectedElementId → setSuggestedQuestions(string[])
  │
  ▼
ChatWidget  (prop: suggestedQuestions)
  │
  ├─ mensagens (scroll)
  ├─ SuggestedQuestions (chips)     ← posicionado acima do input
  └─ form (input + send)
```

### Fluxo de Dados

```
1. Câmera foca num elemento → page.tsx define selectedElementId
2. SidePanel abre e detecta mudança de selectedElementId (reset síncrono)
3. useEffect dispara fetch paralelo para /data/public + /questions/public
4. Resposta do /questions/public é filtrada por elementId → setSuggestedQuestions(string[])
5. suggestedQuestions é passado como prop para ChatWidget
6. ChatWidget renderiza SuggestedQuestions com as strings
7. Clique num chip → sendMessage(text) → auto-submit direto para o streaming
```

> **Nota**: O SidePanel busca as questions independentemente (não depende do
> `activeElementData` vindo do page.tsx). Isso elimina a race condition onde
> `handleNavigatorChange` capturava o estado de `questions` antes do fetch
> assíncrono completar.

## Componente `SuggestedQuestions`

### Props

| Prop | Tipo | Descrição |
|------|------|-----------|
| `questions` | `string[]` | Textos das perguntas sugeridas |
| `onQuestionClick` | `(question: string) => void` | Callback de clique — recebe o texto da pergunta |
| `disabled` | `boolean` | Desativa os chips durante streaming (default: `false`) |

### Comportamento

- Se `questions` está vazio → retorna `null` (nenhum render)
- Chips em scroll horizontal fluido (sem scrollbar visível)
- Animação stagger via framer-motion (cada chip entra com 50ms de delay)
- `key={questions.join(",")}` no container → anima transição quando o elemento muda
- Chips desativados durante streaming (`disabled={isStreaming}`)

### Estética

Design Sci-Fi/Bio-Tech consistente com o SidePanel:
- `rounded-full` — formato pílula
- `bg-white/5` + `border-white/10` — fundo semi-transparente com borda sutil
- `hover:border-primary/40` + `hover:bg-primary/10` — borda acende em hover
- `font-mono` + `text-[10px]` — tipografia técnica compacta
- Header "Sugestões" com ícone `Sparkles` em `text-[9px]` tracking-widest

## Decisão de UX: Auto-Submit

### O que acontece

Clicar num chip **envia a pergunta imediatamente** para a IA. Não insere texto no input para o utilizador editar — vai direto para o streaming.

### Por quê

1. **Redução de atrito:** A pergunta já foi gerada pela IA com contexto do elemento. Editar não agrega valor na maioria dos casos.
2. **Expectativa do utilizador:** Chips clicáveis em interfaces de chat (Google, ChatGPT) sempre fazem auto-submit. Violar esta convenção causaria confusão.
3. **Início de contexto RAG:** O primeiro turno no chat define o contexto RAG. Fazê-lo com 1 clique maximiza engagement.

### Como funciona tecnicamente

A lógica de envio foi extraída de `handleSubmit` para `sendMessage(text: string)`:

```
handleSubmit(FormEvent)  →  sendMessage(input)      ← digitou + Enter
onQuestionClick(text)    →  sendMessage(text)        ← clicou no chip
```

Ambos os caminhos convergem para `sendMessage`, que:
1. Valida o texto (trim, vazio, streaming em curso)
2. Limpa o input
3. Adiciona mensagem do user
4. Inicia streaming para a IA
5. Concatena chunks na mensagem do model

## Integração no SidePanel

O `SidePanel` busca as questions **por conta própria** via rota pública, sem depender do `activeElementData` vindo do page.tsx:

```typescript
// Estado local
const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
const [dataForElement, setDataForElement] = useState<string | null>(null);

// Reset síncrono quando o elemento muda (React Compiler-compatible)
if (dataForElement !== selectedElementId) {
  setDataForElement(selectedElementId);
  setElementData(null);
  setSuggestedQuestions([]);
}

// Fetch paralelo com Promise.allSettled
useEffect(() => {
  if (!selectedElementId) return;
  const controller = new AbortController();
  let cancelled = false;

  async function fetchPanelData() {
    const [dataResult, questionsResult] = await Promise.allSettled([
      fetch(`/api/v1/processograms/${processogramId}/data/public`, { signal: controller.signal }),
      fetch(`/api/v1/processograms/${processogramId}/questions/public`, { signal: controller.signal }),
    ]);
    if (cancelled) return;
    // ... filtra questionsResult por selectedElementId → setSuggestedQuestions(string[])
  }

  fetchPanelData();
  return () => { cancelled = true; controller.abort(); };
}, [processogramId, selectedElementId]);
```

E passa para o `ChatWidget`:

```tsx
<ChatWidget
  processogramId={processogramId}
  elementContext={selectedElementId}
  suggestedQuestions={suggestedQuestions}
/>
```

### Rota pública utilizada

| Método | Rota | Auth |
|--------|------|------|
| `GET` | `/processograms/:processogramId/questions/public` | ❌ (pública) |

Retorna todas as `ProcessogramQuestion` do processograma. O SidePanel filtra localmente por `elementId`.

## Layout Final do SidePanel

```
┌─ header (título + fechar) ─────────────┐
├─ description (dados do elemento) ──────┤
├─ ChatWidget ───────────────────────────┤
│   ├─ mensagens (flex-1, scroll-y)      │
│   ├─ SuggestedQuestions (chips, fixo)  │
│   └─ form (input + send, fixo)         │
└─────────────────────────────────────────┘
```

Os chips ficam **fixos** entre as mensagens e o input — não scrollam junto com o histórico de chat. Isso garante que são sempre visíveis e acessíveis.
