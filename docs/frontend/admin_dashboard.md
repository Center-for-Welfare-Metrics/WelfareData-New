# Dashboard Administrativo & Fluxo de Upload

## Visão Geral

O Dashboard (`/dashboard`) é a interface central de gestão de processogramas. Permite listar todos os processogramas existentes, fazer upload de novos SVGs com metadata associada, e gerenciar (visualizar/deletar) os registros.

---

## Arquitetura de Componentes

```
/dashboard (page.tsx)
├── DashboardLayout              ← Shell com Sidebar + Header
├── UploadZone (Dialog)          ← Drag & Drop + Form de metadata
│   ├── react-dropzone           ← Aceita apenas .svg
│   └── Progress (shadcn/ui)     ← Barra simulada durante upload
├── ProcessogramCard[]           ← Grid de cards com status
│   ├── Badge (shadcn/ui)        ← Indicador de status
│   └── AlertDialog (shadcn/ui)  ← Confirmação de exclusão
└── React Query                  ← Cache, invalidação, mutações
```

---

## Fluxo de Upload

### 1. Seleção do Arquivo

O `UploadZone` usa `react-dropzone` configurado para aceitar apenas `image/svg+xml (.svg)`, limitado a 1 arquivo por vez.

```
Drag & Drop / Clique
  → onDrop([file])
  → Extrai nome do arquivo (sem extensão)
  → Avança para step "form"
```

### 2. Formulário de Metadata

O usuário preenche:
- **Nome** (pré-preenchido com o nome do arquivo)
- **Espécie** (select carregado via `GET /api/v1/species`)
- **Módulo de Produção** (select dependente — carrega via `GET /api/v1/production-modules?specieId=X`)

### 3. Envio (FormData → POST)

```
handleSubmit()
  → Cria FormData com: file, name, specieId, productionModuleId
  → POST /api/v1/processograms (Content-Type: multipart/form-data)
  → Next.js proxy → Express backend
  → Backend: validação → SVGO → Puppeteer raster → GCS upload → MongoDB
```

### 4. Progresso Simulado

Durante o upload, uma barra de progresso incrementa gradualmente (0→92%) a cada 300ms com incrementos randômicos, criando a ilusão de progresso contínuo. Ao receber resposta, salta para 100%.

### 5. Invalidação de Cache

```
onSuccess:
  → queryClient.invalidateQueries({ queryKey: ["processograms"] })
  → A lista de cards atualiza automaticamente
  → toast.success("Upload concluído")
```

---

## Badges de Status — Decisão UX

### Por que usar badges visuais?

O processamento de um SVG é **assíncrono** (SVGO → Puppeteer rasterização → GCS upload → Gemini AI análise). Pode levar de segundos a minutos. O admin precisa de feedback **imediato** sobre o estado de cada processograma sem precisar clicar para saber.

| Status | Visual | Significado |
|--------|--------|-------------|
| `processing` | Badge amarela **pulsante** | SVG sendo processado (rasterização/upload) |
| `generating` | Badge amarela **pulsante** | IA gerando descrições dos elementos |
| `ready` | Badge verde **neon** | Pronto para visualização pública |
| `error` | Badge vermelha | Falha no pipeline — requer atenção |

A pulsação (animação `ping`) nas badges de processamento cria urgência visual e indica atividade em andamento, essencial quando o admin está monitorando múltiplos uploads simultâneos.

---

## Serviço de API

**Arquivo:** `services/processograms.ts`

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `getAll()` | `GET /api/v1/processograms` | Lista todos (autenticado) |
| `upload(file, meta)` | `POST /api/v1/processograms` | Upload multipart (admin) |
| `remove(id)` | `DELETE /api/v1/processograms/:id` | Remove (admin) |

---

## React Query Hooks

**Arquivo:** `hooks/useProcessograms.ts`

| Hook | Tipo | Query Key |
|------|------|-----------|
| `useProcessograms()` | Query | `["processograms"]` |
| `useUploadProcessogram()` | Mutation | Invalida `["processograms"]` |
| `useDeleteProcessogram()` | Mutation | Invalida `["processograms"]` |

---

## Zero State

Quando não há processogramas, exibe:
- Ícone grande estilizado (`ServerCrash`) com glow pulsante
- Texto convidativo
- Botão "Primeiro Upload" que abre o Dialog

Isso evita a "tela vazia" e guia o admin para a ação correta.

---

## Segurança

- `GET /processograms` requer `AuthMiddleware` (listagem autenticada)
- `POST /processograms` requer `AuthMiddleware` + `requireRole('admin')`
- `DELETE /processograms/:id` requer `AuthMiddleware` + `requireRole('admin')`
- O middleware do Next.js protege rotas `/admin/*` via cookie check (edge)
- O interceptor do axios redireciona para `/login` em 401 (exceto páginas públicas)
