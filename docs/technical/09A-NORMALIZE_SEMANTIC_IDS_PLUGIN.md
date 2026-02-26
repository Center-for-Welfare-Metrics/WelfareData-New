# normalizeSemanticIdsPlugin — SVGO Pipeline

## Visão Geral

O `normalizeSemanticIdsPlugin` é um plugin SVGO customizado que normaliza IDs de elementos SVG para a convenção canônica do sistema:

```
{slug}--{alias}
{slug}--{alias}-{número}
```

Onde `alias` ∈ `{ ps, lf, ph, ci }`.

### Problema que Resolve

SVGs exportados de diferentes editores (Illustrator, Inkscape, Boxy SVG) usam convenções inconsistentes de separador entre o slug e o alias de nível hierárquico:

| Formato no arquivo original | Esperado pelo frontend |
|----------------------------|------------------------|
| `sow_lf`                  | `sow--lf`              |
| `pig_ci_54_`              | `pig--ci-54`           |
| `growing_ph_1_`           | `growing--ph-1`        |
| `sow--focus_ci_1_`        | `sow-focus--ci-1`      |
| `conventional--intensive_ps` | `conventional-intensive--ps` |

O frontend (`extractInfoFromId.ts`) faz parse dos IDs usando `--` como separador semântico. Sem a normalização, elementos com `_` como separador seriam **invisíveis** para o sistema de navegação, impedindo cliques, hover, zoom e drill-down.

## Localização

```
src/infrastructure/services/svg/plugins/
├── normalizeSemanticIdsPlugin.ts   ← Este plugin
├── fixMissingSvgIdPlugin.ts
├── removeBxAttributesPlugin.ts
└── index.ts                        ← Barrel export
```

## Ordem no Pipeline SVGO

```
1. preset-default (cleanupIds: false)
2. normalizeSemanticIdsPlugin         ← Normaliza IDs existentes
3. fixMissingSvgIdPlugin              ← Gera IDs para elementos sem ID
4. removeBxAttributesPlugin           ← Remove atributos de editores
```

> **Ordem crítica:** Este plugin executa **antes** do `fixMissingSvgIdPlugin` porque precisa normalizar os IDs reais do designer antes que IDs genéricos sejam gerados para elementos sem ID.

## Regexes

### `UNDERSCORE_ALIAS_PATTERN`

```typescript
const UNDERSCORE_ALIAS_PATTERN = /_(ps|lf|ph|ci)(?:_(\d+)_?)?$/;
```

Captura o **último** `_(alias)` no final do ID, opcionalmente seguido de `_dígitos_`.

| Grupo | Conteúdo | Exemplo |
|-------|----------|---------|
| `match[1]` | Alias (`ps`, `lf`, `ph`, `ci`) | `"ci"` |
| `match[2]` | Número opcional | `"54"` ou `undefined` |

**Exemplos de match:**

| ID | Match | Grupo 1 | Grupo 2 |
|----|-------|---------|---------|
| `sow_lf` | `_lf` | `lf` | — |
| `pig_ci_54_` | `_ci_54_` | `ci` | `54` |
| `growing_ph_1_` | `_ph_1_` | `ph` | `1` |
| `piglet_ci` | `_ci` | `ci` | — |
| `laying_hen--lf` | ❌ sem match | — | — |

### `ALREADY_NORMALIZED_PATTERN`

```typescript
const ALREADY_NORMALIZED_PATTERN = /--(ps|lf|ph|ci)(?:[^a-zA-Z]|$)/;
```

Detecta IDs que **já seguem** a convenção `--alias`. Esses IDs são ignorados pelo plugin (sem transformação).

**Exemplos de skip:**

| ID | Já normalizado? |
|----|-----------------|
| `laying_hen--lf` | ✅ Sim — ignorado |
| `hen--ci-58` | ✅ Sim — ignorado |
| `broiler--ps` | ✅ Sim — ignorado |
| `sow_lf` | ❌ Não — será normalizado |

## Algoritmo

```
Para cada elemento SVG com atributo "id":

  1. Se o ID contém --(ps|lf|ph|ci)  →  SKIP (já normalizado)
  2. Se o ID termina com _(alias) ou _(alias)_(dígitos)_  →  NORMALIZAR
  3. Caso contrário  →  SKIP (ID não-semântico)

  NORMALIZAR:
    a. Substituir _(alias) por --alias
    b. Substituir _(alias)_(dígitos)_ por --alias-dígitos
    c. Colapsar "--" no slug para "-"
       (o ÚNICO "--" no ID final deve ser o separador semântico)
```

