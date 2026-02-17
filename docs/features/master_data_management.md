# Gerenciamento de Dados Mestres (Espécies e Módulos)

## Visão Geral

O sistema **WelfareData** organiza dados de bem-estar animal em uma hierarquia de três níveis:

```
Espécie (Specie)
 └── Módulo de Produção (ProductionModule) — N por espécie
      └── Processograma (Processogram) — N por módulo
```

As páginas de **Dados Mestres** permitem criar e gerenciar Espécies e Módulos de Produção, que são pré-requisitos para o upload de processogramas.

---

## Rotas Administrativas

| Rota                    | Descrição                     |
| ----------------------- | ----------------------------- |
| `/admin`                | Dashboard com estatísticas    |
| `/admin/processograms`  | Listagem e upload de SVGs     |
| `/admin/species`        | CRUD de Espécies              |
| `/admin/modules`        | CRUD de Módulos de Produção   |

Todas protegidas pelo middleware de autenticação (cookie `token`).

---

## Endpoints da API (Backend)

### Espécies — `/api/v1/species`

| Método   | Rota          | Descrição                  | Auth   |
| -------- | ------------- | -------------------------- | ------ |
| `GET`    | `/`           | Lista todas as espécies    | ✅ JWT |
| `POST`   | `/`           | Cria uma nova espécie      | ✅ JWT |
| `PATCH`  | `/:id`        | Atualiza uma espécie       | ✅ JWT |
| `DELETE` | `/:id`        | Remove uma espécie         | ✅ JWT |

**Payload de criação:**

```json
{ "name": "Suínos", "description": "Espécie suína" }
```

O campo `pathname` é gerado automaticamente a partir do `name`.

### Módulos de Produção — `/api/v1/production-modules`

| Método   | Rota          | Descrição                           | Auth   |
| -------- | ------------- | ----------------------------------- | ------ |
| `GET`    | `/`           | Lista módulos (filtro `?specieId=`) | ✅ JWT |
| `POST`   | `/`           | Cria um novo módulo                 | ✅ JWT |
| `PATCH`  | `/:id`        | Atualiza um módulo                  | ✅ JWT |
| `DELETE` | `/:id`        | Remove um módulo                    | ✅ JWT |

**Payload de criação:**

```json
{
  "name": "Maternidade",
  "specieId": "664abc...",
  "description": "Fase de maternidade"
}
```

O campo `slug` é gerado automaticamente a partir do `name`.

---

## Arquitetura Frontend

```
services/
  species.ts           → Chamadas HTTP (axios)
  modules.ts

hooks/
  useSpecies.ts        → React Query (queries + mutations)
  useModules.ts

app/admin/
  species/page.tsx     → Página CRUD de Espécies
  modules/page.tsx     → Página CRUD de Módulos
```

### Fluxo de Dados

1. **Services** (`services/species.ts`, `services/modules.ts`) — encapsulam chamadas ao backend via `api` (axios com `withCredentials: true`).
2. **Hooks** (`useSpecies`, `useModules`) — React Query gerencia cache, invalidação e estados de loading/error.
3. **Pages** — consomem hooks e renderizam com shadcn/ui (Table, Dialog, AlertDialog) + framer-motion.

### Filtro de Módulos por Espécie

A página de Módulos exibe pills de filtro baseadas nas espécies disponíveis. Ao selecionar uma espécie, `useModules(specieId)` refaz a query passando `?specieId=` no endpoint.

---

## Componentes shadcn/ui Utilizados

- **Table** — listagem com cabeçalhos estilizados
- **Dialog** — formulário de criação (react-hook-form + zod)
- **AlertDialog** — confirmação de remoção
- **Badge** — tags visuais (pathname da espécie, nome da espécie no módulo)
- **motion.tr** — animação de entrada por linha

---

## Fluxo de Criação

### Espécie

1. Usuário clica em "Nova Espécie"
2. Preenche nome (obrigatório, min 2 chars) e descrição (opcional)
3. Validação via zod
4. `POST /api/v1/species` → invalidação da query `["species"]`

### Módulo de Produção

1. Usuário clica em "Novo Módulo"
2. Seleciona espécie (obrigatório), preenche nome e descrição
3. Validação via zod
4. `POST /api/v1/production-modules` → invalidação da query `["production-modules"]`

---

## Design System

Estética **Red Sci-Fi** consistente com o restante da aplicação:

- Cores primárias via oklch (`--primary: 0.637 0.237 15.34`)
- Fontes mono para labels e metadados
- Bordas com `border-primary/30`, fundos com `bg-primary/10`
- Animações suaves com framer-motion (stagger por item)
- Zero states com ícones centralizados e mensagens orientadoras
