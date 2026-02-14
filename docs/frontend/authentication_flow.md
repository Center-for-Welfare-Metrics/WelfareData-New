# WelfareData — Fluxo de Autenticação

> Documentação técnica do ecossistema de autenticação do frontend.

---

## 1. Arquitetura

```
┌─────────┐     POST /api/v1/auth/login      ┌──────────┐
│ Browser │ ──────────────────────────────────► │ Backend  │
│ (Next)  │ ◄────────────────────────────────── │ (Express)│
└─────────┘   Set-Cookie: token=JWT; HttpOnly  └──────────┘
     │
     │  Cookie enviado automaticamente
     │  em todo request subsequente
     ▼
┌─────────────────────────────────────────┐
│  Axios Instance (withCredentials: true) │
│  ├─ Response Interceptor (401 → /login) │
│  └─ baseURL: /api/v1                    │
└─────────────────────────────────────────┘
```

### Decisão: Cookie HttpOnly (Backend) + Cookie Check (Middleware)

O backend define o JWT como **cookie HttpOnly** — o JavaScript do frontend **não tem acesso direto** ao token. Isso elimina vetores de XSS.

O frontend verifica a *existência* do cookie (não o valor) no middleware de borda do Next.js para decidir se permite ou redireciona.

---

## 2. Componentes do Sistema

### 2.1 Cliente API (`src/lib/api.ts`)

```ts
const api = axios.create({
  baseURL: "/api/v1",
  withCredentials: true,   // ← envia cookies em todo request
});
```

**Response Interceptor:** Se qualquer request (exceto `/auth/*`) retornar `401`, redireciona para `/login` via `window.location.href` — forçando um fresh start.

| Cenário               | Comportamento                          |
|-----------------------|----------------------------------------|
| Token expirado        | Backend retorna 401 → interceptor redireciona para `/login` |
| Token ausente         | Middleware de borda bloqueia antes do render |
| Login falha           | Erro tratado no `LoginForm`, toast exibido |
| Login sucesso         | Cookie setado pelo backend, store atualizada, redirect para `/` |

### 2.2 State Management (`src/store/authStore.ts`)

**Zustand** foi escolhido por:
- **Simplicidade**: Zero boilerplate vs Redux Toolkit
- **Performance**: Seletores granulares sem re-renders desnecessários
- **Tamanho**: ~1KB vs ~11KB (Redux + RTK)
- **TypeScript**: Tipagem nativa sem wrappers

| Estado          | Tipo              | Descrição                        |
|-----------------|-------------------|----------------------------------|
| `user`          | `User \| null`    | Dados do usuário autenticado     |
| `isAuthenticated` | `boolean`       | Flag derivada da presença de user |
| `isLoading`     | `boolean`         | True durante hidratação inicial  |

| Action    | Descrição                                                     |
|-----------|---------------------------------------------------------------|
| `login()` | Envia credentials → backend seta cookie → store recebe user   |
| `logout()`| Chama `/auth/logout` → backend limpa cookie → redirect /login |
| `hydrate()`| Chama `/auth/me` → recarrega user se cookie existir          |

**Hidratação:** O `AuthHydrator` em `AppProviders` chama `hydrate()` no mount. Isso reconstrói o estado da store a partir do cookie existente (ex: após refresh da página).

### 2.3 Middleware de Borda (`src/middleware.ts`)

O Next.js Middleware roda **no edge**, antes de qualquer rendering — é a primeira camada de proteção.

```
Request → Middleware → Page Component
              │
              ├─ Rota protegida + sem cookie → Redirect /login?redirect=...
              ├─ /login + com cookie → Redirect /
              └─ Qualquer outra → next()
```

**Rotas protegidas:**
- `/admin` e sub-rotas

**Como proteger novas rotas:**

Edite o array `PROTECTED_PREFIXES` em `src/middleware.ts`:

```ts
const PROTECTED_PREFIXES = ["/admin", "/nova-rota-protegida"];
```

> **Nota:** A rota `/` e `/processogramas` são públicas no middleware (o backend ainda exige auth via cookie para seus endpoints API). Para protegê-las, adicione ao array.

### 2.4 Interface de Login (`src/app/login/page.tsx`)

