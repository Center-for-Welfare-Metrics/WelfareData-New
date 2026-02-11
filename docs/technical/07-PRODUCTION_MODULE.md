# Módulo ProductionModule — CRUD de Módulos de Produção

## Visão Geral
O módulo ProductionModule representa etapas da cadeia de produção animal (ex: Hatchery, Transport, Fattening). É a camada filha de Specie na hierarquia do sistema, sendo parte fundamental da nomenclatura de arquivos conforme o Processogram Development Manual (p.14).

## Domain Interface: IProductionModule
```typescript
interface IProductionModule {
  name: string;         // Nome do módulo (ex: "Hatchery")
  slug: string;         // Identificador único em kebab-case (ex: "hatchery")
  description?: string; // Descrição opcional
  specieId: string;     // Referência para a espécie (ObjectId)
  creatorId: string;    // ID do usuário que criou
  createdAt: Date;
  updatedAt: Date;
}
```

## Infrastructure: ProductionModuleModel
- Schema Mongoose com timestamps automáticos.
- **Índice Composto Único:** `{ slug: 1, specieId: 1 }`
  - Permite que 'transport' exista para porcos E para vacas.
  - Mas impede duplicação do mesmo slug dentro da mesma espécie.
- Campo `specieId` referencia o model 'Specie'.

## Use Cases

### CreateProductionModuleUseCase
- Input: name, slug, description (opcional), specieId, creatorId.
- Validação Zod:
  - `name`: mínimo 3 caracteres.
  - `slug`: apenas letras minúsculas, números e hífens (regex: `^[a-z0-9-]+$`).
- Verifica se `specieId` existe no banco (retorna 404 se não existir).
- Verifica duplicata de slug dentro da mesma espécie (retorna 409 Conflict).
- Cria e retorna o módulo.

### ListProductionModulesUseCase
- Input: `specieId` (opcional via query string).
- Se `specieId` fornecido: retorna apenas módulos daquela espécie.
- Se não fornecido: retorna todos os módulos do sistema.
- Ordenação: por nome (A-Z).

### UpdateProductionModuleUseCase
- Input: id (param), campos opcionais (name, description).
- **REGRA CRÍTICA:** O campo `slug` é IMUTÁVEL após a criação.
  - Motivo: O slug é usado na nomenclatura de arquivos do sistema (WelfareData Manual p.14). Alterá-lo quebraria referências de arquivos.
- Verifica se o ID existe (retorna 404 Not Found).
- Se `name` for alterado, verifica duplicata dentro da mesma espécie (retorna 409 Conflict).
- Atualiza e retorna o módulo modificado.

### DeleteProductionModuleUseCase
- Input: id (param).
- Verifica se o ID existe (retorna 404 Not Found).
- **SAFETY CHECK CRÍTICO:** Verifica se existem Processograms vinculados.
  - Se houver processogramas associados, retorna 409 Conflict.
  - Previne dados órfãos no sistema.
  - TODO: Implementar quando Processogram model for criado.
- Se livre de dependências, remove o módulo do banco.
- Retorna mensagem de sucesso.

## Presentation Layer

### Endpoints
- `POST /production-modules` — Criar módulo (requer autenticação + role 'admin')
  - Body: `{ name, slug, specieId, description? }`
  - Respostas: 201 (Created), 400 (Validation), 404 (Specie not found), 409 (Conflict), 500 (Error)

- `GET /production-modules` — Listar módulos (requer autenticação)
  - Query: `?specieId=ID` (opcional - filtrar por espécie)
  - Respostas: 200 (lista de módulos), 500 (Error)

- `PATCH /production-modules/:id` — Atualizar módulo (requer autenticação + role 'admin')
  - Body: `{ name?, description? }` (slug NÃO pode ser alterado)
  - Respostas: 200 (Updated), 400 (Validation/Slug immutable), 404 (Not Found), 409 (Conflict), 500 (Error)

- `DELETE /production-modules/:id` — Deletar módulo (requer autenticação + role 'admin')
  - Respostas: 200 (Deleted), 404 (Not Found), 409 (Has associated processograms), 500 (Error)

### Segurança
- Criação, Atualização e Deleção: protegidas por `AuthMiddleware` + `requireRole('admin')`.
- Listagem: protegida apenas por `AuthMiddleware` (usuários comuns podem ver).

## Exemplo de Uso

```bash
# 1. Criar módulo para uma espécie (requer admin)
curl -X POST http://localhost:8080/production-modules \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"name":"Hatchery","slug":"hatchery","specieId":"698bd2ac8d74a9dc986074c7","description":"Incubação de ovos"}'

curl -X POST http://localhost:8080/production-modules \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"name":"Transport","slug":"transport","specieId":"SPECIE_ID","description":"Transporte de aves"}'

# 2. Listar todos os módulos
curl -X GET http://localhost:8080/production-modules -b cookies.txt

# 3. Listar módulos de uma espécie específica
curl -X GET "http://localhost:8080/production-modules?specieId=SPECIE_ID" -b cookies.txt

# 4. Atualizar módulo (apenas name e description)
curl -X PATCH http://localhost:8080/production-modules/MODULE_ID \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"name":"Hatchery Updated","description":"Nova descrição"}'

# 5. Tentar atualizar slug (ERRO - slug é imutável)
curl -X PATCH http://localhost:8080/production-modules/MODULE_ID \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"slug":"novo-slug"}'
# Resposta: 400 Bad Request - "Cannot update slug: it is immutable after creation to preserve file integrity"

# 6. Deletar módulo
curl -X DELETE http://localhost:8080/production-modules/MODULE_ID -b cookies.txt
```

## Regras de Integridade

### Índice Composto Único
O mesmo `slug` pode existir para diferentes espécies, mas não pode ser duplicado dentro da mesma espécie:
- ✅ "transport" para Bovinos
- ✅ "transport" para Suínos
- ❌ "transport" duplicado para Bovinos → 409 Conflict

### Slug Imutável
O campo `slug` **NÃO PODE** ser alterado após a criação. Razões:
- É usado na nomenclatura de arquivos SVG/PNG do sistema.
- Faz parte da string de identificação conforme Processogram Development Manual.
- Alterá-lo quebraria todas as referências de arquivos existentes.
- URLs e estrutura de diretórios seriam invalidadas.

### Integridade Referencial
**Ao criar:** Verifica se a espécie existe (404 se não existir).
**Ao deletar:** 
- Verifica se existem Processograms associados.
- Se houver, retorna 409 Conflict.
- Previne dados órfãos no sistema.

### Cascata de Deleção (Specie → ProductionModule)
Quando tentar deletar uma Espécie:
- O sistema verifica se existem ProductionModules associados.
- Se existirem, impede a deleção (409 Conflict).
- O administrador deve primeiro deletar/reatribuir os módulos.

## Hierarquia do Sistema

```
Specie (ex: Bovino)
  └── ProductionModule (ex: Fattening)
      └── Processogram (TODO: próxima camada)
```

## Próximos Passos
- Implementar módulo Processogram (última camada da hierarquia).
- Adicionar paginação na listagem.
- Implementar soft delete (campo isActive).
- Adicionar auditoria de mudanças.
