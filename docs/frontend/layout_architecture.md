# WelfareData — Arquitetura de Layout (App Shell)

> Documentação da estrutura de layout mestre da aplicação frontend.

---

## 1. Visão Geral

O layout segue o padrão **App Shell** — uma estrutura estável composta por Sidebar, Header e Área de Conteúdo que persiste entre navegações, proporcionando uma experiência de "painel de controle" (HUD).

```
┌────────────────────────────────────────────────┐
│  Sidebar (w-60)  │  Header (h-14, sticky)      │
│                  │──────────────────────────────│
│  ● Logo/Brand    │  Breadcrumbs   Theme  Avatar │
│  ● Dashboard     │                              │
│  ● Processogramas│                              │
│  ● Espécies      │    Área de Conteúdo          │
│  ● Admin         │    (overflow-y-auto)         │
│                  │                              │
│  ○ System Online │                              │
└────────────────────────────────────────────────┘
```

---

## 2. Componentes

### 2.1 `DashboardLayout`

**Caminho:** `src/components/layout/DashboardLayout.tsx`

Componente raiz do App Shell. Compõe Sidebar + Header + children.

| Responsabilidade                     | Implementação                                |
|--------------------------------------|----------------------------------------------|
| Layout flexbox horizontal            | `flex h-screen overflow-hidden`              |
| Sidebar desktop (fixa)               | `aside` com `hidden lg:flex`, `w-60`         |
| Sidebar mobile (Sheet)               | `Sheet` do shadcn, `side="left"`, `w-60`     |
| Estado mobile open/close             | `useState` controlando `Sheet`               |
| Área de conteúdo com scroll isolado  | `main` com `flex-1 overflow-y-auto`          |

**Uso:**
```tsx
import { DashboardLayout } from "@/components/layout";

export default function Page() {
  return (
    <DashboardLayout>
      <h1>Conteúdo da página</h1>
    </DashboardLayout>
  );
}
```

### 2.2 `AppSidebar` (SidebarContent + SidebarNav)

**Caminho:** `src/components/layout/AppSidebar.tsx`

| Elemento            | Descrição                                              |
|---------------------|--------------------------------------------------------|
| **Logo/Brand**      | Ícone `Activity` + "WelfareData v1.0 — WFI/USP"       |
| **Nav Links**       | Renderizados a partir de `nav-config.ts`               |
| **Active Indicator**| Barra lateral vermelha (w-0.75) + fundo glow com `motion.div layoutId` |
| **System Status**   | Indicador pulsante verde "System Online"               |

**Estética Sci-Fi:**
- Fundo: `bg-background/95 backdrop-blur`
- Borda: `border-r border-border/40`
- Item ativo: glow vermelho via `box-shadow` com valor oklch do `--primary`
- Hover: `motion.div whileHover={{ scale: 1.1 }}` nos ícones
- Transição: `layoutId` do Framer Motion para animação suave entre itens

### 2.3 `AppHeader`

**Caminho:** `src/components/layout/AppHeader.tsx`

| Elemento            | Descrição                                              |
|---------------------|--------------------------------------------------------|
| **Menu Toggle**     | `Button ghost` visível apenas em mobile (`lg:hidden`)  |
| **Breadcrumbs**     | Gerados dinamicamente a partir de `usePathname()`      |
| **Theme Toggle**    | Ícones `Sun`/`Moon` com rotação animada via CSS        |
| **Avatar Menu**     | `DropdownMenu` com opções Perfil/Configurações/Sair    |

**Glassmorphism:**
- `sticky top-0 z-50`
- `bg-background/80 backdrop-blur-xl`
- `supports-backdrop-filter:bg-background/60`
- Borda inferior: `border-b border-border/40`

### 2.4 `nav-config.ts`

**Caminho:** `src/components/layout/nav-config.ts`

Arquivo declarativo com a configuração de navegação:

```ts
export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard",      href: "/",               icon: LayoutDashboard },
  { label: "Processogramas", href: "/processogramas",  icon: Network },
  { label: "Espécies",       href: "/especies",        icon: PawPrint },
  { label: "Admin",          href: "/admin",            icon: ShieldCheck, adminOnly: true },
];
```

---

## 3. Como Adicionar Novos Itens ao Menu

### Passo 1 — Editar `nav-config.ts`

Adicione um novo objeto ao array `NAV_ITEMS`:

```ts
import { Microscope } from "lucide-react";

export const NAV_ITEMS: NavItem[] = [
  // ... itens existentes
  { label: "Análises", href: "/analises", icon: Microscope },
];
```

### Passo 2 — Criar a rota

Crie a pasta e arquivo da página correspondente:

```
src/app/analises/page.tsx
```

### Passo 3 — (Opcional) Restringir acesso

Para itens visíveis apenas a admins, adicione `adminOnly: true`:

```ts
{ label: "Análises", href: "/analises", icon: Microscope, adminOnly: true },
```

> **Nota:** A flag `adminOnly` está preparada na interface mas a filtragem de permissão ainda não está implementada. Será integrada quando o módulo de autenticação do frontend for criado.

---

## 4. Responsividade

| Breakpoint    | Sidebar              | Header                         |
|---------------|----------------------|--------------------------------|
| `< lg` (mobile) | Oculta, abre via Sheet | Mostra botão Menu, esconde breadcrumbs em `< sm` |
| `≥ lg` (desktop) | Fixa, 240px (w-60)  | Sem botão Menu, breadcrumbs visíveis |

---

## 5. Fluxo de Dados

```
page.tsx
  └─ DashboardLayout (client)
       ├─ aside (desktop)
       │   └─ SidebarContent
       │        ├─ Logo/Brand
       │        ├─ SidebarNav (usePathname → active state)
       │        └─ Status Indicator
       ├─ Sheet (mobile)
       │   └─ SidebarContent (onNavigate → close sheet)
       └─ div.flex-col
            ├─ AppHeader (usePathname → breadcrumbs, useTheme → toggle)
            └─ main (children)
```

---

## 6. Dependências

| Pacote            | Uso no Layout                              |
|-------------------|--------------------------------------------|
| `framer-motion`   | Animações de sidebar ativa (`layoutId`), hover dos ícones, fade-in do conteúdo |
| `next-themes`     | Toggle dark/light no Header                |
| `lucide-react`    | Ícones de navegação e UI                   |
| `shadcn/ui`       | Sheet, Button, Separator, ScrollArea, Breadcrumb, DropdownMenu, Avatar, Tooltip |

---

## 7. Decisões de Design (ADR)

| Decisão                                    | Razão                                                          |
|--------------------------------------------|----------------------------------------------------------------|
| DashboardLayout como componente (não route group) | Permite uso seletivo por página, não force layout em todas     |
| `layoutId` do Framer para active indicator | Animação fluida sem re-render, segue o item ativo suavemente   |
| Sheet do shadcn para mobile                | Acessível (foco preso, ESC fecha, overlay), animação built-in  |
| Breadcrumbs dinâmicos via pathname         | Zero configuração manual, escala com novas rotas               |
| `nav-config.ts` separado                   | Single source of truth, fácil de manter e testar               |
| `h-screen` + `overflow-hidden` no root     | Controle total do scroll, header nunca sai da viewport          |
