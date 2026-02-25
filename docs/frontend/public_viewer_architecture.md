# WelfareData — Visualizador Público de Processogramas

> Documentação da arquitetura do visualizador público (`/view/[id]`).

---

## 1. Modelo de Acesso: Public Read / Private Write

```
                    ┌────────────────────────────┐
                    │     GET /processograms/:id  │
                    │       🔓 PÚBLICO            │
                    │                            │
  Qualquer pessoa ──►  Leitura de 1 processograma │
  com o link        │  (sem dados sensíveis)     │
                    └────────────────────────────┘

                    ┌────────────────────────────┐
                    │  GET /  · POST · PUT · DELETE│
                    │       🔒 PRIVADO            │
                    │                            │
  Apenas admins ────►  Listagem, Criação,         │
  autenticados      │  Edição, Exclusão          │
                    └────────────────────────────┘
```

### Por que a visualização é pública?

| Razão                | Detalhe                                                      |
|----------------------|--------------------------------------------------------------|
| **Shareability**     | Pesquisadores e stakeholders precisam compartilhar links de processogramas via email, relatórios e publicações sem criar conta |
| **Transparência**    | O WFI publica dados abertos — visualização sem barreira é coerente com a missão institucional |
| **Usabilidade**      | Elimina fricção — um clique e o processograma está visível   |

### Por que a escrita é privada?

| Razão                | Detalhe                                                      |
|----------------------|--------------------------------------------------------------|
| **Integridade**      | Apenas operadores autorizados podem alterar dados científicos |
| **Auditoria**        | Todo processograma tem `creatorId` — rastreabilidade total   |
| **RBAC**             | Apenas `role: admin` pode criar/editar/deletar               |

---

## 2. Isolamento por ID

O endpoint público **só aceita ID específico** — não há listagem pública.

```
✅  GET /api/v1/processograms/507f1f77bcf86cd799439011   (público)
❌  GET /api/v1/processograms/                            (requer auth)
```

Isso garante que:
- Um visitante só acessa o processograma **se possuir o link** (conhecimento do ID)
- Não é possível enumerar/listar todos os processogramas sem autenticação
- IDs são ObjectIds do MongoDB (24 caracteres hex) — não sequenciais, não adivinháveis

### Dados retornados no GET público

O endpoint retorna metadados do processograma (nome, URLs dos SVGs, status) — **não expõe**:
- Dados de outros processogramas
- Informações de outros usuários
- Dados de análise AI (esses estão em endpoints separados e protegidos)

---

## 3. Stack do Visualizador

### `react-inlinesvg` + GSAP viewBox (v2)

> ⚠️ **Nota:** A arquitetura foi migrada de `dangerouslySetInnerHTML` + `react-zoom-pan-pinch`
> para `react-inlinesvg` + GSAP viewBox nativo. Ver `svg_navigation_architecture.md` para detalhes.

| Feature             | Implementação                                    |
|---------------------|--------------------------------------------------|
| Injeção SVG         | `react-inlinesvg` com `innerRef` → DOM real      |
| Zoom/Câmera         | GSAP anima atributo `viewBox` nativo (zero desfoque) |
| Pan                 | Deslocamento via viewBox (não CSS transform)     |
| Drill-down          | `useNavigator` → `changeLevelTo` com animação    |
| Isolamento visual   | GSAP `filter: brightness()` + CSS classes        |

### Renderização SVG

O SVG é carregado e injetado como DOM real via `react-inlinesvg`:

```tsx
<SVG src={svgUrl} innerRef={handleSvgRef} className="size-full" />
```

Após injeção, `sanitizeSvgElement()` prepara o SVG para o sistema de câmera:
1. Cria `viewBox` a partir de `width`/`height` se necessário
2. Substitui `width`/`height` fixos por `"100%"` (dimensões relativas ao container)
3. Define `preserveAspectRatio="xMidYMid meet"` para enquadramento centralizado
4. Define `overflow="visible"` para transições de viewBox

**Segurança:** O SVG passa por SVGO 4 no backend durante o upload — scripts maliciosos são removidos.

### Tema Responsivo

O visualizador detecta o tema atual via `useTheme()` e seleciona:
- `svg_url_dark` no dark mode (padrão)
- `svg_url_light` no light mode
- Fallback para o tema disponível se um não existir

