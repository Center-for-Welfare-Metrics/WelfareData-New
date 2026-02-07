# Google Storage Service — Infraestrutura de Storage

## Visão Geral
O `GoogleStorageService` implementa a interface `IStorageService` para operações de upload/delete no Google Cloud Storage. Replica a lógica do sistema legado (`src/storage/google-storage.ts`) adaptada para Clean Architecture.

## Interface

```typescript
interface IStorageService {
  upload(file: Buffer, path: string, mimeType: string): Promise<string>;
  delete(path: string): Promise<void>;
}
```

## Configuração

### Variáveis de Ambiente
```env
GCS_PROJECT_ID=your-project-id
GCS_CLIENT_EMAIL=your-service-account@your-project-id.iam.gserviceaccount.com
GCS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n"
GCS_BUCKET_NAME=your-bucket-name
```

### Tratamento da Private Key
**CRÍTICO:** A private_key em arquivos .env frequentemente tem `\n` escapados como texto literal. O serviço aplica:
```typescript
const formattedPrivateKey = privateKey.replace(/\\n/g, '\n');
```

## Métodos

### upload(file, path, mimeType)
- Salva o buffer no bucket com o path especificado
- Configura cache de 1 ano (`max-age=31536000`)
- **Torna o arquivo público** (`makePublic()`)
- Retorna URL pública: `https://storage.googleapis.com/{bucket}/{path}`

### delete(path)
- Remove o arquivo do bucket
- **Silencia erros 404** (arquivo não existe)
- Útil para cleanup sem risco de falhas

### deleteByPrefix(prefix)
- Remove todos os arquivos com um prefixo comum
- Exemplo: `processograms/bovino/fattening/flow-1/`
- Não lança erro em falhas (cleanup seguro)

### exists(path)
- Verifica se um arquivo existe no bucket
- Retorna boolean

## Uso

### Singleton Pattern
```typescript
import { getStorageService, isStorageConfigured } from '../infrastructure/services/storage';

// Verificar se storage está configurado
if (isStorageConfigured()) {
  const storage = getStorageService();
  
  // Upload
  const url = await storage.upload(
    pngBuffer,
    'processograms/bovino/fattening/element-1.png',
    'image/png'
  );
  
  // Delete
  await storage.delete('processograms/bovino/fattening/element-1.png');
}
```

### Integração com SvgProcessorService
```typescript
const svgProcessor = getSvgProcessor();
const storage = getStorageService();

// Processar SVG
const result = await svgProcessor.process(svgBuffer);

// Upload de cada imagem rasterizada
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

## Estrutura de Paths no Bucket

### Convenção de Nomenclatura
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

### Exemplo Real
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

## Segurança

### Fail Fast
Se as variáveis de ambiente não estiverem configuradas, o construtor lança erro imediato:
```
FATAL: Missing Google Cloud Storage configuration.
Required env vars: GCS_PROJECT_ID, GCS_CLIENT_EMAIL, GCS_PRIVATE_KEY, GCS_BUCKET_NAME
```

### Verificação Antes de Uso
```typescript
if (!isStorageConfigured()) {
  throw new Error('Storage not configured');
}
```

### Permissões do Service Account
O service account precisa das seguintes permissões no bucket:
- `storage.objects.create`
- `storage.objects.delete`
- `storage.objects.get`
- `roles/storage.objectAdmin` (ou IAM equivalente)

## Próximos Passos
1. Implementar `CreateProcessogramUseCase` usando este serviço
2. Configurar Multer para upload de arquivos
3. Implementar API de upload com processamento assíncrono
