# 🎨 Isolamento Visual via GSAP Filter — Arquitetura & Fundamento

> **Módulo:** `navigator/hooks/useNavigator.ts` (outOfFocus), `navigator/hooks/useHoverEffects.ts`  
> **Etapa:** 4 de 5  
> **Referência:** `GUIA_REPLICACAO_SVG_NAVIGATOR.md` §8, §11  

---

## Por que `filter` em vez de `opacity`, `fill` ou CSS estático?

### O problema com `opacity`

```
opacity: 0.3 aplicado a um <g> com elementos sobrepostos:

┌─────────────────────┐
│  ┌──────┐           │
│  │ Path │← opacity 0.3 → as áreas sobrepostas ficam
│  │ ┌────┤           │    com transparência dupla (0.09),
│  │ │Text│           │    criando artefatos visuais
│  │ └────┘           │
│  └──────┘           │
└─────────────────────┘
```

`opacity` afeta **tudo** dentro do grupo — `fill`, `stroke`, `text` — e cria artefatos de transparência em elementos sobrepostos. Não é adequado para SVGs complexos com muitas camadas.

### O problema com alterar `fill`/`stroke`

Modificar diretamente `fill` ou `stroke` dos elementos:
- Destrói as cores originais do SVG (é irreversível sem guardar estado anterior)
- Cada elemento pode ter dezenas de paths com cores diferentes
- Restaurar o estado original requer clonar/cachear valores para cada atributo
- Não funciona com gradientes, patterns ou imagens embedded

### A solução: `filter: brightness()` / `filter: grayscale()`

```
filter: brightness(0.3)        filter: brightness(1)
┌─────────────────────┐        ┌─────────────────────┐
│  ████████████████   │        │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │
│  █ ESCURO mas     █ │        │  ▓ BRILHO NORMAL  ▓ │
│  █ CORES INTACTAS █ │        │  ▓ CORES INTACTAS ▓ │
│  █ SÓLIDO (s/     █ │        │  ▓ SÓLIDO         ▓ │
│  █ transparência) █ │        │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │
│  ████████████████   │        └─────────────────────┘
└─────────────────────┘
```

**Vantagens:**
- **Preserva hue/saturation:** apenas reduz luminosidade — as cores do Wladimir ficam 100% intactas
- **Sem artefatos:** o elemento fica "sólido" mas escurecido — não há transparência
- **Reversível trivialmente:** `brightness(1)` restaura o estado original sem nenhum cache
- **Um único CSS property:** aplicado no `<g>` pai, afeta todos os filhos automaticamente
- **Animável via GSAP:** transição suave entre estados em ~0.35s

---

## Modos de Tema

### Dark Mode — `brightness()`

| Estado | Filtro | Efeito |
|--------|--------|--------|
| FOCUSED | `brightness(1)` | Brilho normal (100%) — cores originais |
| UNFOCUSED | `brightness(0.3)` | Escurece para 30% — mantém hue, reduz luminosidade |

Resultado: elementos fora de foco ficam quase "apagados" contra o fundo escuro, criando forte contraste com o elemento ativo.

### Light Mode — `grayscale()`

| Estado | Filtro | Efeito |
|--------|--------|--------|
| FOCUSED | `grayscale(0)` | Sem dessaturação — cores originais |
| UNFOCUSED | `grayscale(1)` | Remove toda saturação — fica cinza monocromático |

Resultado: no fundo claro, `brightness(0.3)` tornaria os elementos invisíveis. `grayscale(1)` mantém a forma visível mas remove a cor, criando contraste por saturação.

---

## Dois Contextos de Isolamento

### 1. Navegação (`useNavigator` — `changeLevelTo`)

Quando o usuário clica num grupo e a câmera desliza:

```
ANTES (visão geral):        DEPOIS (zoom em LF1):
┌──────────────────┐        ┌──────────────────┐
│ [LF1] [LF2] [LF3]│   →   │ ████████████████ │ ← LF2/LF3: brightness(0.3)
│                   │        │ ║    LF1       ║ │ ← LF1: brightness(1)
│                   │        │ ║  [PH1] [PH2] ║ │ ← filhos: brightness(1)
│                   │        │ ████████████████ │
└──────────────────┘        └──────────────────┘
```

**Seletor de irmãos fora de foco:**

- **Nível normal (< MAX_LEVEL):**
  ```
  [id*="--"]:not([id^="{id}"] *):not([id="{id}"])
  ```
  Seleciona tudo com `--` que NÃO é descendente do alvo.

- **Nível máximo (ci — folha):**
  ```
  [id*="{levelKey}"]:not([id="{id}"])
  ```
  Escurece apenas os irmãos do mesmo nível.

**Ref de animação:**
A animação é guardada em `outOfFocusAnimationRef`. Antes de cada nova transição, `.revert()` é chamado para desfazer o estado anterior limpa e atomicamente.

### 2. Hover (`useHoverEffects`)

Efeito instantâneo de "spotlight" ao mover o cursor:

```
Mouse sobre PH1:           Mouse sai:
┌──────────────────┐        ┌──────────────────┐
│ ║  [PH1]       ║ │ ← 1.0 │ ║  [PH1] [PH2] ║ │ ← ambos 1.0
│ ║  ████ [PH2] ║ │ ← 0.3 │ ║               ║ │
└──────────────────┘        └──────────────────┘
```

**Duração:** `ANIMATION_DURATION / 2` (0.35s) — metade da duração da câmera para resposta tátil rápida.

**Fluxo:**

| `onHover` | Ação |
|-----------|------|
| `"growing--lf1"` | Hovered → FOCUSED, irmãos do nível → UNFOCUSED |
| `null` | Restaura estado padrão: irmãos do nível atual → UNFOCUSED, elemento atual + filhos próximo nível → FOCUSED |

---

## Garantias de Integridade Visual

| Garantia | Como |
|----------|------|
| Cores do SVG nunca alteradas | Apenas `filter` CSS — `fill`/`stroke`/`opacity` intocados |
| Sem artefatos de transparência | `brightness` em vez de `opacity` |
| Restauração perfeita | `brightness(1)` / `grayscale(0)` = estado original sem cache |
| Sem sobreposição de animações | `.revert()` na animação anterior antes de iniciar nova |
| Sem flickering em hover | `useEffect([onHover])` — só recalcula quando o target muda |
| Tema dinâmico | `FOCUSED_FILTER[theme]` / `UNFOCUSED_FILTER[theme]` — automático |

---

## Pipeline de Integração

```
Etapa 1 (✅) → extractInfoFromId.ts → identifica QUAL elemento navegar
Etapa 2 (✅) → getElementViewBox.ts  → calcula PARA ONDE a câmera vai
Etapa 3 (✅) → useNavigator.ts       → ANIMA a transição com GSAP
              useClickHandler.ts     → DECIDE drill-down vs drill-up
              hierarchy.ts           → MONTA o breadcrumb path
Etapa 4 (✅) → useNavigator.ts       → ESCURECE irmãos fora de foco
              useHoverEffects.ts     → HOVER spotlight com filter
Etapa 5 (🔲) → useEventBus.ts        → navegação programática
              useSvgNavigatorLogic   → orquestrador dos hooks
```
