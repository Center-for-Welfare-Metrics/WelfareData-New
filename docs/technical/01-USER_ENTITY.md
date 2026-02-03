# Entidade User: Clean Architecture

## Separação de Interface (Domínio) e Model (Infraestrutura)

A interface `IUser` representa a estrutura de dados do usuário no domínio, isolada de detalhes de persistência. O `UserModel` (Mongoose) implementa a persistência, mas depende apenas da interface, promovendo baixo acoplamento e testabilidade.

- **Domínio (`IUser`)**: Define regras e contratos de negócio.
- **Infraestrutura (`UserModel`)**: Implementa persistência e detalhes técnicos.

## Campos e Restrições

| Campo         | Tipo     | Restrições                                 |
|---------------|----------|--------------------------------------------|
| name          | string   | Obrigatório, texto livre                   |
| email         | string   | Obrigatório, único, minúsculo, indexado    |
| passwordHash  | string   | Obrigatório, oculto por padrão             |
| role          | enum     | 'admin' ou 'user', padrão: 'user'          |
| isActive      | boolean  | Obrigatório, padrão: true                  |
| createdAt     | Date     | Gerado automaticamente (timestamps)        |
| updatedAt     | Date     | Gerado automaticamente (timestamps)        |

## Por que ocultar o passwordHash?

O campo `passwordHash` é sensível e não deve ser retornado em queries por padrão. O uso de `select: false` garante que ele só será acessível explicitamente, aumentando a segurança.

## Exemplo de uso do Model

```typescript
import { UserModel } from '../../src/infrastructure/models/UserModel';

// Criação
const user = await UserModel.create({
  name: 'Alice',
  email: 'alice@email.com',
  passwordHash: 'hash',
  role: 'user',
  isActive: true,
});

// Consulta (passwordHash não vem por padrão)
const found = await UserModel.findOne({ email: 'alice@email.com' });

// Consulta incluindo passwordHash
const foundWithPassword = await UserModel.findOne({ email: 'alice@email.com' }).select('+passwordHash');
```
