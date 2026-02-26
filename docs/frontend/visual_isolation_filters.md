# Visual Isolation System — "Blackout" (Focus & Mute)

> Documentação da decisão arquitetural de isolamento visual no ProcessogramViewer,
> baseada na engenharia reversa do sistema legado do WFI.

---

## 1. Decisão Arquitetural

### Por que `filter: brightness()` e não `opacity` ou `fill`?

| Abordagem         | Efeito Visual                                           | Problema                                                      |
| ------------------ | ------------------------------------------------------- | ------------------------------------------------------------- |
| `opacity: 0.3`    | Elemento fica translúcido, mostrando o fundo por baixo  | Perde legibilidade; sobreposições criam artefatos visuais     |
| `fill: #333`      | Cor sólida substitui a original                         | Destrói o mapa biológico — porco rosa vira cinza              |
| **`brightness(0.3)`** | **Cor original mantida, apenas escurecida**           | **Nenhum — comportamento ideal descoberto no sistema legado** |

O sistema legado do WFI utilizava `filter: brightness()` para criar o efeito de "blackout" onde
elementos fora do foco ficavam escurecidos mas preservavam suas matizes originais. Um elemento
rosa (porco) fica rosa-escuro — **não** cinza. Isso mantém a integridade semântica do mapa
biológico sem poluir a visão do pesquisador.

### Regra Fundamental

> **NUNCA** altere `fill`, `stroke` ou `opacity` dos elementos SVG para fins de isolamento visual.
> Use **exclusivamente** `filter: brightness()`.

---

## 2. Mecanismo de Isolamento (GSAP Filter)

> **Nota:** O sistema anterior usava classes CSS (`.is-exploring`, `.is-active-zone`,
> `.is-target-element`). Esse mecanismo foi **removido** e substituído por animação
> direta de `filter` via GSAP no módulo `navigator/`.

O isolamento visual agora é aplicado **diretamente via GSAP** — sem classes CSS intermediárias:

### Drill-down (`useNavigator.changeLevelTo`)

- **Irmãos fora de foco:** `gsap.to(siblings, { filter: UNFOCUSED_FILTER })`
  - Dark mode: `brightness(0.3)` — escurece preservando matizes
  - Light mode: `grayscale(1)` — dessatura preservando luminosidade
- **Elemento enquadrado + filhos:** `gsap.to(focused, { filter: FOCUSED_FILTER })`
  - Dark mode: `brightness(1)` — brilho total
  - Light mode: `grayscale(0)` — saturação total

### Hover (`useHoverEffects`)

- **Elemento sob o cursor:** FOCUSED_FILTER (brilho/saturação total)
- **Irmãos do mesmo nível:** UNFOCUSED_FILTER (escurecidos/dessaturados)
- **Mouse saiu:** restaura estado padrão do nível atual da câmera

### Constantes (`navigator/consts.ts`)

```ts
export const FOCUSED_FILTER = {
  dark: "brightness(1)",
  light: "grayscale(0)",
};

export const UNFOCUSED_FILTER = {
  dark: "brightness(0.3)",
  light: "grayscale(1)",
};
```

---

## 3. Cascata de Isolamento Visual

O GSAP aplica filter diretamente nos elementos SVG. A prioridade é determinada
pela ordem de execução, não por especificidade CSS:

```
                         ┌─────────────────────────────────────┐
1. changeLevelTo()       │  Irmãos → UNFOCUSED_FILTER          │
                         │  Alvo   → FOCUSED_FILTER            │
                         └────────────┬────────────────────────┘
                                      │
                         ┌────────────▼────────────────────────┐
2. setFullBrightness()   │  Filhos do próximo nível            │
                         │  → FOCUSED_FILTER (drill-down ready)│
                         └────────────┬────────────────────────┘
                                      │
                         ┌────────────▼────────────────────────┐
3. useHoverEffects       │  Hovered → FOCUSED_FILTER           │
                         │  Siblings → UNFOCUSED_FILTER        │
                         └─────────────────────────────────────┘
```

### Exemplo visual no DOM

```xml
<svg>
  <g id="sistema--ps">                        ← UNFOCUSED (escurecido)
    <g id="destino--lf">                      ← FOCUSED (enquadrado pela câmera)
      <g id="fase--ph1">                      ← FOCUSED (filho do próximo nível)
      </g>
      <g id="fase--ph2">                      ← FOCUSED (filho do próximo nível)
      </g>
    </g>
    <g id="destino--lf_2">                    ← UNFOCUSED (irmão fora de foco)
    </g>
  </g>
</svg>
```

