# Security Model

## Visão Geral

Este documento descreve o modelo de segurança do WelfareData Backend, cobrindo autenticação, autorização, gestão de credenciais e práticas de segurança aplicadas em cada camada do sistema.

---

## 1. Autenticação (JWT + HttpOnly Cookies)

### Mecanismo

O sistema utiliza **JSON Web Tokens (JWT)** transportados via **cookies HttpOnly**. Essa abordagem elimina a exposição do token a JavaScript no cliente, mitigando ataques XSS.

### Fluxo de Autenticação

```
1. POST /auth/register → Cria usuário com senha hasheada
2. POST /auth/login    → Valida credenciais, gera JWT, seta cookie
3. Requests seguintes  → Cookie enviado automaticamente pelo browser
4. POST /auth/logout   → Limpa o cookie
```

### Configuração do Cookie

| Propriedade | Valor | Justificativa |
|-------------|-------|---------------|
| `httpOnly` | `true` | Inacessível via JavaScript (mitiga XSS) |
| `secure` | `true` (produção) | Transmitido apenas via HTTPS |
| `sameSite` | `strict` | Mitiga CSRF |
| `maxAge` | Definido por `JWT_EXPIRES_IN` | Padrão: 12 horas |

### Payload do Token

```typescript
interface ITokenPayload {
  id: string;   // ObjectId do usuário
  role: string;  // "admin" | "user"
}
```

### Hash de Senhas

- **Algoritmo:** bcrypt (via `bcryptjs`)
- **Salt rounds:** 10
- **Armazenamento:** Apenas o hash é persistido no MongoDB. Senhas em texto claro nunca são armazenadas.

### AuthMiddleware

Localizado em `src/presentation/middlewares/AuthMiddleware.ts`:

1. Extrai o token de `req.cookies.token`
2. Verifica e decodifica com `jsonwebtoken`
3. Anexa o payload a `req.user`
4. Retorna `401 Unauthorized` se o token for ausente, expirado ou inválido

---

## 2. Autorização (RBAC)

### Roles

O sistema implementa um modelo **RBAC simplificado** com dois papéis:

| Role | Permissões |
|------|-----------|
| `admin` | Todas as operações: CRUD, análise IA, edição de dados, gestão de usuários |
| `user` | Operações de leitura: listar/visualizar entidades, chat contextual |

### RoleMiddleware

Localizado em `src/presentation/middlewares/RoleMiddleware.ts`:

```
requireRole('admin') → Verifica se req.user.role === 'admin'
                     → 401 se não autenticado
                     → 403 se role insuficiente
```

### Matriz de Permissões por Rota

| Rota | Método | Role Mínimo |
|------|--------|-------------|
| `/auth/register`, `/auth/login` | POST | Pública |
| `/auth/me`, `/auth/logout` | GET/POST | `user` |
| `/auth/admin-only` | GET | `admin` |
| `/species`, `/production-modules`, `/processograms` | GET | `user` |
| `/species`, `/production-modules`, `/processograms` | POST/PUT/DELETE | `admin` |
| `/processograms/:id/analyze` | POST | `admin` |
| `/processograms/:id/data` | GET | `user` |
| `/processograms/:id/questions` | GET | `user` |
| `/processogram-data/:id` | PUT | `admin` |
| `/processogram-questions/:id` | PUT | `admin` |
| `/chat/stream` | POST | `user` |
| `/health` | GET | Pública |

---

## 3. Gestão de Credenciais

### Google Cloud Storage — Application Default Credentials (ADC)

O acesso ao GCS **não** utiliza chaves JSON (service account keys). Em vez disso, o sistema confia no mecanismo de **Application Default Credentials**:

- **Desenvolvimento local:** `gcloud auth application-default login` configura credenciais no ambiente do desenvolvedor
- **Produção (GCE/Cloud Run):** A conta de serviço da instância é usada automaticamente
- **Benefício:** Nenhum arquivo de credencial é versionado ou armazenado no projeto

```typescript
// GoogleStorageService.ts — sem keyFilename
this.storage = new Storage({
  projectId: process.env.GCS_PROJECT_ID,
});
```

### Google Gemini — API Key

- A chave de API do Gemini é carregada exclusivamente via variável de ambiente `GEMINI_API_KEY`
- O `GeminiService` falha com erro fatal se a variável não estiver definida
- A chave **nunca** é logada ou exposta em respostas HTTP

### JWT Secret

- Carregado via `JWT_SECRET` no `.env`
- O `AuthService` falha com erro fatal se não definido
- Deve ser uma string criptograficamente forte em produção

### MongoDB

- Connection string carregada via `MONGO_CONNECTION_URL`
- Em produção, usar Atlas com autenticação SCRAM e IP whitelisting
- O servidor encerra (`process.exit(1)`) se a conexão falhar

---

## 4. Validação de Input

### Zod

Todas as entradas de usuário são validadas com **Zod** antes de atingir a lógica de negócio:

- Schemas definidos nos Use Cases (co-localizados)
- Erros de validação retornam `400` com detalhes dos `issues`
- Previne injeção de dados malformados no MongoDB

### Upload de Arquivos

- **Multer** com `MemoryStorage` (sem gravação em disco)
- Filtro de MIME type: apenas `image/svg+xml`
- Limite de tamanho: 10 MB
- Rejeição com erro descritivo para tipos inválidos

---

## 5. Proteções de Runtime

### Timeout Middleware

- 30 segundos para rotas padrão (previne request hanging)
- 360 segundos para processamento SVG (operação legítima de longa duração)
- Sem timeout para SSE/streaming (conexão mantida pelo protocolo)

### Graceful Shutdown

- SIGTERM/SIGINT encerram browsers Puppeteer pendentes antes do exit
- Previne processos zumbis em deploys com containers

### Error Handling

- `unhandledRejection` logado sem matar o servidor
- `uncaughtException` encerra o processo (falha irrecuperável)
- Controllers tratam erros com códigos HTTP apropriados (400, 401, 403, 404, 408, 409, 500, 502, 503, 504)

---

## 6. Variáveis Sensíveis — Checklist

| Variável | Tipo | Nunca versionar |
|----------|------|-----------------|
| `MONGO_CONNECTION_URL` | Connection string | ✅ |
| `JWT_SECRET` | String de assinatura | ✅ |
| `GEMINI_API_KEY` | API Key | ✅ |
| `GCS_PROJECT_ID` | Project ID | ⚠️ (não é segredo, mas evitar) |
| `GCS_BUCKET_NAME` | Bucket name | ⚠️ (não é segredo, mas evitar) |

O arquivo `.env` está listado no `.gitignore`. O `.env.example` contém apenas placeholders.
