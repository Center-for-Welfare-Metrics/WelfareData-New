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

### `react-zoom-pan-pinch`

Biblioteca escolhida para interação tipo "Google Maps":

| Feature             | Implementação                                    |
|---------------------|--------------------------------------------------|
| Zoom (scroll)       | `minScale: 0.2` → `maxScale: 8`                 |
| Pan (arrastar)      | `limitToBounds: false` — navegação livre          |
| Double-click zoom   | `mode: "zoomIn"`, `step: 0.7`                    |
| Center on init      | `centerOnInit: true`                              |
| Controles programáticos | `ref.current.zoomIn()`, `zoomOut()`, `centerView()` |

### Renderização SVG

O SVG é carregado como texto (fetch da URL no GCS) e renderizado via `dangerouslySetInnerHTML`:

```tsx
<div dangerouslySetInnerHTML={{ __html: svgContent }} />
```

**Por que não `<img src={url}>`?**
- `dangerouslySetInnerHTML` preserva interatividade do SVG (hover states, IDs, classes)
- Permite futura integração com tooltips nos elementos do processograma
- O SVG já foi sanitizado pelo pipeline SVGO no upload (backend)

**Segurança:** O SVG passa por SVGO 4 no backend durante o upload — scripts maliciosos são removidos. O conteúdo exibido é o SVG processado armazenado no GCS.

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
├─ Header Minimalista
│   ├─ Logo WelfareData (link para /)
│   ├─ Nome do processograma (quando carregado)
│   └─ Botão "Login" (se não autenticado)
│
├─ Estado de Loading (Loader + texto)
├─ Estado de Erro (ícone + mensagem + link voltar)
│
└─ ProcessogramViewer (quando ready)
    ├─ TransformWrapper (zoom/pan engine)
    │   └─ TransformComponent
    │       └─ SVG via dangerouslySetInnerHTML
    │
    ├─ HUD Controls (absoluto, direita)
    │   ├─ Zoom In
    │   ├─ Zoom Out
    │   ├─ Reset (escala 1)
    │   └─ Fit to Screen
    │
    └─ Hint Bar (absoluto, inferior)
        └─ "Scroll para zoom · Arraste para navegar"
```

### Design Decisions

| Decisão                           | Razão                                                      |
|-----------------------------------|-------------------------------------------------------------|
| Fullscreen (`h-screen`)           | Maximiza área de visualização — imersivo                    |
| Sem Sidebar                       | Página pública não precisa de navegação do dashboard         |
| Header transparente               | Não obstrui o conteúdo, integra com a estética               |
| HUD Controls com `bg-black/50`    | Visíveis sobre qualquer fundo de SVG                        |
| `AnimatePresence` para estados    | Transições suaves entre loading → ready/error               |
| `cursor-grab` / `cursor-grabbing` | Feedback visual de que o canvas é arrastável                |

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