### Colapso de `--` no Slug

Designers por vezes usam `--` como separador de palavras dentro do slug (ex: `conventional--intensive`, `sow--focus`). Após a normalização do alias, o ID teria múltiplos `--`:

```
conventional--intensive_ps  →  conventional--intensive--ps  ← ERRADO (2x --)
```

O plugin resolve isso localizando o **último** `--` (o separador semântico) e substituindo todos os `--` anteriores por `-`:

```
conventional--intensive--ps  →  conventional-intensive--ps  ← CORRETO
sow--focus--ci-1             →  sow-focus--ci-1             ← CORRETO
```

Isso garante que `id.indexOf('--')` e `id.split('--')` no frontend funcionem corretamente, pois haverá apenas **um** `--` em cada ID.

## Transformações Completas

| ID Original | ID Normalizado | Notas |
|-------------|----------------|-------|
| `sow_lf` | `sow--lf` | Caso simples |
| `pig_ci_54_` | `pig--ci-54` | Com número e trailing `_` |
| `growing_ph_1_` | `growing--ph-1` | Com número e trailing `_` |
| `piglet_ci` | `piglet--ci` | Sem número |
| `sow--focus_ci_1_` | `sow-focus--ci-1` | Slug com `--` colapsado |
| `conventional--intensive_ps` | `conventional-intensive--ps` | Slug com `--` colapsado |
| `chicken_barn_ps` | `chicken_barn--ps` | Underscores no slug preservados |
| `laying_hen--lf` | `laying_hen--lf` | Já normalizado — ignorado |
| `hen--ci-58` | `hen--ci-58` | Já normalizado — ignorado |
| `broiler--ps` | `broiler--ps` | Já normalizado — ignorado |
| `random-element` | `random-element` | Sem alias — ignorado |
| `--el-rect-1` | `--el-rect-1` | ID genérico — ignorado |

## Integração com o Backend

### SvgParser.ts

O `SvgParser` do backend usa uma regex que aceita **ambos** os formatos (`_` e `--`) para parsing:

```typescript
/(?:--|_)(ps|lf|ph|ci)(?:[_-]\d+[_-]?)?$/
```

Com o plugin de normalização, o `SvgParser` continuará funcionando normalmente, mas agora receberá IDs já padronizados, eliminando a ambiguidade.

### Rasterização (Puppeteer)

As chaves do mapa `rasterImages` são os IDs normalizados. Isso garante que o frontend consiga mapear cada imagem rasterizada ao seu elemento SVG correspondente via `--alias`.

## Integração com o Frontend

### extractInfoFromId.ts

O módulo de navegação do frontend faz split por `--`:

```typescript
const parts = id.split('--');
// parts[0] = slug
// parts[1] = alias + dígitos opcionais
```

**Sem normalização:** `sow_lf` → `split('--')` → `['sow_lf']` → **falha** (sem alias).  
**Com normalização:** `sow--lf` → `split('--')` → `['sow', 'lf']` → **sucesso**.

### querySelector no Click Handler

O `useClickHandler` busca elementos usando `[id*='--lf']`, `[id*='--ph']`, etc. IDs com `_` como separador nunca seriam encontrados por esses seletores.

## Testes

O plugin foi validado com 26 casos de teste cobrindo:
- IDs simples com `_` separador
- IDs com número e trailing `_`
- IDs com `--` no slug (colapso)
- IDs já normalizados (skip)
- IDs sem alias semântico (skip)
- IDs genéricos do `fixMissingSvgIdPlugin` (skip)
- Todos os 4 aliases: `ps`, `lf`, `ph`, `ci`

## Quando este Plugin NÃO Atua

| Cenário | Motivo |
|---------|--------|
| Elemento sem atributo `id` | Nada para normalizar |
| ID já contém `--alias` | Pattern `ALREADY_NORMALIZED_PATTERN` detecta e faz skip |
| ID sem alias semântico (`ps/lf/ph/ci`) | Pattern `UNDERSCORE_ALIAS_PATTERN` não faz match |
| IDs genéricos (`--el-rect-1`) | Já usam `--`, detectados como normalizados |
