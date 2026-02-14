# WelfareData — Design System: "Red Sci-Fi"

> Documentação da identidade visual e do sistema de design do frontend WelfareData.

---

## 1. Filosofia Visual

O design system **Red Sci-Fi** foi criado para transmitir **urgência, controle e precisão** — valores centrais à missão do Centro de Métricas de Bem-Estar Animal (WFI/FMVZ-USP).

| Conceito         | Expressão Visual                                    |
|-------------------|-----------------------------------------------------|
| **Urgência**      | Vermelho como cor primária — sangue, vida, alerta   |
| **Controle**      | Fundo escuro profundo — painel de comando, HUD      |
| **Precisão**      | Tipografia monospace em dados, bordas nítidas        |
| **Imersão**       | Dark mode como padrão, contraste alto                |
| **Institucional** | Light mode limpo para relatórios e impressão         |

---

## 2. Paleta de Cores

Todas as cores são definidas como CSS Custom Properties no formato **oklch** (espaço perceptualmente uniforme), consumidas pelo Tailwind CSS v4 via `@theme inline`.

### Dark Mode (padrão)

| Token               | oklch                          | Uso                              |
|----------------------|--------------------------------|----------------------------------|
| `--background`       | `oklch(0.13 0.005 285.823)`   | Fundo principal — quase preto    |
| `--foreground`       | `oklch(0.985 0 0)`            | Texto principal — branco suave   |
| `--primary`          | `oklch(0.637 0.237 25.331)`   | Vermelho vivo — CTAs, acentos   |
| `--primary-foreground` | `oklch(0.985 0 0)`          | Texto sobre primary              |
| `--card`             | `oklch(0.17 0.005 285.823)`   | Cards — ligeiramente mais claro  |
| `--muted`            | `oklch(0.22 0.006 286.033)`   | Áreas secundárias                |
| `--muted-foreground` | `oklch(0.705 0.015 286.067)`  | Texto secundário — cinza médio   |
| `--border`           | `oklch(1 0 0 / 10%)`          | Bordas sutis — branco 10%        |
| `--input`            | `oklch(1 0 0 / 15%)`          | Fundo de inputs — branco 15%     |
| `--ring`             | `oklch(0.637 0.237 25.331)`   | Anel de foco — vermelho          |
| `--destructive`      | `oklch(0.704 0.191 22.216)`   | Ações destrutivas — vermelho claro |

### Light Mode (institucional)

| Token               | oklch                          | Uso                              |
|----------------------|--------------------------------|----------------------------------|
| `--background`       | `oklch(0.985 0 0)`            | Fundo branco suave               |
| `--foreground`       | `oklch(0.141 0.005 285.823)`  | Texto escuro                     |
| `--primary`          | `oklch(0.577 0.245 27.325)`   | Vermelho institucional           |
| `--primary-foreground` | `oklch(0.985 0 0)`          | Texto sobre primary              |
| `--card`             | `oklch(0.985 0 0)`            | Cards — mesmo do fundo           |
| `--muted`            | `oklch(0.967 0.001 286.375)`  | Cinza claro                      |
| `--border`           | `oklch(0.92 0.004 286.32)`    | Bordas — cinza sutil             |
| `--ring`             | `oklch(0.577 0.245 27.325)`   | Anel de foco — vermelho          |

---

## 3. Arquitetura de Temas (Tailwind CSS v4)

Este projeto usa **Tailwind CSS v4**, que configura temas diretamente no CSS — **não há `tailwind.config.ts`**.

### Estrutura do `globals.css`

```
@import "tailwindcss"                   ← Core do Tailwind v4
@import "tw-animate-css"                ← Plugin de animações
@import "shadcn/tailwind.css"           ← Integração shadcn/ui

@custom-variant dark (...)              ← Variante dark via classe .dark
@theme inline { ... }                   ← Mapeamento var() → Tailwind classes

:root { ... }                           ← Variáveis Light Mode
.dark { ... }                           ← Variáveis Dark Mode

@layer base { ... }                     ← Estilos globais base
```

