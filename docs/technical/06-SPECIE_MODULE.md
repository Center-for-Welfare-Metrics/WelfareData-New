# Módulo Specie — CRUD de Espécies

## Visão Geral
O módulo Specie gerencia as espécies de animais no sistema. Apenas administradores podem criar novas espécies, mas todos os usuários autenticados podem visualizar a lista.

## Domain Interface: ISpecie
```typescript
interface ISpecie {
  name: string;           // Nome da espécie
  pathname: string;       // Identificador único (slug), apenas letras minúsculas e hífens
  description?: string;   // Descrição opcional
  creatorId: string;      // ID do usuário que criou
  createdAt: Date;
  updatedAt: Date;
}
```

## Infrastructure: SpecieModel
- Schema Mongoose com timestamps automáticos.
- Índice único no campo `pathname` para evitar duplicatas.
- Índice no campo `name` para buscas rápidas.

## Use Cases
### CreateSpecieUseCase
- Input: name, pathname, description (opcional), creatorId.
- Validação Zod:
  - `name`: mínimo 3 caracteres.
  - `pathname`: apenas letras minúsculas e hífens (regex: `^[a-z-]+$`).
- Verifica se `pathname` já existe (retorna 409 Conflict).
- Salva no banco e retorna a espécie criada.

### ListSpeciesUseCase
- Retorna todas as espécies ordenadas por nome (A-Z).
- Sem paginação na v1 (pode ser adicionada depois).

### UpdateSpecieUseCase
- Input: id (param), campos opcionais (name, description).
- Validação Zod: mesmas regras do Create, mas todos campos opcionais.
- **REGRA CRÍTICA:** O campo `pathname` é IMUTÁVEL após a criação. Qualquer tentativa de alteração retorna erro 400.
  - Motivo: O pathname é usado como base para estrutura de arquivos e URLs (SEO). Alterá-lo quebraria links e hierarquia de arquivos do Processogram Development Manual.
- Verifica se o ID existe (retorna 404 Not Found).
- Se `name` for alterado, verifica duplicata (retorna 409 Conflict).
- Atualiza e retorna a espécie modificada.

### DeleteSpecieUseCase
- Input: id (param).
- Verifica se o ID existe (retorna 404 Not Found).
- **SAFETY CHECK CRÍTICO:** Antes de deletar, verifica se existem ProductionModules vinculados.
  - Se existirem módulos associados, retorna 409 Conflict com mensagem "Cannot delete specie with associated production modules".
  - Isso previne dados órfãos no sistema e mantém integridade referencial.
  - TODO: Implementar quando ProductionModule model for criado.
- Se livre de dependências, remove a espécie do banco.
- Retorna mensagem de sucesso.

## Presentation Layer
### Endpoints
- `POST /species` — Criar espécie (requer autenticação + role 'admin')
  - Body: `{ name, pathname, description? }`
  - Respostas: 201 (Created), 400 (Validation), 409 (Conflict), 500 (Error)

- `GET /species` — Listar todas espécies (requer autenticação)
  - Respostas: 200 (lista de espécies), 500 (Error)

- `PATCH /species/:id` — Atualizar espécie (requer autenticação + role 'admin')
  - Body: `{ name?, description? }` (pathname NÃO pode ser alterado)
  - Respostas: 200 (Updated), 400 (Validation/Pathname immutable), 404 (Not Found), 409 (Conflict), 500 (Error)

- `DELETE /species/:id` — Deletar espécie (requer autenticação + role 'admin')
  - Respostas: 200 (Deleted), 404 (Not Found), 409 (Has associated modules), 500 (Error)

### Segurança
- Criação, Atualização e Deleção: protegidas por `AuthMiddleware` + `requireRole('admin')`.
- Listagem: protegida apenas por `AuthMiddleware` (usuários comuns podem ver).

## Exemplo de Uso
```bash
# Criar espécie (como admin com cookie de autenticação)
curl -X POST http://localhost:8080/species \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"name":"Bovino","pathname":"bovino","description":"Gado de corte e leite"}'

# Listar espécies (usuário autenticado)
curl -X GET http://localhost:8080/species -b cookies.txt

# Atualizar espécie (como admin) - APENAS name e description
curl -X PATCH http://localhost:8080/species/SPECIE_ID \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"name":"Bovinos","description":"Gado de corte, leite e dupla aptidão"}'

# Tentar atualizar pathname (ERRO - pathname é imutável)
curl -X PATCH http://localhost:8080/species/SPECIE_ID \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"pathname":"novo-pathname"}'
# Resposta: 400 Bad Request - "Cannot update pathname: it is immutable after creation to preserve file integrity"

# Deletar espécie (como admin)
curl -X DELETE http://localhost:8080/species/SPECIE_ID -b cookies.txt
```

## Regras de Integridade

### Pathname Imutável
O campo `pathname` **NÃO PODE** ser alterado após a criação da espécie. Esta regra é fundamental porque:
- O pathname é usado como base para estrutura de diretórios de arquivos SVG (conforme Processogram Development Manual).
- Alterá-lo quebraria todos os links e referências de arquivos existentes.
- URLs de SEO seriam invalidadas.
- A integridade do sistema de arquivos seria comprometida.

### Integridade Referencial
Antes de deletar uma espécie, o sistema verifica se existem ProductionModules associados:
- Se houver módulos vinculados, retorna 409 Conflict.
- Isso previne dados órfãos e mantém consistência do banco de dados.
- O administrador deve primeiro deletar/reatribuir os módulos antes de remover a espécie.

## Próximos Passos
- Adicionar paginação e filtros (busca por nome).
- Adicionar validação de imagens/ícones para cada espécie.
- Implementar soft delete (campo isActive) em vez de remoção permanente.
- Implementar auditoria de mudanças (track de quem modificou e quando).
