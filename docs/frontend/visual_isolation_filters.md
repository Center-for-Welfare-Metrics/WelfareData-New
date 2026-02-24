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

## 2. Classes CSS

Três classes CSS controlam o sistema de isolamento. São aplicadas **dinamicamente via JavaScript**
no DOM do SVG — nunca hardcoded no markup.

### `.is-exploring`

- **Aplicada em:** Tag `<svg>` raiz dentro de `.processogram-svg-container`
- **Condição:** `activeLevelIndex >= 0 && breadcrumbPath.length > 0` (o usuário fez drill-down)
- **Efeito:** Todos os filhos SVG recebem `brightness(0.3)` — o "mute geral"

### `.is-active-zone`

- **Aplicada em:** O nó `<g>` (ou elemento) do nível ativo no breadcrumb
- **Condição:** `breadcrumbPath[activeLevelIndex]` existe e o nó DOM correspondente foi encontrado
- **Efeito:** Restaura `brightness(1) !important` para si e todos os seus filhos — a "zona iluminada"

### `.is-target-element`

- **Aplicada em:** O nó do elemento selecionado (`selectedElementId`)
- **Condição:** `selectedElementId` não é nulo e o nó DOM correspondente foi encontrado
- **Efeito:** `brightness(1) + drop-shadow(0 0 8px rgba(255, 255, 255, 0.4)) !important` — glow de destaque

---

## 3. Cascata CSS no DOM do SVG

A interação entre as classes segue a cascata CSS com especificidade crescente:

```
                         ┌─────────────────────────────────────┐
Nível 1: Mute Geral     │  svg.is-exploring * { b(0.3) }      │
                         └────────────┬────────────────────────┘
                                      │ ← !important override
                         ┌────────────▼────────────────────────┐
Nível 2: Zona Ativa     │  .is-active-zone * { b(1) !imp }    │
                         └────────────┬────────────────────────┘
                                      │ ← !important + higher specificity
                         ┌────────────▼────────────────────────┐
Nível 3: Alvo Focado    │  .is-target-element { b(1)+glow }   │
                         └─────────────────────────────────────┘
```

### Exemplo no DOM

```xml
<svg class="is-exploring">                    ← brightness(0.3) em tudo
  <g id="sistema--ps">                        ← escurecido
    <g id="destino--lf" class="is-active-zone"> ← brightness(1), iluminado
      <g id="fase--ph">                        ← herda brightness(1) do pai
        <rect id="circ--ci_01" class="is-target-element"/>  ← glow
        <rect id="circ--ci_02"/>               ← brightness(1), sem glow
      </g>
    </g>
    <g id="destino--lf_2">                    ← escurecido (fora da zona ativa)
      <rect id="circ--ci_03"/>                ← escurecido
    </g>
  </g>
</svg>
```

---

## 4. Lógica de Aplicação Dinâmica

O `useEffect` em `ProcessogramInteractiveLayer.tsx` gerencia as classes em 4 passos:

```
useEffect([activeLevelIndex, breadcrumbPath, selectedElementId])

  Passo 1 — RESET
  │  Remover .is-exploring do <svg>
  │  Remover .is-active-zone de todos os nós
  │  Remover .is-target-element de todos os nós
  │
  Passo 2 — BLACKOUT
  │  if (activeLevelIndex >= 0 && breadcrumbPath.length > 0)
  │    → Adicionar .is-exploring no <svg>
  │
  Passo 3 — ACENDER ZONA
  │  Buscar breadcrumbPath[activeLevelIndex].id no DOM
  │    → Adicionar .is-active-zone nesse nó
  │
  Passo 4 — DESTACAR ALVO
  │  if (selectedElementId !== null)
  │    Buscar selectedElementId no DOM
  │      → Adicionar .is-target-element nesse nó
```

### Por que manipulação direta do DOM?

O SVG é injetado via `dangerouslySetInnerHTML` (conteúdo vindo do backend). React não tem
referências para os nós internos do SVG. Portanto, usamos `querySelector` para encontrar
os elementos e `classList.add/remove` para aplicar as classes. Isso é seguro porque:

1. O `useEffect` faz reset completo a cada mudança de estado
2. O cleanup remove todas as classes ao desmontar
3. As classes são puramente visuais (não afetam estado React)

---

## 5. Transições

Todos os primitivos SVG (`path`, `rect`, `polygon`, `circle`, `ellipse`, `line`, `polyline`,
`text`, `g`) têm `transition: filter 0.4s ease-in-out`. Isso garante:

- Fade suave ao entrar no modo exploração (não é um corte abrupto)
- A zona ativa "acende" gradualmente
- O alvo ganha o glow progressivamente

---

## 6. Arquivos Envolvidos

| Arquivo                                          | Responsabilidade                                    |
| ------------------------------------------------ | --------------------------------------------------- |
| `frontend/src/app/globals.css`                   | Regras CSS de isolamento (brightness/transition)    |
| `frontend/src/components/.../InteractiveLayer.tsx` | useEffect que aplica/remove classes no DOM do SVG |
| `frontend/src/hooks/useProcessogramState.ts`     | Estado de navegação (activeLevelIndex, breadcrumb)  |
| `frontend/src/app/view/[id]/page.tsx`            | Passa props de estado para InteractiveLayer         |

---

## 7. Testes Manuais

### Cenário 1: Primeiro clique (nível 0)
- [ ] SVG recebe classe `.is-exploring`
- [ ] Todos os elementos escurecem (brightness 0.3)
- [ ] O grupo `<g>` do nível 0 fica iluminado (`.is-active-zone`)
- [ ] O elemento selecionado tem glow (`.is-target-element`)

### Cenário 2: Drill-down para nível 2
- [ ] Zona ativa muda para o `<g>` do nível 2
- [ ] Nível 0 e nível 1 ficam escurecidos
- [ ] Apenas o nível 2 e seus filhos estão iluminados

### Cenário 3: Reset (clearSelection)
- [ ] `.is-exploring` removido do `<svg>`
- [ ] Todas as classes `.is-active-zone` e `.is-target-element` removidas
- [ ] Todos os elementos voltam a brightness(1) com transição suave

### Cenário 4: Preservação de cores
- [ ] Um elemento rosa escurece para rosa-escuro (não cinza)
- [ ] Um elemento verde escurece para verde-escuro (não cinza)
- [ ] Nenhum `fill` ou `stroke` foi alterado no inspetor do DevTools
