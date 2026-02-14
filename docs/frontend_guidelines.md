# Frontend Guidelines — WelfareData UI

## Visão Geral

Este documento define a stack tecnológica, os padrões de UX/UI e as diretrizes visuais para o frontend do WelfareData. O objetivo é uma aplicação que funcione como um **painel de controle imersivo** no modo Dark ("Sci-Fi HUD") e se transforme em um **relatório executivo institucional** no modo Light — com um clique.

A interface prioriza **exploração, retenção e gamificação**, alinhando-se à missão do WFI de tornar dados técnicos de bem-estar animal acessíveis e envolventes.

---

## Stack Oficial

| Tecnologia | Versão | Função |
|-----------|--------|--------|
| **Next.js** | 15.x | Framework React com App Router, SSR/SSG, API Routes |
| **TypeScript** | 5.9+ | Tipagem estrita (`strict: true`), compartilhamento de tipos com backend |
| **Tailwind CSS** | 4.x | Estilização utility-first, design tokens via CSS variables |
| **shadcn/ui** | latest | Componentes base acessíveis (Radix UI + Tailwind) |
| **Framer Motion** | 12.x | Animações, transições, micro-interações, gamificação |
| **React Zoom Pan Pinch** | latest | Navegação pan/zoom nos diagramas de processograma |
| **TanStack Query** | 5.x | Gerenciamento de estado server-side, cache, mutations |

### Justificativas

- **Next.js 15 (App Router):** Server Components reduzem bundle, layouts aninhados simplificam a estrutura, streaming SSR otimiza TTI.
- **Tailwind CSS:** Consistência visual via design tokens, eliminação de CSS morto, excelente para theming dark/light.
- **shadcn/ui:** Componentes copiados (não empacotados), customizáveis sem lock-in, acessibilidade via Radix.
- **Framer Motion:** Obrigatório. A gamificação e a sensação de "exploração" dependem de animações fluidas.
- **TanStack Query:** Separação clara entre estado de UI e estado do servidor, invalidação inteligente, SSR prefetch.

---

## Diretrizes de UX/UI

### Temas

O sistema deve suportar **dois temas completos** com troca instantânea:

| Tema | Propósito | Ativação |
|------|-----------|----------|
| **Dark Mode** (default) | Exploração, análise, interação diária | Padrão ao carregar |
| **Light Mode** | Relatórios, apresentações executivas, impressão | Toggle no header |

A implementação usa CSS custom properties no `:root` e `[data-theme="light"]`, integradas ao sistema de tokens do Tailwind.

### Dark Mode — Estética "Sci-Fi HUD"

A interface Dark deve evocar a sensação de um **Head-Up Display** de ficção científica:

#### Paleta de Cores

| Token | Valor | Uso |
|-------|-------|-----|
| `--bg-primary` | `#0a0e17` | Fundo principal (quase preto azulado) |
| `--bg-secondary` | `#111827` | Cards, sidebars |
| `--bg-elevated` | `#1a2332` | Modais, popovers |
| `--border-subtle` | `rgba(56, 189, 248, 0.12)` | Bordas finas onipresentes |
| `--border-active` | `rgba(56, 189, 248, 0.4)` | Bordas em hover/focus |
| `--accent-cyan` | `#38bdf8` | Acento primário (links, ícones ativos) |
| `--accent-green` | `#34d399` | Status positivo, sucesso, "online" |
| `--accent-amber` | `#fbbf24` | Warnings, atenção |
| `--accent-red` | `#f87171` | Erros, exclusão |
| `--text-primary` | `#e2e8f0` | Texto principal |
| `--text-secondary` | `#94a3b8` | Texto auxiliar, labels |
| `--text-muted` | `#475569` | Texto desabilitado |

#### Efeitos Visuais

- **Glassmorphism:** Cards com `backdrop-blur-md` e `bg-white/5`, bordas de 1px semi-transparentes.
- **Glow sutil:** Acentos neon com `box-shadow: 0 0 20px rgba(56, 189, 248, 0.1)` em hover.
- **Scan lines:** Background pattern sutil (opcional, apenas em áreas decorativas).
- **Fontes técnicas:** `JetBrains Mono` para dados numéricos e IDs; `Inter` para texto corrido.

#### Exemplo de Card

```
┌─────────────────────────────────────────┐  ← border: 1px solid var(--border-subtle)
│                                         │  ← bg: rgba(255,255,255,0.03)
│  ┌─ ELEMENT ID ────────────────────┐    │  ← backdrop-blur-md
│  │  sow--ps                        │    │  ← font: JetBrains Mono, cyan
│  └──────────────────────────────────┘    │
│                                         │
│  Production System                      │  ← text-secondary, uppercase, tracking-wider
│                                         │
│  Sistema de produção de suínos          │  ← text-primary, Inter
│  reprodutoras envolvendo ciclos de...   │
│                                         │
│  ┌──────┐  ┌──────┐  ┌──────┐          │  ← action buttons com glow on hover
│  │ View │  │ Edit │  │ Chat │          │
│  └──────┘  └──────┘  └──────┘          │
└─────────────────────────────────────────┘
```

### Light Mode — Estética Institucional

- **Fundo:** Branco puro (`#ffffff`) com cinzas suaves para cards (`#f8fafc`).
- **Bordas:** `#e2e8f0` sólidas, sem glow.
- **Acentos:** Azul institucional WFI (`#2563eb`), sem neon.
- **Tipografia:** Mesmo `Inter`, sem `JetBrains Mono`.
- **Sem animações decorativas:** Apenas transições funcionais (fade, slide).
- **Otimizado para impressão:** `@media print` remove sidebars, ajusta contrastes.

