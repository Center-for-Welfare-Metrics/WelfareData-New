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
- Input: id (param), campos opcionais (name, pathname, description).
- Validação Zod: mesmas regras do Create, mas todos campos opcionais.
- Verifica se o ID existe (retorna 404 Not Found).
- Se `pathname` for alterado, verifica duplicata (retorna 409 Conflict).
- Atualiza e retorna a espécie modificada.

### DeleteSpecieUseCase
- Input: id (param).
- Verifica se o ID existe (retorna 404 Not Found).
- Remove a espécie do banco.
- Retorna mensagem de sucesso.

## Presentation Layer
### Endpoints
- `POST /species` — Criar espécie (requer autenticação + role 'admin')
  - Body: `{ name, pathname, description? }`
  - Respostas: 201 (Created), 400 (Validation), 409 (Conflict), 500 (Error)

- `GET /species` — Listar todas espécies (requer autenticação)
  - Respostas: 200 (lista de espécies), 500 (Error)

- `PUT /species/:id` — Atualizar espécie (requer autenticação + role 'admin')
  - Body: `{ name?, pathname?, description? }` (todos opcionais)
  - Respostas: 200 (Updated), 400 (Validation), 404 (Not Found), 409 (Conflict), 500 (Error)

- `DELETE /species/:id` — Deletar espécie (requer autenticação + role 'admin')
  - Respostas: 200 (Deleted), 404 (Not Found), 500 (Error)

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

# Atualizar espécie (como admin)
curl -X PUT http://localhost:8080/species/SPECIE_ID \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"name":"Bovinos","description":"Gado de corte, leite e dupla aptidão"}'

# Deletar espécie (como admin)
curl -X DELETE http://localhost:8080/species/SPECIE_ID -b cookies.txt
```

## Próximos Passos
- Adicionar paginação e filtros (busca por nome).
- Adicionar validação de imagens/ícones para cada espécie.
- Implementar soft delete (campo isActive) em vez de remoção permanente.