| Elemento             | Implementação                                   |
|----------------------|-------------------------------------------------|
| Validação            | `react-hook-form` + `zod` (client-side)         |
| Feedback de erro     | `sonner` toast (canto superior direito)          |
| Submit               | `useAuthStore.login()` → redirect `/`            |
| Estética             | Sci-Fi HUD: fundo escuro, glow vermelho, mono   |

---

## 3. Fluxo Completo

### Login

```
1. Usuário acessa /login
2. Preenche email + senha
3. LoginForm valida com Zod
4. authStore.login() → POST /api/v1/auth/login
5. Backend valida credentials
6. Backend seta cookie HttpOnly "token" com JWT
7. Backend retorna { user } no body
8. Store atualiza user + isAuthenticated
9. Router push para /
10. Middleware permite (cookie existe)
11. Dashboard renderiza com dados do usuário
```

### Logout

```
1. Usuário clica "Sair" no header dropdown
2. authStore.logout() → POST /api/v1/auth/logout
3. Backend limpa cookie "token"
4. Store limpa user
5. window.location.href = "/login" (hard redirect)
```

### Sessão Expirada

```
1. Usuário faz qualquer request API
2. Backend rejeita com 401 (JWT expirado)
3. Axios response interceptor detecta 401
4. Redireciona para /login (hard redirect)
5. Middleware não bloqueia /login (rota auth)
6. Usuário re-autentica
```

### Page Refresh

```
1. Browser faz request
2. Middleware verifica cookie "token" (existe) → permite
3. AppProviders monta → AuthHydrator chama hydrate()
4. hydrate() → GET /api/v1/auth/me
5. Backend valida JWT no cookie → retorna user
6. Store atualizada com user data
```

---

## 4. Segurança

| Camada                | Proteção                                                 |
|-----------------------|----------------------------------------------------------|
| **Cookie HttpOnly**   | JS não acessa o token → imune a XSS                     |
| **SameSite: strict**  | Cookie não enviado em requests cross-origin → anti-CSRF  |
| **Secure (prod)**     | Cookie só trafega via HTTPS em produção                  |
| **Middleware de borda**| Bloqueia render antes de chegar ao React                 |
| **Interceptor 401**   | Logout automático em token expirado                      |
| **Zod validation**    | Input sanitizado client-side antes de enviar             |

### O que NÃO fazer

- ❌ **Nunca** armazene o JWT em `localStorage` ou `sessionStorage`
- ❌ **Nunca** leia o valor do cookie no JavaScript (ele é HttpOnly)
- ❌ **Nunca** passe o token via query string
- ❌ **Nunca** desabilite `withCredentials` no axios

---

## 5. Estrutura de Arquivos

```
frontend/src/
├── app/
│   └── login/
│       └── page.tsx             ← Página de login (Sci-Fi UI)
├── components/
│   └── auth/
│       └── LoginForm.tsx        ← Formulário com react-hook-form + zod
├── lib/
│   └── api.ts                   ← Axios instance + interceptors
├── middleware.ts                 ← Edge middleware (proteção de rotas)
├── providers/
│   └── AppProviders.tsx         ← AuthHydrator + Toaster
├── store/
│   └── authStore.ts             ← Zustand store (user, login, logout, hydrate)
└── types/
    └── auth.ts                  ← User, LoginCredentials, UserRole
```

---

## 6. Decisões de Design (ADR)

| Decisão                                   | Razão                                                         |
|-------------------------------------------|---------------------------------------------------------------|
| Cookie HttpOnly (backend-managed)         | Elimina XSS como vetor de roubo de token                      |
| Zustand (não Redux)                       | Minimal API, zero boilerplate, ideal para stores pequenas      |
| `withCredentials: true` (não Bearer header) | Compatível com cookie HttpOnly — browser gerencia o cookie   |
| Middleware de borda (não HOC)             | Bloqueia antes do render, funciona com SSR/SSG, edge runtime  |
| `window.location.href` (não router.push)  | Hard redirect limpa toda state, garante fresh start            |
| `hydrate()` no mount                      | Reconstrói state pós-refresh sem depender de localStorage      |
| Sonner (não shadcn toast)                 | API mais simples, animações melhores, menos boilerplate        |
