# RegisterUserUseCase

## Schema de Validação (Zod)

```typescript
export const RegisterSchema = z.object({
  name: z.string().min(3, 'Name must have at least 3 characters'),
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must have at least 6 characters'),
  role: z.enum(['admin', 'user']).optional().default('user'),
});
```

- **name**: mínimo 3 caracteres
- **email**: formato válido
- **password**: mínimo 6 caracteres
- **role**: 'admin' ou 'user' (opcional, padrão 'user')

## Fluxo de Dados
1. **Validação**: O input é validado pelo Zod. Se inválido, um erro é lançado.
2. **Verificação de Existência**: Busca no banco se já existe usuário com o email informado. Se sim, lança erro "User already exists".
3. **Hash de Senha**: A senha é criptografada usando o AuthService.
4. **Criação**: O usuário é salvo no banco de dados.
5. **Retorno Seguro**: Retorna apenas `{ id, name, email }` — nunca retorna senha ou hash.

## Observações
- Erros de validação sobem para o Controller tratar.
- O caso de uso não lida com detalhes HTTP, apenas regras de negócio.
