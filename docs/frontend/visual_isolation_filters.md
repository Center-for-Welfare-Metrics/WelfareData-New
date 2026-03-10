# Visual Isolation System — Opacity-Based Focus & Mute

> Documentação da decisão arquitetural de isolamento visual no ProcessogramViewer.
> Migrado de `filter: brightness()/grayscale()` para `opacity` por performance GPU.

---

## 1. Decisão Arquitetural

### Por que `opacity` e não `filter: brightness()` ou `fill`?

| Abordagem         | Efeito Visual                                           | Problema                                                      |
| ------------------ | ------------------------------------------------------- | ------------------------------------------------------------- |
| `filter: brightness(0.3)` | Cor original mantida, apenas escurecida          | Força re-rasterização GPU por elemento a cada frame; lag severo em SVGs complexos |
| `fill: #333`      | Cor sólida substitui a original                         | Destrói o mapa biológico — porco rosa vira cinza              |
| **`opacity: 0.15`** | **Elemento fica quase invisível, composição GPU pura** | **Zero re-rasterização — performance ótima em SVGs com 1200+ nós** |

O sistema anterior usava `filter: brightness()` / `filter: grayscale()` que, apesar de preservar
matizes, forçava o browser a criar camadas GPU individuais por elemento e re-rasterizar vetores
a cada frame de animação GSAP. Com 1200+ elementos, isso gerava ~50.400 repaints por transição.

`opacity` é uma propriedade de **composição pura na GPU** — o browser apenas ajusta o alpha
channel na composição final, sem re-rasterização.

### Regra Fundamental

> **NUNCA** altere `fill`, `stroke` ou `filter` dos elementos SVG para fins de isolamento visual.
> Use **exclusivamente** `opacity` via GSAP.

---

## 2. Mecanismo de Isolamento (GSAP Opacity)

> **Nota:** O sistema anterior usava classes CSS (`.is-exploring`, `.is-active-zone`,
> `.is-target-element`). Esse mecanismo foi **removido** e substituído por animação
> direta de `opacity` via GSAP no módulo `navigator/`.

O isolamento visual agora é aplicado **diretamente via GSAP** — sem classes CSS intermediárias:

### Drill-down (`useNavigator.changeLevelTo`)

- **Irmãos fora de foco:** `gsap.set(siblings, { opacity: UNFOCUSED_OPACITY })`
  - Dark mode: `0.15` — quase invisível
  - Light mode: `0.2` — levemente visível
- **Elemento enquadrado + filhos:** `gsap.to(focused, { opacity: FOCUSED_OPACITY })`
  - Ambos os temas: `1` — visibilidade total

### Hover (`useHoverEffects`)

- **Elemento sob o cursor:** FOCUSED_OPACITY (visibilidade total)
- **Irmãos do mesmo nível:** UNFOCUSED_OPACITY (reduzidos)
- **Mouse saiu:** restaura estado padrão do nível atual da câmera

### Constantes (`navigator/consts.ts`)

```ts
export const FOCUSED_OPACITY = {
  dark:  1,
  light: 1,
} as const;

export const UNFOCUSED_OPACITY = {
  dark:  0.15,
  light: 0.2,
} as const;
```

---

## 3. Cascata de Isolamento Visual

O GSAP aplica filter diretamente nos elementos SVG. A prioridade é determinada
pela ordem de execução, não por especificidade CSS:

```
                         ┌─────────────────────────────────────┐
1. changeLevelTo()       │  Irmãos → UNFOCUSED_OPACITY          │
                         │  Alvo   → FOCUSED_OPACITY            │
                         └────────────┬────────────────────────┘
                                      │
                         ┌────────────▼────────────────────────┐
2. setFullBrightness()   │  Filhos do próximo nível            │
                         │  → FOCUSED_OPACITY (drill-down ready)│
                         └────────────┬────────────────────────┘
                                      │
                         ┌────────────▼────────────────────────┐
3. useHoverEffects       │  Hovered → FOCUSED_OPACITY           │
                         │  Siblings → UNFOCUSED_OPACITY        │
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

O sistema atual usa **GSAP** para animar `opacity`
diretamente nos elementos SVG, sem classes CSS intermediárias:

```
Drill-down (useNavigator.changeLevelTo):
  1. Calcula viewBox destino (getElementViewBox com swap síncrono do viewBox original)
  2. Seleciona irmãos fora de foco (seletores CSS com flag `i` — case-insensitive)
  3. gsap.set(irmãos, { opacity: UNFOCUSED_OPACITY })
  4. gsap.fromTo(svg, { viewBox: atual }, { viewBox: destino })
  5. onComplete → setFullBrightnessToCurrentLevel()

