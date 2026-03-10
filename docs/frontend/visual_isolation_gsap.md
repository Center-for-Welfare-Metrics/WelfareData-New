# 🎨 Isolamento Visual via GSAP Opacity — Arquitetura & Fundamento

> **Módulo:** `navigator/hooks/useNavigator.ts` (outOfFocus), `navigator/hooks/useHoverEffects.ts`  
> **Etapa:** 4 de 5  
> **Referência:** `GUIA_REPLICACAO_SVG_NAVIGATOR.md` §8, §11  

---

## Por que `opacity` em vez de `filter`, `fill` ou CSS estático?

### O problema com `filter: brightness()` / `filter: grayscale()`

`filter` CSS força o browser a:
- Criar **camadas GPU individuais** por cada elemento filtrado
- **Re-rasterizar vetores** a cada frame de animação GSAP
- Em SVGs complexos (1200+ elementos), isso causa **lag severo** (~50.400 repaints por transição)

### O problema com alterar `fill`/`stroke`

Modificar diretamente `fill` ou `stroke` dos elementos:
- Destrói as cores originais do SVG (é irreversível sem guardar estado anterior)
- Cada elemento pode ter dezenas de paths com cores diferentes
- Restaurar o estado original requer clonar/cachear valores para cada atributo
- Não funciona com gradientes, patterns ou imagens embedded

### A solução: `opacity`

```
opacity: 0.15 (dark)           opacity: 1
┌─────────────────────┐        ┌─────────────────────┐
│  ░░░░░░░░░░░░░░░░  │        │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │
│  ░ QUASE INVISÍVEL░ │        │  ▓ VISIB. NORMAL  ▓ │
│  ░ sem re-raster  ░ │        │  ▓ CORES INTACTAS ▓ │
│  ░ GPU-composited ░ │        │  ▓                 ▓ │
│  ░░░░░░░░░░░░░░░░  │        │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │
└─────────────────────┘        └─────────────────────┘
```

**Vantagens:**
- **Composição pura na GPU:** `opacity` é uma propriedade que a GPU compõe sem re-rasterizar — sem camadas individuais por elemento
- **Zero repaints por frame:** o browser apenas ajusta o alpha channel na composição final
- **Reversível trivialmente:** `opacity: 1` restaura o estado original sem nenhum cache
- **Um único CSS property:** aplicado no `<g>` pai, afeta todos os filhos automaticamente
- **Animável via GSAP:** transição suave entre estados em ~0.35s

---

## Modos de Tema

### Dark Mode

| Estado | Opacity | Efeito |
|--------|---------|--------|
| FOCUSED | `1` | Visibilidade total — cores originais |
| UNFOCUSED | `0.15` | Quase invisível contra fundo escuro — forte contraste com o elemento ativo |

### Light Mode

| Estado | Opacity | Efeito |
|--------|---------|--------|
| FOCUSED | `1` | Visibilidade total — cores originais |
| UNFOCUSED | `0.2` | Levemente mais visível que dark mode — mantém legibilidade no fundo claro |

---

## Dois Contextos de Isolamento

### 1. Navegação (`useNavigator` — `changeLevelTo`)

Quando o usuário clica num grupo e a câmera desliza:

```
ANTES (visão geral):        DEPOIS (zoom em LF1):
┌──────────────────┐        ┌──────────────────┐
│ [LF1] [LF2] [LF3]│   →   │ ░░░░░░░░░░░░░░░░ │ ← LF2/LF3: opacity 0.15
│                   │        │ ║    LF1       ║ │ ← LF1: opacity 1
│                   │        │ ║  [PH1] [PH2] ║ │ ← filhos: opacity 1
│                   │        │ ░░░░░░░░░░░░░░░░ │
└──────────────────┘        └──────────────────┘
```

**Seletor de irmãos fora de foco:**

- **Nível normal (< MAX_LEVEL):**
  ```
  [id*="--" i]:not([id^="{id}"] *):not([id="{id}"])
  ```
  Seleciona tudo com `--` que NÃO é descendente do alvo. A flag `i` garante match case-insensitive (IDs do SVG são UPPERCASE).

- **Nível máximo (ci — folha):**
  ```
  [id*="{levelKey}" i]:not([id="{id}"])
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
│ ║  ░░░░ [PH2] ║ │ ← 0.15│ ║               ║ │
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
| Cores do SVG nunca alteradas | Apenas `opacity` CSS — `fill`/`stroke`/`filter` intocados |
| Zero re-rasterização | `opacity` é composição pura na GPU |
| Restauração perfeita | `opacity: 1` = estado original sem cache |
| Sem sobreposição de animações | `.revert()` na animação anterior antes de iniciar nova |
| Sem flickering em hover | `useEffect([onHover])` — só recalcula quando o target muda |
| Tema dinâmico | `FOCUSED_OPACITY[theme]` / `UNFOCUSED_OPACITY[theme]` — automático |

---

## Pipeline de Integração

```
Etapa 1 (✅) → extractInfoFromId.ts → identifica QUAL elemento navegar (alias case-insensitive)
Etapa 2 (✅) → getElementViewBox.ts  → calcula PARA ONDE a câmera vai (swap síncrono + CTM composta)
Etapa 3 (✅) → useNavigator.ts       → ANIMA a transição com GSAP (passa originalViewBoxRef)
              useClickHandler.ts     → DECIDE drill-down vs drill-up (auto-click guard + fallbacks)
              hierarchy.ts           → MONTA o breadcrumb path (seletores case-insensitive)
Etapa 4 (✅) → useNavigator.ts       → REDUZ OPACIDADE dos irmãos fora de foco (seletores com flag `i`)
              useHoverEffects.ts     → HOVER spotlight com opacity (seletores com flag `i`)
Etapa 5 (🔲) → useEventBus.ts        → navegação programática
              useSvgNavigatorLogic   → orquestrador dos hooks (+ originalViewBoxRef)
```
