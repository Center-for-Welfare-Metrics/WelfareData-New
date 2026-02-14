# WelfareData Backend

## Visão Geral

**WelfareData** é o backend da plataforma do **Center for Welfare Metrics (CWM)**, parte do **Welfare Footprint Institute (WFI)**. O sistema gerencia processogramas — diagramas técnicos que mapeiam fluxos de produção animal — e enriquece esses diagramas com inteligência artificial para gerar descrições científicas dos elementos, possibilitando análise de bem-estar animal em escala.

O backend processa uploads de SVG, otimiza e rasteriza os diagramas, persiste metadados e imagens no Google Cloud Storage, gera descrições via Google Gemini, e oferece um chat contextual com streaming para interação com os dados técnicos.

---

## Documentação

| Documento | Descrição |
|-----------|-----------|
| [System Architecture](./system_architecture.md) | Camadas, padrões e tecnologias |
| [Data Flow](./data_flow.md) | Fluxo crítico: do upload do SVG ao chat contextual |
| [Security Model](./security_model.md) | Autenticação, autorização e gestão de credenciais |
| [Environment Variables](./environment_variables.md) | Variáveis de ambiente e configuração |
| [Frontend Guidelines](./frontend_guidelines.md) | Stack, UX/UI, temas Dark/Light, gamificação |
| [ADR-001: Google Gemini](./architecture_decisions/001_use_of_google_gemini.md) | Decisão de adoção do Google Gemini como provider de IA |

### Documentação Técnica por Feature

Documentação detalhada de cada feature está disponível em [`docs/technical/`](./technical/).

---

## Quick Start

### Pré-requisitos

- **Node.js** >= 18.x
- **MongoDB** (Atlas ou instância local)
- **Google Cloud SDK** configurado com ADC (`gcloud auth application-default login`)
- **Conta Google Cloud** com bucket GCS criado
- **Chave de API** do Google Gemini (AI Studio)

### Instalação

```bash
# 1. Clonar o repositório
git clone https://github.com/Center-for-Welfare-Metrics/WelfareData-New.git
cd WelfareData-New

# 2. Instalar dependências
npm install

# 3. Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com suas credenciais (ver docs/environment_variables.md)

# 4. Configurar ADC para Google Cloud Storage
gcloud auth application-default login
```

### Executar

```bash
# Desenvolvimento (com hot-reload)
npm run dev

# Build de produção
npm run build

# Executar build de produção
npm start
```

### Verificar

```bash
curl http://localhost:8080/api/v1/health
# → { "status": "OK", "timestamp": "...", "environment": "development" }
```

---

## Stack Tecnológica

| Categoria | Tecnologia | Versão |
|-----------|-----------|--------|
| Runtime | Node.js | >= 18.x |
| Linguagem | TypeScript | 5.9+ |
| Framework | Express | 5.x |
| Banco de Dados | MongoDB (Mongoose) | 9.x |
| Storage | Google Cloud Storage | 7.x |
| IA | Google Gemini (generative-ai SDK) | 0.24+ |
| SVG | SVGO | 4.x |
| Rasterização | Puppeteer | 24.x |
| Imagem | Sharp | 0.34+ |
| Parsing | Cheerio, JSDOM | - |
| Auth | bcryptjs, jsonwebtoken | - |
| Validação | Zod | 4.x |
| Upload | Multer | 2.x |

---

## Endpoints

Todas as rotas da API estão sob o namespace `/api/v1`.

| Grupo | Base Path | Descrição |
|-------|-----------|-----------|
| Root | `GET /` | Status temporário (frontend em construção) |
| Health | `GET /api/v1/health` | Health check |
| Auth | `/api/v1/auth` | Registro, login, logout, perfil |
| Species | `/api/v1/species` | CRUD de espécies |
| Production Modules | `/api/v1/production-modules` | CRUD de módulos de produção |
| Processograms | `/api/v1/processograms` | CRUD de processogramas + análise IA |
| Processogram Data | `/api/v1/processogram-data` | Edição de descrições (Human-in-the-Loop) |
| Processogram Questions | `/api/v1/processogram-questions` | Edição de questões (Human-in-the-Loop) |
| Chat | `/api/v1/chat` | Chat contextual com streaming SSE |