---

## 4. Arquitetura da Página

```
/view/[id]/page.tsx (Client Component)
│
├─ Header Minimalista (h-12, shrink-0)
│   ├─ Logo WelfareData (link para /)
│   ├─ Nome do processograma (quando carregado)
│   └─ Botão "Login" (se não autenticado)
│
├─ Estado de Loading (Loader + texto)
├─ Estado de Erro (ícone + mensagem + link voltar)
│
└─ Container Principal (div.relative.flex-1.overflow-hidden)
    └─ ProcessogramInteractiveLayer (div.size-full)
        └─ ProcessogramViewer (motion.div.size-full)
            └─ <svg width="100%" height="100%" viewBox="..." preserveAspectRatio="xMidYMid meet">
                 ← Injetado por react-inlinesvg, sanitizado por sanitizeSvgElement()
    ├─ ProcessogramBreadcrumb (absolute, z-50, top-left)
    └─ SidePanel (absolute, z-30, right)
```

### Cadeia de Layout

```
div.flex.h-screen.flex-col.overflow-hidden     ← viewport inteiro
  header.h-12.shrink-0                         ← cabeçalho fixo 48px
  div.relative.flex-1.overflow-hidden           ← restante (BFC para height:100%)
    motion.div.size-full                        ← AnimatePresence wrapper
      div.size-full (InteractiveLayer)          ← intercepta cliques
        motion.div.size-full (ProcessogramViewer) ← container do SVG
          <svg width="100%" height="100%">      ← dimensões relativas ao pai
```

> **Nota:** O `overflow-hidden` no `flex-1` é essencial para criar um Block Formatting Context
> que permite a propagação correta de `height: 100%` para toda a cadeia de filhos.
> O SVG usa atributos nativos `width="100%"` e `height="100%"` (não apenas CSS) como rede de
> segurança para dimensionamento, combinado com `preserveAspectRatio="xMidYMid meet"` para
> centralização do conteúdo.

### Design Decisions

| Decisão                           | Razão                                                      |
|-----------------------------------|-------------------------------------------------------------|
| Fullscreen (`h-screen`)           | Maximiza área de visualização — imersivo                    |
| `overflow-hidden` no `flex-1`     | Cria BFC, resolve herança de `height: 100%`, contém SVG    |
| SVG `width/height="100%"`         | Dimensões relativas por atributo nativo (rede de segurança)|
| `preserveAspectRatio` meet        | Centraliza conteúdo SVG sem distorção                      |
| Header transparente               | Não obstrui o conteúdo, integra com a estética              |
| `AnimatePresence` para estados    | Transições suaves entre loading → ready/error               |

---

## 5. Middleware e Rotas

### Frontend Middleware (`middleware.ts`)

A rota `/view/*` está na lista `PUBLIC_PREFIXES` — o middleware de autenticação **não bloqueia** o acesso:

```ts
const PUBLIC_PREFIXES = ["/view", "/login"];
```

Usuários anônimos acessam `/view/[id]` sem redirecionamento para `/login`.

### Backend Rotas (`processogramRoutes.ts`)

```ts
// Public — sem AuthMiddleware
router.get('/:id', ProcessogramController.show);

// Private — com AuthMiddleware
router.get('/', AuthMiddleware, ProcessogramController.list);
router.post('/', AuthMiddleware, requireRole('admin'), ...);
router.put('/:id', AuthMiddleware, requireRole('admin'), ...);
router.delete('/:id', AuthMiddleware, requireRole('admin'), ...);
```

---

## 6. Como Adicionar Novas Rotas Públicas

### Frontend

Adicione o prefixo ao array `PUBLIC_PREFIXES` em `src/middleware.ts`:

```ts
const PUBLIC_PREFIXES = ["/view", "/login", "/nova-rota-publica"];
```

### Backend

Remova o `AuthMiddleware` da rota desejada em `processogramRoutes.ts`:

```ts
// Antes (privado)
router.get('/:id/data', AuthMiddleware, Controller.method);

// Depois (público)
router.get('/:id/data', Controller.method);
```

> ⚠️ **Cuidado:** Antes de tornar qualquer endpoint público, avalie se os dados retornados contêm informações sensíveis de outros usuários.