---

## 4. Lógica de Aplicação Dinâmica

> **Nota (migração):** O sistema anterior usava classes CSS (`.is-exploring`, `.is-active-zone`,
> `.is-target-element`) aplicadas via `useEffect` em `ProcessogramInteractiveLayer.tsx`.
> Esse sistema foi **deletado** e substituído pelo módulo `navigator/`.

O sistema atual usa **GSAP** para animar `filter: brightness()` / `filter: grayscale()`
diretamente nos elementos SVG, sem classes CSS intermediárias:

```
Drill-down (useNavigator.changeLevelTo):
  1. Calcula viewBox destino (getElementViewBox)
  2. Seleciona irmãos fora de foco
  3. gsap.to(irmãos, { filter: UNFOCUSED_FILTER })
  4. gsap.fromTo(svg, { viewBox: atual }, { viewBox: destino })
  5. onComplete → setFullBrightnessToCurrentLevel()

Hover (useHoverEffects):
  1. onHover = id → gsap.to(hovered, { filter: FOCUSED_FILTER })
                   → gsap.to(siblings, { filter: UNFOCUSED_FILTER })
  2. onHover = null → restaura estado padrão do nível atual
```

### Vantagens sobre o sistema de classes CSS

1. **Transições animadas com easing** — GSAP interpola filter frame a frame
2. **Sem leak de classes** — não precisa cleanup de classList
3. **Tema-aware** — dark mode usa `brightness()`, light mode usa `grayscale()`
4. **Integrado com a câmera** — isolamento visual acompanha a animação de viewBox

---

## 5. Transições

Todos os primitivos SVG (`path`, `rect`, `polygon`, `circle`, `ellipse`, `line`, `polyline`,
`text`, `g`) têm `transition: filter 0.4s ease-in-out`. Isso garante:

- Fade suave ao entrar no modo exploração (não é um corte abrupto)
- A zona ativa "acende" gradualmente
- O alvo ganha o glow progressivamente

---

## 6. Arquivos Envolvidos

| Arquivo                                                        | Responsabilidade                                        |
| -------------------------------------------------------------- | ------------------------------------------------------- |
| `frontend/src/app/globals.css`                                 | Regras CSS de transition (fallback, transições de base) |
| `frontend/src/components/.../navigator/hooks/useNavigator.ts`  | Isolamento visual GSAP nos drill-down (UNFOCUSED_FILTER)|
| `frontend/src/components/.../navigator/hooks/useHoverEffects.ts`| Isolamento visual GSAP no hover                        |
| `frontend/src/components/.../navigator/consts.ts`              | FOCUSED_FILTER, UNFOCUSED_FILTER (dark/light)           |
| `frontend/src/components/.../navigator/useSvgNavigatorLogic.ts`| Orquestrador: compõe os hooks acima                     |
| `frontend/src/app/view/[id]/page.tsx`                          | Conecta orquestrador ao ProcessogramViewer              |

---

## 7. Testes Manuais

### Cenário 1: Primeiro clique (nível 0 → drill-down para ps)
- [ ] viewBox anima suavemente para enquadrar o `<g>` clicado
- [ ] Irmãos do elemento clicado escurecem via GSAP filter
- [ ] O elemento alvo e seus filhos do próximo nível ficam com brilho total

### Cenário 2: Drill-down para nível 2
- [ ] viewBox anima para enquadrar o `<g>` de nível 2
- [ ] Irmãos fora de foco escurecem (UNFOCUSED_FILTER)
- [ ] Filhos do próximo nível ficam com brilho total (FOCUSED_FILTER)

### Cenário 3: Hover sobre grupo semântico
- [ ] Grupo sob o cursor ganha brilho total (FOCUSED_FILTER)
- [ ] Irmãos do mesmo nível escurecem (UNFOCUSED_FILTER)
- [ ] Ao mover o cursor para fora: restaura estado padrão do nível

### Cenário 4: Drill-up (clique no vazio)
- [ ] viewBox anima de volta para o nível anterior (historyLevel)
- [ ] Isolamento visual restaurado para o nível anterior
- [ ] Se no root e clicar no vazio: onClose() limpa tudo

### Cenário 5: Preservação de cores (dark mode)
- [ ] Um elemento rosa escurece para rosa-escuro (não cinza)
- [ ] Um elemento verde escurece para verde-escuro (não cinza)
- [ ] Nenhum `fill` ou `stroke` foi alterado no inspetor do DevTools
