# Authentication Flow — Middleware

## Como o middleware protege rotas
O `AuthMiddleware` lê o cookie `token` presente em `req.cookies.token`. Se o cookie não existir, retorna 401.

Ele valida o JWT usando `AuthService.verifyToken`. Se o token for válido, o payload decodificado é anexado à requisição como `req.user` (contendo `id` e `role`). Rotas protegidas podem então acessar `req.user` para autorizar ações.

## Exemplo
- Cliente faz POST `/auth/login` com credenciais.
- Server seta cookie `token` HttpOnly.
- Requisições subsequentes enviam automaticamente o cookie.
- `AuthMiddleware` valida token e popula `req.user`.

## Erros
- Se cookie ausente ou token inválido: 401 Unauthorized.
- O middleware devolve mensagens genéricas para evitar disclosure de informações de conta.

## Proteção por Cargo (Role-Based Access Control)

Para proteger rotas específicas por papel (por exemplo, apenas administradores), usamos um middleware de autorização `requireRole(allowedRole)` que deve ser executado após o `AuthMiddleware`.

Fluxo:
- `AuthMiddleware` valida o token e popula `req.user` com o payload { id, role }.
- `requireRole('admin')` verifica `req.user.role` e retorna 403 Forbidden se o papel não corresponder.

Exemplo de uso em rota:

```ts
router.get('/admin-only', AuthMiddleware, requireRole('admin'), (req, res) => {
	res.json({ message: 'Welcome Admin' });
});
```

Observações de segurança:
- Sempre mantenha mensagens de erro genéricas para evitar enumeração de usuários.
- Combine verificação de papel com checagens de permissões refinadas quando necessário (por recurso/ação).
