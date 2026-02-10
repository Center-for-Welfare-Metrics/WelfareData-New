# 11 - Processogram CRUD Operations

## Visão Geral

Operações completas de leitura (List/Get) e exclusão (Delete com cascade) para Processogramas.

---

## Endpoints

| Método | Rota | Auth | Role | Descrição |
|--------|------|------|------|-----------|
| `GET` | `/processograms` | ✅ | — | Lista processogramas com filtros opcionais |
| `GET` | `/processograms/:id` | ✅ | — | Busca processograma por ID com populate |
| `POST` | `/processograms` | ✅ | admin | Cria novo processograma (upload SVG) |
| `DELETE` | `/processograms/:id` | ✅ | admin | Deleta processograma + arquivos GCS |

---

## 1. Listar Processogramas

### Use Case: `ListProcessogramsUseCase`

```typescript
async execute(filters: { 
  specieId?: string; 
  productionModuleId?: string 
} = {})
```

**Filtros opcionais**:
- `specieId`: Retorna apenas processogramas de uma espécie
- `productionModuleId`: Retorna apenas processogramas de um módulo de produção

**Populate**: Popula `specieId` (name, pathname) e `productionModuleId` (name, slug).

**Ordenação**: Mais recente primeiro (`createdAt: -1`).

### Exemplo cURL

```bash
# Listar todos
curl http://localhost:8080/processograms -b cookies.txt

# Filtrar por espécie
curl "http://localhost:8080/processograms?specieId=6982d3da664702d6feacd480" -b cookies.txt

# Filtrar por módulo de produção
curl "http://localhost:8080/processograms?productionModuleId=6989011bc946774cb98eb1ec" -b cookies.txt
```

### Resposta

```json
[
  {
    "_id": "698914593bef77b80d6611fe",
    "identifier": "suino-fattening-pigs",
    "name": "Pigs",
    "slug": "pigs",
    "specieId": {
      "_id": "6982d3da664702d6feacd480",
      "name": "Suíno",
      "pathname": "suino"
    },
    "productionModuleId": {
      "_id": "6989011bc946774cb98eb1ec",
      "name": "Fattening",
      "slug": "fattening"
    },
    "status": "ready",
    "svg_url_light": "https://storage.googleapis.com/.../pigs.svg",
    "raster_images_light": {},
    "createdAt": "2026-02-08T22:55:21.127Z"
  }
]
```

---

## 2. Buscar Processograma por ID

### Use Case: `GetProcessogramUseCase`

```typescript
async execute(id: string)
```

**Populate**: Popula `specieId` e `productionModuleId` com os mesmos campos do List.

**Erro**: Lança `Processogram not found` se o ID não existir (404).

### Exemplo cURL

```bash
curl http://localhost:8080/processograms/698914593bef77b80d6611fe -b cookies.txt
```

### Resposta

```json
{
  "_id": "698914593bef77b80d6611fe",
  "identifier": "suino-fattening-pigs",
  "name": "Pigs",
  "slug": "pigs",
  "description": "Processogram for pig fattening",
  "specieId": {
    "_id": "6982d3da664702d6feacd480",
    "name": "Suíno",
    "pathname": "suino"
  },
  "productionModuleId": {
    "_id": "6989011bc946774cb98eb1ec",
    "name": "Fattening",
    "slug": "fattening"
  },
  "status": "ready",
  "svg_url_light": "https://storage.googleapis.com/welfaredata-new/processograms/suino/fattening/pigs/light/pigs.svg",
  "svg_bucket_key_light": "processograms/suino/fattening/pigs/light/pigs.svg",
  "original_size_light": 684606,
  "final_size_light": 278378,
  "raster_images_light": {
    "--ps-step-1": {
      "src": "https://storage.googleapis.com/.../--ps-step-1.png",
      "bucket_key": "processograms/suino/fattening/pigs/light/raster/--ps-step-1.png",
      "width": 800,
      "height": 600,
      "x": 100,
      "y": 200
    }
  },
  "raster_images_dark": {},
  "creatorId": "698177202afdb4f46a8245aa",
  "createdAt": "2026-02-08T22:55:21.127Z",
  "updatedAt": "2026-02-08T22:55:21.127Z"
}
```

---

## 3. Deletar Processograma (Cascade)

### Use Case: `DeleteProcessogramUseCase`

```typescript
async execute(id: string)
```

**Fluxo de Execução (CRÍTICO)**:

1. **Buscar no MongoDB**: Lança erro se não encontrar
2. **Delete SVG Light**: `storage.deleteByUrl(svg_url_light)`
3. **Delete SVG Dark**: `storage.deleteByUrl(svg_url_dark)` (se existir)
4. **Delete Raster Light**: Itera `raster_images_light` → deleta cada `.src`
5. **Delete Raster Dark**: Itera `raster_images_dark` → deleta cada `.src`
6. **Delete do MongoDB**: `processogram.deleteOne()`

**Idempotência**: `deleteByUrl()` silencia erros 404 — arquivos inexistentes não quebram o fluxo.

### Exemplo cURL

```bash
curl -X DELETE http://localhost:8080/processograms/698914593bef77b80d6611fe -b cookies.txt
```

### Resposta

```json
{
  "message": "Processogram and all associated files deleted successfully"
}
```

---

## 4. GoogleStorageService - deleteByUrl()

### Método Adicionado

```typescript
async deleteByUrl(fileUrl: string): Promise<void>
```

**Lógica**:
1. Extrai path relativo da URL pública: `https://storage.googleapis.com/{bucket}/{path}` → `{path}`
2. Valida bucket: Se a URL não corresponder ao bucket configurado, loga aviso e retorna
3. Delega ao método `delete(path)`: Idempotente (silencia 404)

**Uso**:

```typescript
const storage = getStorageService();
await storage.deleteByUrl('https://storage.googleapis.com/bucket/processograms/suino/fattening/pigs/light/pigs.svg');
```

---

## 5. Tratamento de Erros

| Erro | Código HTTP | Condição |
|------|-------------|----------|
| `Processogram not found` | 404 | ID não existe no banco |
| `Unauthorized` | 401 | Cookie ausente ou inválido |
| `Forbidden` | 403 | Usuário não é admin (DELETE) |
| `Internal Server Error` | 500 | Erro inesperado |

---

## 6. Segurança

### Autenticação
Todas as rotas requerem `AuthMiddleware` — cookie HttpOnly com JWT válido.

### Autorização
- **List/Get**: Qualquer usuário autenticado
- **Delete**: Apenas `role: 'admin'` via `requireRole('admin')`

### Integridade de Dados
O delete cascade garante que **nenhum arquivo órfão** permaneça no GCS após remoção do banco.

---

## 7. Exemplo de Fluxo Completo

```bash
# 1. Login
curl -i -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@welfare.com","password":"password123"}' \
  -c cookies.txt

# 2. Listar processogramas
curl http://localhost:8080/processograms -b cookies.txt

# 3. Buscar por ID
curl http://localhost:8080/processograms/698914593bef77b80d6611fe -b cookies.txt

# 4. Deletar (admin only)
curl -X DELETE http://localhost:8080/processograms/698914593bef77b80d6611fe -b cookies.txt
```

---

## 8. Custos de Armazenamento

O delete cascade é **essencial** para controle de custos no GCS:

| Operação | Arquivos deletados |
|----------|-------------------|
| 1 Processogram | 1 SVG light + N raster light + 1 SVG dark + M raster dark |
| Exemplo real | 1 + 15 + 1 + 15 = **32 arquivos** |

Sem cascade, esses arquivos permaneceriam no bucket cobrando storage indefinidamente.
