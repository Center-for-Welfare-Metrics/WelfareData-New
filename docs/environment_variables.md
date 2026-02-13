# Environment Variables

## Visão Geral

O WelfareData Backend é configurado exclusivamente via variáveis de ambiente, seguindo os princípios do [Twelve-Factor App](https://12factor.net/config). Todas as variáveis necessárias estão documentadas no arquivo `.env.example` na raiz do projeto.

**Nunca versione o arquivo `.env` real.** Ele está listado no `.gitignore`.

---

## Referência Completa

### Servidor

| Variável | Obrigatória | Padrão | Descrição |
|----------|-------------|--------|-----------|
| `PORT` | Não | `8080` | Porta em que o servidor Express escuta. |
| `NODE_ENV` | Não | `undefined` | Ambiente de execução (`development`, `production`, `test`). Afeta configurações de cookie (`secure`) e logs. |

### Banco de Dados

| Variável | Obrigatória | Padrão | Descrição |
|----------|-------------|--------|-----------|
| `MONGO_CONNECTION_URL` | **Sim** | — | Connection string do MongoDB. Aceita formato Atlas (`mongodb+srv://...`) ou local (`mongodb://localhost:27017/welfaredata`). O servidor encerra o processo se não definida. |

### Autenticação (JWT)

| Variável | Obrigatória | Padrão | Descrição |
|----------|-------------|--------|-----------|
| `JWT_SECRET` | **Sim** | — | Chave secreta para assinar e verificar tokens JWT. Deve ser uma string criptograficamente forte (mínimo 32 caracteres recomendados). O `AuthService` falha com erro fatal se não definida. |
| `JWT_EXPIRES_IN` | Não | `12h` | Tempo de expiração dos tokens JWT. Aceita formatos do `jsonwebtoken` (ex: `1d`, `24h`, `3600s`). Define também o `maxAge` do cookie. |

### Google Cloud Storage

| Variável | Obrigatória | Padrão | Descrição |
|----------|-------------|--------|-----------|
| `GCS_PROJECT_ID` | Não* | — | ID do projeto no Google Cloud. Utilizado na inicialização do SDK `@google-cloud/storage`. *Pode ser inferido automaticamente pelo ADC em ambientes GCP (GCE, Cloud Run), mas é recomendado definir explicitamente. |
| `GCS_BUCKET_NAME` | **Sim** | — | Nome do bucket GCS para armazenamento de SVGs otimizados e imagens rasterizadas. O `GoogleStorageService` falha com erro fatal se não definido. |

**Autenticação GCS:** O SDK utiliza **Application Default Credentials (ADC)**. Não há variável de ambiente para chave JSON.

- **Local:** Execute `gcloud auth application-default login` antes de rodar o servidor.
- **Produção (GCP):** A conta de serviço da instância é usada automaticamente.

### Google Gemini AI

| Variável | Obrigatória | Padrão | Descrição |
|----------|-------------|--------|-----------|
| `GEMINI_API_KEY` | **Sim** | — | Chave de API do Google Gemini (obtida no [AI Studio](https://aistudio.google.com/)). Necessária para análise de processogramas e chat contextual. O `GeminiService` falha com erro fatal se não definida. |

---

## `.env.example`

```bash
# Configuração do Servidor
PORT=8080
NODE_ENV=development

# Banco de Dados (Use a string do Atlas ou localhost)
MONGO_CONNECTION_URL=

# Configurações do JWT
JWT_SECRET=
JWT_EXPIRES_IN=12h

# Google Cloud Storage (ADC - Application Default Credentials)
GCS_PROJECT_ID=your-project-id
GCS_BUCKET_NAME=your-bucket-name

# Google Gemini AI
GEMINI_API_KEY=your-gemini-api-key
```

---

## Comportamento em Caso de Ausência

| Variável Ausente | Comportamento |
|------------------|---------------|
| `PORT` | Usa porta `8080` |
| `NODE_ENV` | `undefined` (comportamento de desenvolvimento) |
| `MONGO_CONNECTION_URL` | `process.exit(1)` com log fatal |
| `JWT_SECRET` | `throw Error` no momento do primeiro uso do `AuthService` |
| `JWT_EXPIRES_IN` | Usa `12h` como padrão |
| `GCS_PROJECT_ID` | SDK tenta inferir do ambiente (pode falhar fora do GCP) |
| `GCS_BUCKET_NAME` | `throw Error` ao instanciar `GoogleStorageService` |
| `GEMINI_API_KEY` | `throw Error` ao instanciar `GeminiService` |

---

## Segurança

- O arquivo `.env` **nunca** deve ser versionado no Git.
- Valores sensíveis (`MONGO_CONNECTION_URL`, `JWT_SECRET`, `GEMINI_API_KEY`) devem ser gerenciados via **secrets manager** em produção (ex: Google Secret Manager, Vault).
- O `GCS_PROJECT_ID` e `GCS_BUCKET_NAME` não são segredos, mas evitam exposição desnecessária da infraestrutura.
