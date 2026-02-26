# SVG Processor Service — Fase 3 Core

## Visão Geral
O `SvgProcessorService` é o coração do processamento de Processogramas. Ele porta a lógica crítica do sistema legado para Clean Architecture, mantendo compatibilidade matemática com o frontend.

## Arquitetura

```
src/infrastructure/services/svg/
├── index.ts                    # Exports
├── SvgProcessorService.ts      # Implementação principal
└── plugins/
    ├── index.ts                        # Export de plugins
    ├── normalizeSemanticIdsPlugin.ts    # Normalizar IDs _(alias) → --(alias)
    ├── fixMissingSvgIdPlugin.ts         # Garantir IDs hierárquicos
    └── removeBxAttributesPlugin.ts      # Limpar sujeira de editores
```

## Plugins SVGO

### normalizeSemanticIdsPlugin *(novo)*
Normaliza IDs de elementos SVG de diferentes convenções de editores (Illustrator, Inkscape) para a convenção canônica `{slug}--{alias}[-número]`.

> Documentação completa: [`09A-NORMALIZE_SEMANTIC_IDS_PLUGIN.md`](./09A-NORMALIZE_SEMANTIC_IDS_PLUGIN.md)

**Problema:** SVGs exportados por diferentes designers usam separadores inconsistentes:
| Formato original | Normalizado |
|-----------------|-------------|
| `sow_lf` | `sow--lf` |
| `pig_ci_54_` | `pig--ci-54` |
| `conventional--intensive_ps` | `conventional-intensive--ps` |
| `laying_hen--lf` | `laying_hen--lf` *(já correto — ignorado)* |

**Regras:**
- `_(alias)` → `--alias`
- `_(alias)_(dígitos)_` → `--alias-dígitos`
- `--` no slug colapsado para `-` (o único `--` no ID é o separador semântico)
- IDs já normalizados (`--(ps|lf|ph|ci)`) são ignorados

**Ordem no pipeline:** Executa **antes** do `fixMissingSvgIdPlugin` para normalizar IDs reais do designer antes que IDs genéricos sejam gerados.

### fixMissingSvgIdPlugin
Garante que todos os elementos SVG relevantes tenham IDs compatíveis com o Frontend.

**Prefixos reconhecidos pelo Frontend:**
| Prefixo | Significado |
|---------|-------------|
| `--ps`  | Process Step |
| `--lf`  | Life Phase |
| `--ph`  | Placeholder |
| `--ci`  | Critical Indicator |
| `--el`  | Element (genérico) |
| `--grp` | Group |

**Funcionamento:**
- Elementos sem ID recebem um ID gerado: `--el-{tagName}-{counter}`
- IDs existentes são preservados
- Garante unicidade de IDs

### removeBxAttributesPlugin
Remove atributos de editores de SVG que poluem o arquivo:
- `bx:*` (Boxy SVG)
- `data-bx-*` (Boxy SVG data)
- `sodipodi:*` (Inkscape)
- `inkscape:*` (Inkscape)

## SvgProcessorService

### Interface Implementada
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

### Fluxo de Processamento

```
1. Buffer SVG recebido
       ↓
2. Otimização SVGO (plugins aplicados)
   a. preset-default (cleanupIds: false)
   b. normalizeSemanticIdsPlugin (IDs _(alias) → --(alias))
   c. fixMissingSvgIdPlugin (gera IDs para elementos sem ID)
   d. removeBxAttributesPlugin (remove atributos de editores)
       ↓
3. Extração de metadados (JSDOM)
       ↓
4. Inicialização Puppeteer (headless)
       ↓
5. Carregar SVG no browser
       ↓
6. Injetar script de extração de BBox
       ↓
7. Coletar elementos rasterizáveis (--ps, --lf, --ph, --ci)
       ↓
8. Para cada elemento:
   - Calcular BBox transformado
   - Tirar screenshot (PNG)
   - Otimizar com Sharp
       ↓
9. Retornar ProcessedSvgOutput
```

### Cálculo de BBox Transformado
O script injetado (`getTransformedBBox`) replica a matemática do legado:

```javascript
// Pega a matriz de transformação do elemento para a tela
const ctm = element.getCTM();

// Transforma os 4 cantos do bbox
const corners = [topLeft, topRight, bottomRight, bottomLeft];
const transformed = corners.map(c => c.matrixTransform(ctm));

// Calcula novo bbox a partir dos cantos transformados
const minX = Math.min(...transformed.map(c => c.x));
const minY = Math.min(...transformed.map(c => c.y));
// ... etc
```

Isso é **crítico** para manter compatibilidade pixel-perfect com o frontend.

### Configuração Puppeteer
Otimizado para Docker/Cloud:
```typescript
await puppeteer.launch({
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-software-rasterizer',
  ],
});
```

### Device Scale Factor
Screenshots são tiradas em 2x DPI para alta qualidade:
```typescript
await page.setViewport({
  width: Math.ceil(metadata.width),
  height: Math.ceil(metadata.height),
  deviceScaleFactor: 2,
});
```

## Uso

### Singleton Pattern
```typescript
import { getSvgProcessor, shutdownSvgProcessor } from '../infrastructure/services/svg';

// Obter instância
const processor = getSvgProcessor();

// Processar SVG
const result = await processor.process(svgBuffer);

// Ao encerrar o servidor
await shutdownSvgProcessor();
```

### Resultado do Processamento
```typescript
{
  optimizedSvg: '<svg>...</svg>',
  metadata: {
    width: 1920,
    height: 1080,
    viewbox: '0 0 1920 1080'
  },
  rasterImages: Map {
    '--ps-step-1' => {
      src: '',           // Preenchido após upload
      bucket_key: '',    // Preenchido após upload
      width: 400,
      height: 300,
      x: 100,
      y: 150,
      _buffer: Buffer    // PNG temporário para upload
    },
    '--lf-phase-1' => { ... },
    ...
  }
}
```

## Integração com Google Cloud Storage
O serviço retorna os buffers PNG em `_buffer`. O UseCase responsável pelo upload deve:

1. Iterar sobre `rasterImages`
2. Upload de cada `_buffer` para GCS
3. Atualizar `src` com URL pública
4. Atualizar `bucket_key` com path no bucket
5. Remover `_buffer` antes de salvar no banco

## Performance

### Otimizações Aplicadas
- Browser singleton (reutilizado entre processamentos)
- Sharp compression level 9 para PNGs menores
- SVGO multipass para menor tamanho de SVG
- Padding de 2px nos screenshots para evitar clipping

### Memory Management
- Fechar páginas do Puppeteer após uso
- Chamar `shutdownSvgProcessor()` no graceful shutdown do servidor

## Próximos Passos
1. Implementar `CreateProcessogramUseCase` com upload para GCS
2. Configurar Multer para upload de arquivos
3. Implementar API de upload com processamento assíncrono
4. Adicionar queue de processamento (Bull/Redis) para escala
