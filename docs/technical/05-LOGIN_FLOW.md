# Login Flow — Segurança com HttpOnly Cookie

## Objetivo
Garantir que o JWT usado para autenticação não seja acessível via JavaScript no cliente. Usamos um cookie `HttpOnly` para mitigar ataques XSS e reduzir exposição do token.

## Por que HttpOnly Cookie?
- Cookies marcados como `HttpOnly` não podem ser lidos pelo `document.cookie` no browser, mitigando roubo de tokens via XSS.
- `secure: true` garante envio apenas em HTTPS (em produção).
- `sameSite: 'strict'` ajuda a mitigar CSRF simples; para cenários cross-site controlados, ajuste conforme necessidade.

## Fluxo resumido
1. Cliente envia POST `/auth/login` com `{ email, password }`.
2. Server valida as credenciais e, se válidas, gera um JWT.
3. Server seta cookie `token` com opções seguras:
   - `httpOnly: true`
   - `secure: process.env.NODE_ENV === 'production'`
   - `sameSite: 'strict'`
   - `maxAge: 12 hours`
4. Server retorna 200 com os dados do usuário (sem token no corpo).
5. Futuras requisições enviarão automaticamente o cookie; server valida o JWT no backend.

## Observações de segurança
- Mantenha `JWT_SECRET` forte e rotacione quando necessário.
- Para proteger contra CSRF em endpoints que alteram estado, considere usar tokens anti-CSRF (double submit cookie) ou verificar `Origin`/`Referer`.
- Não exponha o token no corpo da resposta.