Hover (useHoverEffects):
  1. onHover = id → gsap.to(hovered, { opacity: FOCUSED_OPACITY })
                   → gsap.to(siblings, { opacity: UNFOCUSED_OPACITY })
  2. onHover = null → restaura estado padrão do nível atual
```

### Vantagens sobre o sistema de classes CSS

1. **Transições animadas com easing** — GSAP interpola opacity frame a frame (composição GPU)
2. **Sem leak de classes** — não precisa cleanup de classList
3. **Tema-aware** — dark mode usa `0.15`, light mode usa `0.2`
4. **Integrado com a câmera** — isolamento visual acompanha a animação de viewBox
5. **Zero re-rasterização** — `opacity` é composição pura na GPU

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
| `frontend/src/components/.../navigator/hooks/useNavigator.ts`  | Isolamento visual GSAP nos drill-down (UNFOCUSED_OPACITY)|
| `frontend/src/components/.../navigator/hooks/useHoverEffects.ts`| Isolamento visual GSAP no hover                        |
| `frontend/src/components/.../navigator/consts.ts`              | FOCUSED_OPACITY, UNFOCUSED_OPACITY (dark/light)         |
| `frontend/src/components/.../navigator/useSvgNavigatorLogic.ts`| Orquestrador: compõe os hooks acima + `originalViewBoxRef` |
| `frontend/src/components/.../navigator/getElementViewBox.ts`   | Cálculo de viewBox com swap síncrono para estabilizar CTM |
| `frontend/src/app/view/[id]/page.tsx`                          | Conecta orquestrador ao ProcessogramViewer              |

> **Nota:** Todos os seletores CSS (`querySelector`, `closest`) usam a flag `i` (case-insensitive) para compatibilidade com IDs UPPERCASE do SVG (ex: `GROWING--PH-1`).

---

## 7. Testes Manuais

### Cenário 1: Primeiro clique (nível 0 → drill-down para ps)
- [ ] viewBox anima suavemente para enquadrar o `<g>` clicado
- [ ] Irmãos do elemento clicado escurecem via GSAP filter
- [ ] O elemento alvo e seus filhos do próximo nível ficam com brilho total

### Cenário 2: Drill-down para nível 2
- [ ] viewBox anima para enquadrar o `<g>` de nível 2
- [ ] Irmãos fora de foco ficam reduzidos (UNFOCUSED_OPACITY)
- [ ] Filhos do próximo nível ficam com visibilidade total (FOCUSED_OPACITY)

### Cenário 3: Hover sobre grupo semântico
- [ ] Grupo sob o cursor ganha visibilidade total (FOCUSED_OPACITY)
- [ ] Irmãos do mesmo nível ficam reduzidos (UNFOCUSED_OPACITY)
- [ ] Ao mover o cursor para fora: restaura estado padrão do nível

### Cenário 4: Drill-up (clique no vazio)
- [ ] viewBox anima de volta para o nível anterior (historyLevel)
- [ ] Isolamento visual restaurado para o nível anterior
- [ ] Se no root e clicar no vazio: onClose() limpa tudo

### Cenário 5: Preservação de cores (dark mode)
- [ ] Um elemento rosa fica com opacity reduzida (não cinza)
- [ ] Um elemento verde fica com opacity reduzida (não cinza)
- [ ] Nenhum `fill` ou `stroke` foi alterado no inspetor do DevTools
