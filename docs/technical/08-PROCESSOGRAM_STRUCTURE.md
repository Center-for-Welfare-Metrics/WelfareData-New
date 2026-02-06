# Estrutura do Processogram — Fase 3

## Visão Geral
O Processogram é a entidade central do sistema WelfareData. Ele representa um fluxograma visual de processos de bem-estar animal, armazenando dois temas (light/dark) e um mapa detalhado de imagens rasterizadas com coordenadas para zoom no frontend.

## Hierarquia do Sistema

```
Specie (ex: Bovino)
  └── ProductionModule (ex: Fattening)
      └── Processogram (ex: Flow Diagram)
          ├── SVG Light Theme
          ├── SVG Dark Theme
          ├── Raster Images Light (Map)
          └── Raster Images Dark (Map)
```

## Domain Interface: IProcessogram

### Campos Principais
```typescript
interface IProcessogram {
  identifier: string;      // Identificador único textual
  name: string;            // Nome do processograma
  slug: string;            // Slug gerado automaticamente do nome
  description?: string;    // Descrição opcional
  
  // Relacionamentos
  specieId: string;
  productionModuleId: string;
  
  // Status do processamento
  status: 'processing' | 'ready' | 'error' | 'generating';
  
  // Arquivos Light Theme
  svg_url_light?: string;
  svg_bucket_key_light?: string;
  original_name_light?: string;
  original_size_light?: number;
  final_size_light?: number;
  
  // Arquivos Dark Theme (mesma estrutura)
  svg_url_dark?: string;
  // ...
  
  // CRÍTICO: Mapas de imagens rasterizadas
  raster_images_light: Record<string, IRasterImage>;
  raster_images_dark: Record<string, IRasterImage>;
  
  creatorId: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### Interface IRasterImage
```typescript
interface IRasterImage {
  src: string;          // URL pública da imagem no bucket
  bucket_key: string;   // Chave no Google Cloud Storage
  width: number;        // Largura em pixels
  height: number;       // Altura em pixels
  x: number;            // Coordenada X no SVG original
  y: number;            // Coordenada Y no SVG original
}
```

## O que são Raster Images?

### Conceito
O campo `raster_images_light` (e `raster_images_dark`) é um **mapa** onde:
- **Chave:** ID do elemento SVG (ex: "rect-001", "group-header")
- **Valor:** Objeto `IRasterImage` com URL e coordenadas

### Por que isso existe?
O frontend implementa um sistema de **zoom interativo** nos processogramas:

1. **Visualização Normal:** Exibe o SVG vetorial completo
2. **Zoom Profundo:** Substitui regiões do SVG por imagens PNG de alta resolução

### Fluxo de Processamento
```
SVG Upload
    ↓
SVGO Optimization
    ↓
Puppeteer Rendering
    ↓
Screenshot de cada elemento com ID
    ↓
Upload para Google Cloud Storage
    ↓
Salvar mapa de coordenadas no banco
```

### Exemplo de Dados
```json
{
  "raster_images_light": {
    "header-section": {
      "src": "https://storage.googleapis.com/.../header-section.png",
      "bucket_key": "processograms/bovino/fattening/flow-1/light/header-section.png",
      "width": 800,
      "height": 200,
      "x": 0,
      "y": 0
    },
    "process-step-1": {
      "src": "https://storage.googleapis.com/.../process-step-1.png",
      "bucket_key": "processograms/bovino/fattening/flow-1/light/process-step-1.png",
      "width": 400,
      "height": 300,
      "x": 100,
      "y": 250
    }
  }
}
```

## Infrastructure: ProcessogramModel

### Índices
- **Compound Unique:** `{ productionModuleId: 1, slug: 1 }`
  - Permite mesmo slug em módulos diferentes
  - Impede duplicação dentro do mesmo módulo
- **Index:** `{ specieId: 1 }` para queries por espécie

### Hook Pre-Save
O slug é gerado automaticamente a partir do nome:
```typescript
ProcessogramSchema.pre('save', function (next) {
  if (this.isModified('name') || this.isNew) {
    this.slug = slugify(this.name);
  }
  next();
});
```

### Tipo do Campo raster_images
Usando `Map` do Mongoose para flexibilidade:
```typescript
raster_images_light: { type: Map, of: RasterImageSchema, default: {} }
```

## Application Interface: ISvgProcessor

### Propósito
Interface para o serviço de processamento SVG que será implementado com:
- **SVGO:** Otimização de SVG
- **JSDOM:** Parsing de SVG
- **Puppeteer:** Geração de screenshots
- **Sharp:** Processamento de imagens

### Métodos
```typescript
interface ISvgProcessor {
  process(buffer: Buffer): Promise<ProcessedSvgOutput>;
}

interface ProcessedSvgOutput {
  optimizedSvg: string;
  rasterImages: Map<string, IRasterImage>;
  metadata: { width: number; height: number; viewbox: string };
}
```

## Status do Processograma

| Status | Descrição |
|--------|-----------|
| `processing` | Upload recebido, aguardando processamento |
| `generating` | SVG sendo processado e imagens sendo geradas |
| `ready` | Processamento completo, pronto para visualização |
| `error` | Erro durante processamento |

## Compatibilidade com Frontend

### Nomenclatura Exata
Os campos mantêm nomenclatura do schema legado:
- `svg_url_light` (não `svgUrlLight`)
- `svg_bucket_key_light` (não `svgBucketKeyLight`)
- `raster_images_light` (não `rasterImagesLight`)

Isso garante compatibilidade com o frontend existente sem necessidade de migração.

## Próximos Passos
1. Implementar `SvgProcessorService` usando SVGO + Puppeteer
2. Implementar `CreateProcessogramUseCase` com upload para GCS
3. Implementar API de upload com multer
4. Implementar `DeleteProductionModuleUseCase` safety check
