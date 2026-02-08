# 09 - Google Cloud Storage

## Visão Geral

O `GoogleStorageService` implementa a interface `IStorageService` para operações de upload/delete no Google Cloud Storage, adaptada para Clean Architecture.

A autenticação utiliza **Application Default Credentials (ADC)** — sem chaves JSON no código ou em variáveis de ambiente.

| Ambiente        | Mecanismo de autenticação                           |
|-----------------|-----------------------------------------------------|
| Desenvolvimento | Identidade do desenvolvedor via `gcloud auth`       |
| Cloud Run       | Service Account atrelada ao serviço (automático)    |
| Docker local    | Volume mount das credenciais `gcloud`               |

---

## 1. Interface

```typescript
interface IStorageService {
  upload(file: Buffer, path: string, mimeType: string): Promise<string>;
  delete(path: string): Promise<void>;
}
```

---

## 2. Métodos

### `upload(file, path, mimeType)`
- Salva o buffer no bucket com o path especificado
- Configura cache de 1 ano (`max-age=31536000`)
- Torna o arquivo público (`makePublic()`)
- Retorna URL pública: `https://storage.googleapis.com/{bucket}/{path}`

### `delete(path)`
- Remove o arquivo do bucket
- Silencia erros 404 (arquivo não existe)

### `deleteByPrefix(prefix)`
- Remove todos os arquivos com um prefixo comum
- Exemplo: `processograms/bovino/fattening/flow-1/`
- Não lança erro em falhas (cleanup seguro)

### `exists(path)`
- Verifica se um arquivo existe no bucket
- Retorna boolean

---

## 3. Uso

### Singleton

```typescript
import { getStorageService, isStorageConfigured } from '../infrastructure/services/storage';

if (isStorageConfigured()) {
  const storage = getStorageService();

  const url = await storage.upload(
    pngBuffer,
    'processograms/bovino/fattening/element-1.png',
    'image/png'
  );

  await storage.delete('processograms/bovino/fattening/element-1.png');
}
```

### Integração com SvgProcessorService

```typescript
const svgProcessor = getSvgProcessor();
const storage = getStorageService();

const result = await svgProcessor.process(svgBuffer);

for (const [elementId, rasterImage] of result.rasterImages) {
  const path = `processograms/${specieSlug}/${moduleSlug}/${processogramSlug}/${elementId}.png`;
  const url = await storage.upload(
    (rasterImage as any)._buffer,
    path,
    'image/png'
  );
  rasterImage.src = url;
  rasterImage.bucket_key = path;
  delete (rasterImage as any)._buffer;
}
```

---

## 4. Estrutura de Paths no Bucket

```
processograms/
└── {specie-slug}/
    └── {module-slug}/
        └── {processogram-slug}/
            ├── light/
            │   ├── original.svg
            │   ├── --ps-step-1.png
            │   └── --lf-phase-1.png
            └── dark/
                ├── original.svg
                └── ...
```

Exemplo real:

```
processograms/
└── bovino/
    └── fattening/
        └── welfare-flow-v1/
            ├── light/
            │   ├── original.svg
            │   ├── --ps-feeding-1.png
            │   ├── --ps-handling-2.png
            │   └── --lf-arrival.png
            └── dark/
                └── ...
```

---

## 5. Variáveis de Ambiente

Apenas duas variáveis no `.env`:

```env
GCS_PROJECT_ID=your-project-id
GCS_BUCKET_NAME=your-bucket-name
```

> `GCS_PROJECT_ID` é opcional se o projeto padrão já foi definido via `gcloud config set project`,
> mas é recomendado mantê-lo explícito.

### Fail Fast

Se `GCS_BUCKET_NAME` não estiver definida, o construtor lança erro imediato:

```
FATAL: Missing Google Cloud Storage configuration. Required env var: GCS_BUCKET_NAME
```

Verificação programática:

```typescript
if (!isStorageConfigured()) {
  throw new Error('Storage not configured');
}
```

---

## 6. Setup — Desenvolvimento Local

### Instalar Google Cloud CLI

```bash
# macOS (Homebrew)
brew install --cask google-cloud-sdk

# Linux
curl https://sdk.cloud.google.com | bash
exec -l $SHELL

# Verificar instalação
gcloud --version
```

### Autenticação ADC

```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
```

Credenciais salvas automaticamente em:

- **macOS/Linux**: `~/.config/gcloud/application_default_credentials.json`
- **Windows**: `%APPDATA%\gcloud\application_default_credentials.json`

O SDK detecta esse arquivo automaticamente — nenhuma variável adicional é necessária.

---

## 7. Setup — Docker Local

Monte o volume do gcloud para que o container herde as credenciais ADC do host:

```bash
docker run \
  -v ~/.config/gcloud:/root/.config/gcloud:ro \
  -e GCS_PROJECT_ID=your-project-id \
  -e GCS_BUCKET_NAME=your-bucket-name \
  your-image
```

Docker Compose:

```yaml
services:
  api:
    build: .
    volumes:
      - ~/.config/gcloud:/root/.config/gcloud:ro
    environment:
      - GCS_PROJECT_ID=your-project-id
      - GCS_BUCKET_NAME=your-bucket-name
```

> `:ro` = read-only. O container só precisa ler as credenciais.

---

## 8. Setup — Cloud Run (Produção)

A autenticação é automática via Service Account atrelada ao serviço.

```bash
# Obter a Service Account padrão do Cloud Run
gcloud run services describe YOUR_SERVICE --region=YOUR_REGION \
  --format='value(spec.template.spec.serviceAccountName)'

# Conceder acesso ao bucket
gsutil iam ch serviceAccount:SA_EMAIL:objectAdmin gs://YOUR_BUCKET_NAME
```

Nenhum arquivo de credencial ou variável extra é necessário.

---

## 9. Permissões no Bucket

| Papel                          | Motivo                        |
|--------------------------------|-------------------------------|
| `roles/storage.objectCreator`  | Upload de arquivos            |
| `roles/storage.objectViewer`   | Leitura e verificação         |
| `roles/storage.objectAdmin`    | Deleção de arquivos           |

Para desenvolvimento, `Storage Object Admin` é suficiente:

```bash
gsutil iam ch user:YOUR_EMAIL:objectAdmin gs://YOUR_BUCKET_NAME
```

---

## 10. Troubleshooting

| Erro | Causa | Solução |
|------|-------|---------|
| `Could not load the default credentials` | ADC não configurado | `gcloud auth application-default login` |
| `403 Forbidden` | Sem permissão no bucket | Verificar IAM roles no bucket |
| `FATAL: Missing Google Cloud Storage configuration` | `GCS_BUCKET_NAME` ausente | Definir no `.env` |
