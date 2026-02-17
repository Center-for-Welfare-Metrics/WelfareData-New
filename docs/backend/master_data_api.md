# Backend API — Dados Mestres (Espécies e Módulos de Produção)

## Base URL

```
http://localhost:8080/api/v1
```

Todas as rotas de escrita exigem autenticação via cookie `token` (HttpOnly JWT) e role `admin`.

---

## Espécies — `/api/v1/species`

### `POST /` — Criar Espécie

**Headers:** Cookie `token` (admin)

**Payload:**

```json
{
  "name": "Suínos",
  "description": "Espécie suína doméstica"
}
```

| Campo         | Tipo     | Obrigatório | Validação           |
| ------------- | -------- | ----------- | ------------------- |
| `name`        | `string` | ✅          | `min(1)`            |
| `description` | `string` | ❌          | —                   |

> O campo `pathname` é gerado automaticamente a partir do `name` (normalização unicode → lowercase → hyphens).
> O campo `creatorId` é extraído do JWT pelo controller.

**Resposta `201 Created`:**

```json
{
  "_id": "664abc123...",
  "name": "Suínos",
  "pathname": "suinos",
  "description": "Espécie suína doméstica",
  "creatorId": "user_id_here",
  "createdAt": "2026-02-17T...",
  "updatedAt": "2026-02-17T..."
}
```

### `GET /` — Listar Espécies

**Headers:** Cookie `token`

**Resposta `200 OK`:**

```json
[
  {
    "_id": "664abc123...",
    "name": "Suínos",
    "pathname": "suinos",
    "description": "Espécie suína doméstica",
    "creatorId": "user_id_here",
    "createdAt": "2026-02-17T...",
    "updatedAt": "2026-02-17T..."
  }
]
```

### `PATCH /:id` — Atualizar Espécie

**Headers:** Cookie `token` (admin)

**Payload:**

```json
{
  "name": "Suínos Domésticos",
  "description": "Descrição atualizada"
}
```

> O campo `pathname` é **imutável** após a criação.

**Resposta `200 OK`:** Objeto atualizado (mesmo formato do `GET`).

### `DELETE /:id` — Remover Espécie

**Headers:** Cookie `token` (admin)

**Resposta `200 OK`:**

```json
{
  "message": "Specie deleted successfully",
  "_id": "664abc123..."
}
```

---

## Módulos de Produção — `/api/v1/production-modules`

### `POST /` — Criar Módulo

**Headers:** Cookie `token` (admin)

**Payload:**

```json
{
  "name": "Maternidade",
  "specieId": "664abc123def456789012345",
  "description": "Fase de maternidade suína"
}
```

| Campo         | Tipo     | Obrigatório | Validação                  |
| ------------- | -------- | ----------- | -------------------------- |
| `name`        | `string` | ✅          | `min(1)`                   |
| `specieId`    | `string` | ✅          | ObjectId válido existente  |
| `description` | `string` | ❌          | —                          |

> O campo `slug` é gerado automaticamente a partir do `name`.
> O campo `creatorId` é extraído do JWT pelo controller.
> Unicidade composta: `slug` + `specieId` (mesmo slug pode existir em espécies diferentes).

**Resposta `201 Created`:**

```json
{
  "_id": "665def456...",
  "name": "Maternidade",
  "slug": "maternidade",
  "description": "Fase de maternidade suína",
  "specieId": "664abc123...",
  "creatorId": "user_id_here",
  "createdAt": "2026-02-17T...",
  "updatedAt": "2026-02-17T..."
}
```

### `GET /` — Listar Módulos

**Headers:** Cookie `token`

**Query Params:**

| Param      | Tipo     | Descrição                              |
| ---------- | -------- | -------------------------------------- |
| `specieId` | `string` | (Opcional) Filtra por espécie          |

**Exemplos:**
- `GET /production-modules` → todos os módulos
- `GET /production-modules?specieId=664abc123...` → módulos da espécie

**Resposta `200 OK`:** Array de módulos (mesmo formato do `POST`).

### `PATCH /:id` — Atualizar Módulo

**Headers:** Cookie `token` (admin)

**Payload:**

```json
{
  "name": "Maternidade Avançada",
  "description": "Descrição atualizada"
}
```

> O campo `slug` é **imutável** após a criação.

**Resposta `200 OK`:** Objeto atualizado.

### `DELETE /:id` — Remover Módulo

**Headers:** Cookie `token` (admin)

**Resposta `200 OK`:**

```json
{
  "message": "Production module deleted successfully",
  "_id": "665def456..."
}
```

---

## Códigos de Erro

| Código | Situação                                                            |
| ------ | ------------------------------------------------------------------- |
| `400`  | Validação Zod falhou (campo ausente, formato inválido)              |
| `401`  | JWT ausente ou inválido                                             |
| `403`  | Usuário autenticado mas sem role `admin`                            |
| `404`  | Espécie ou Módulo não encontrado (GET by id, DELETE, PATCH)         |
| `409`  | Conflito de unicidade (pathname/slug duplicado, deleção com filhos) |
| `500`  | Erro interno do servidor                                            |

### Exemplo de Erro `400` (Validação):

```json
{
  "error": "Validation Error",
  "details": [
    {
      "expected": "string",
      "code": "invalid_type",
      "path": ["name"],
      "message": "Invalid input: expected string, received undefined"
    }
  ]
}
```

### Exemplo de Erro `409` (Integridade Referencial):

```json
{
  "error": "Cannot delete specie with associated production modules"
}
```

---

## Regras de Integridade

1. **Espécie → Módulos:** Não é possível deletar uma espécie que tenha módulos vinculados (retorna `409`).
2. **Módulo → Processogramas:** Não é possível deletar um módulo que tenha processogramas vinculados (retorna `409`).
3. **pathname/slug imutáveis:** Campos derivados do nome são gerados automaticamente na criação e não podem ser alterados via `PATCH`.

---

## Geração Automática de Campos

### `pathname` (Espécie)

```
"Suínos Domésticos" → "suinos-domesticos"
"Bovinos de Corte"  → "bovinos-de-corte"
```

### `slug` (Módulo)

```
"Maternidade"       → "maternidade"
"Creche / Nursery"  → "creche--nursery"
```

Algoritmo: `NFD normalize → strip diacritics → lowercase → replace non-alnum with hyphen → trim hyphens`