### Como o sistema funciona

1. As CSS Custom Properties (`--primary`, `--background`, etc.) são definidas em `:root` e `.dark`
2. O bloco `@theme inline` mapeia cada variável para uma classe Tailwind: `--color-primary: var(--primary)`
3. Isso permite usar `bg-primary`, `text-foreground`, `border-border` etc. diretamente no JSX
4. O `next-themes` alterna a classe `dark` no `<html>`, ativando automaticamente a troca de paleta

---

## 4. Como Alterar a Cor Primária

Para trocar a cor primária (ex: de vermelho para azul), edite **apenas 4 variáveis** em `globals.css`:

```css
/* :root (Light Mode) */
--primary: oklch(0.577 0.245 27.325);   /* ← altere o hue (27°) */
--ring: oklch(0.577 0.245 27.325);

/* .dark (Dark Mode) */
--primary: oklch(0.637 0.237 25.331);   /* ← altere aqui também */
--ring: oklch(0.637 0.237 25.331);
```

Para converter HSL → oklch, use: https://oklch.com

---

## 5. Tipografia

| Font         | Variável CSS           | Uso                        |
|--------------|------------------------|----------------------------|
| **Geist**    | `--font-geist-sans`   | Corpo, UI, headings        |
| **Geist Mono** | `--font-geist-mono` | Código, dados numéricos    |

Ambas são carregadas via `next/font/google` no `layout.tsx` e mapeadas no `@theme inline` como `--font-sans` e `--font-mono`.

---

## 6. Componentes UI

O projeto utiliza **shadcn/ui** (style: `new-york`) como biblioteca de componentes base.

- Componentes ficam em `src/components/ui/`
- Componentes customizados do projeto ficam em `src/components/`
- Configuração em `components.json`
- Todos os componentes shadcn respeitam automaticamente os tokens de cor definidos em `globals.css`

### Adicionando componentes shadcn

```bash
npx shadcn@latest add button
npx shadcn@latest add card
npx shadcn@latest add dialog
```

---

## 7. Animações

O projeto usa **Framer Motion** para animações complexas e `tw-animate-css` para micro-interações via Tailwind.

### Padrões recomendados

| Tipo                | Ferramenta        | Exemplo                              |
|---------------------|-------------------|---------------------------------------|
| Transição de página | Framer Motion     | `<motion.div initial/animate/exit>`  |
| Hover/Focus         | Tailwind classes  | `hover:scale-105 transition-transform`|
| Fade in             | tw-animate-css    | `animate-in fade-in`                 |
| Slide               | tw-animate-css    | `animate-in slide-in-from-bottom`    |
| Glow / Pulse        | Framer Motion     | `animate={{ opacity: [0.5, 1, 0.5] }}` |

---

## 8. Estrutura de Pastas do Frontend

```
frontend/src/
├── app/                    # App Router (pages, layouts, loading, error)
│   ├── globals.css         # Design tokens + tema
│   ├── layout.tsx          # Root layout com providers
│   └── page.tsx            # Home page
├── components/             # Componentes do projeto
│   └── ui/                 # Componentes shadcn/ui
├── hooks/                  # Custom hooks
├── lib/                    # Utilitários (cn, api client)
├── providers/              # Context providers (AppProviders)
└── types/                  # Tipos TypeScript compartilhados
```

---

## 9. Decisões de Design (ADR)

| Decisão                         | Razão                                                    |
|----------------------------------|----------------------------------------------------------|
| Dark mode como padrão            | Alinhado à estética Sci-Fi e conforto visual prolongado  |
| oklch como espaço de cor         | Perceptualmente uniforme, padrão do Tailwind v4          |
| Vermelho como primary            | Urgência + vida + missão institucional do WFI            |
| `next-themes` com `attribute="class"` | Compatível com Tailwind `@custom-variant dark`     |
| `enableSystem={false}`           | Força experiência consistente, evita surpresas de tema   |
| `staleTime: 60s` no React Query  | Reduz re-fetches desnecessários sem cache stale demais   |