### Gamificação

O uso de `framer-motion` é **obrigatório** para os seguintes padrões:

| Padrão | Implementação | Propósito |
|--------|---------------|-----------|
| **Entrada escalonada** | `staggerChildren` em listas | Elementos "aparecem" um a um |
| **Hover reveal** | `whileHover={{ scale: 1.02, borderColor: accent }}` | Feedback tátil |
| **Fog of War** | Elementos iniciam com `opacity: 0, filter: blur(8px)` | Revelação progressiva |
| **Tooltip animado** | `AnimatePresence` com `spring` transition | Informação contextual |
| **Confetti/Pulse** | Após ações de sucesso (salvar, analisar) | Reforço positivo |
| **Page transitions** | `layout` prop + `AnimatePresence` | Fluidez entre páginas |
| **Loading skeletons** | `animate={{ opacity: [0.3, 1, 0.3] }}` pulsante | Percepção de velocidade |

#### Fog of War — Revelação Progressiva

Conceito central de retenção: informações são reveladas conforme o usuário explora.

```
Estado inicial:
┌──────────────────────────┐
│  ████████████████████    │  ← blur + opacity 0.3
│  ██ Elemento oculto ██   │
│  ████████████████████    │
└──────────────────────────┘

Após hover/click:
┌──────────────────────────┐
│  Sistema de produção     │  ← animação: blur → clear, scale 0.95 → 1
│  de suínos reprodutoras  │
│  envolvendo ciclos...    │
└──────────────────────────┘
```

### Navegação do Processograma

O componente de visualização SVG usa `react-zoom-pan-pinch`:

- **Pan:** Arrastar com mouse/touch
- **Zoom:** Scroll/pinch, com limites min/max
- **Minimap:** Visão geral do diagrama no canto inferior-direito
- **Click em elemento:** Abre sidebar com descrição, vídeo e chat contextual
- **Highlight:** Elemento ativo recebe borda glow animada

---

## Estrutura de Pastas (Next.js App Router)

```
client/
├── public/
│   └── fonts/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── register/page.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx                    # Home / Species list
│   │   │   ├── species/[pathname]/
│   │   │   │   └── page.tsx                # Production Modules list
│   │   │   └── processogram/[id]/
│   │   │       └── page.tsx                # Visualizador SVG + Chat
│   │   ├── layout.tsx                      # Root layout (theme provider)
│   │   └── globals.css                     # Tokens + Tailwind
│   ├── components/
│   │   ├── ui/                             # shadcn/ui components
│   │   ├── processogram/
│   │   │   ├── SvgViewer.tsx               # Zoom/Pan + element click
│   │   │   ├── ElementSidebar.tsx          # Descrição + vídeo
│   │   │   └── ChatPanel.tsx               # Chat streaming
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── ThemeToggle.tsx
│   │   └── shared/
│   │       ├── FogOfWar.tsx                # Revelação progressiva
│   │       └── AnimatedCard.tsx
│   ├── hooks/
│   │   ├── useChat.ts                      # SSE consumer
│   │   ├── useProcessogram.ts
│   │   └── useTheme.ts
│   ├── lib/
│   │   ├── api.ts                          # Fetch wrapper (/api/v1/...)
│   │   └── query-client.ts                 # TanStack Query config
│   └── types/
│       └── index.ts                        # Tipos compartilhados
├── tailwind.config.ts
├── next.config.ts
├── tsconfig.json
└── package.json
```

---

## Comunicação com Backend

### Base URL

```typescript
// lib/api.ts
const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
```

- **Desenvolvimento:** Next.js dev server com `rewrites` no `next.config.ts` proxy para `http://localhost:8080/api/v1`.
- **Produção:** Express serve os estáticos do Next.js build; API e frontend na mesma origem.

### Autenticação

Cookies HttpOnly são enviados automaticamente pelo browser (`credentials: 'include'`). Não há token no localStorage.

### Chat Streaming (SSE Consumer)

```typescript
// hooks/useChat.ts — padrão conceitual
const response = await fetch('/api/v1/chat/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ processogramId, message, history }),
});

const reader = response.body!.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const text = decoder.decode(value);
  // Parse SSE lines: "data: {...}\n\n"
}
```

---

## Convenções

| Aspecto | Padrão |
|---------|--------|
| Componentes | `PascalCase.tsx`, um componente por arquivo |
| Hooks | `camelCase.ts`, prefixo `use` |
| Pastas de rota | `kebab-case` (Next.js convention) |
| Estilização | Tailwind classes inline, `cn()` helper para merge |
| Estado server | TanStack Query (nunca `useState` para dados remotos) |
| Estado UI | `useState` / `useReducer` locais |
| Animações | Framer Motion (`motion.div`), nunca CSS `@keyframes` manual |
| Temas | CSS custom properties, nunca valores hardcoded |
| Acessibilidade | Mínimo WCAG 2.1 AA, `aria-*` via Radix/shadcn |

---

## Princípios de Design

1. **"Show, don't tell"** — Priorizar visualização de dados sobre tabelas de texto.
2. **"Progressive disclosure"** — Fog of War: não sobrecarregar o usuário, revelar sob demanda.
3. **"Delight in details"** — Micro-animações que recompensam interação.
4. **"Two personas, one app"** — Pesquisador (Dark/exploratório) e Diretor (Light/relatório).
5. **"API-first"** — UI é consumidor do backend; nunca acessar banco diretamente.
