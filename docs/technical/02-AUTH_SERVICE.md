# AuthService: Segurança e Tokens JWT

## Proteção de Senhas
- As senhas são criptografadas usando bcryptjs com 10 rounds de salt.
- O método `hashPassword` gera o hash seguro.
- O método `comparePassword` compara a senha em texto puro com o hash armazenado.

## Tokens JWT
- Tokens são gerados e verificados usando jsonwebtoken.
- O payload do token segue a interface `ITokenPayload` (id, role).
- O segredo (`JWT_SECRET`) e tempo de expiração (`JWT_EXPIRES_IN`) são lidos do `.env`.
- Se `JWT_SECRET` não estiver definido, o serviço lança erro fatal no construtor (Fail Fast).

## Variáveis de Ambiente Necessárias
Adicione ao seu `.env`:
```
JWT_SECRET=uma-string-secreta-forte
JWT_EXPIRES_IN=12h
```

## Exemplo de Uso
```typescript
import { AuthService, ITokenPayload } from '../src/application/services/AuthService';
AWAWAWAWsd
const auth = new AuthService();

// Hash de senha
const hash = await auth.hashPassword('minhaSenha');

// Comparação
const isValid = await auth.comparePassword('minhaSenha', hash);

// Geração de token
const payload: ITokenPayload = { id: 'userId', role: 'admin' };
const token = auth.generateToken(payload);

// Verificação de token
const decoded = auth.verifyToken(token);
```
