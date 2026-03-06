# ADR-003: Blindagem de Eventos DOM durante Animações GSAP (Otimização Nível 1 — Parte B)

**Status:** Aceito  
**Data:** 05/03/2026  
**Autores:** WFI Engineering Team

---

## Contexto

Durante as transições de `viewBox` (drill-down / drill-up / reset), o browser continuava a processar eventos de rato no sub-tree SVG enquanto o GSAP animava a câmara. Três problemas concretos:

1. **Gap de lock**: `lockInteractionRef.current = true` era aplicado **depois** do `gsap.to(outOfFocusElements)`, deixando uma janela onde cliques ou hovers podiam ser registados durante o arranque da animação.

2. **Sem `pointerEvents: "none"` imperativo**: o bloqueio de eventos DOM era feito via GSAP `fromTo` (`from: { pointerEvents: "none" }`), o que apenas entrava em vigor no início do tween de viewBox — demasiado tarde para cobrir o `outOfFocusAnimation`.

3. **Tweens de hover residuais**: se o utilizador estava com o cursor sobre um grupo no momento do clique, o GSAP tinha tweens de `filter` activos nesses elementos. Esses tweens corriam em paralelo com o `outOfFocusAnimation` e o `viewBox`, fragmentando os recursos do scheduler do GSAP.

O mesmo gap existia no caminho RESET TOTAL de `navigateToLevel` em `useSvgNavigatorLogic.ts`.

---

## Decisão

Aplicar uma **blindagem tripla imperativa** como primeira instrução executável de qualquer transição de câmara, antes de qualquer tween GSAP:

```typescript
// 1. Bloqueia o handler de mousemove (useHoverEffects aborta na linha 1)
lockInteractionRef.current = true;

// 2. Para imediatamente o processamento de eventos no sub-tree SVG inteiro
svgElement.style.pointerEvents = "none";

// 3. Mata tweens de hover residuais — GSAP foca 100% no viewBox
gsap.killTweensOf(svgElement.querySelectorAll('[id*="--"]'));
```

A restauração permanece no `onComplete` existente via `gsap.set(svgElement, { pointerEvents: "auto" })`.

### Ficheiros Alterados

| Ficheiro | Mudança |
|---|---|
| `navigator/hooks/useNavigator.ts` | Blindagem movida para antes de `outOfFocusAnimation`; `gsap.fromTo` simplificado para `gsap.to` (from state era redundante); secções renumeradas |
| `navigator/useSvgNavigatorLogic.ts` | Mesma blindagem aplicada no caminho RESET TOTAL de `navigateToLevel` |

---

## Consequências

### Positivas

- **Cobertura total**: lock + `pointerEvents: "none"` entram em vigor antes do primeiro tween, cobrindo o `outOfFocusAnimation` e a animação de viewBox
- **CPU poupada durante zoom**: o browser não calcula CSS `:hover` nem propaga eventos no sub-tree SVG inteiro durante toda a duração da transição
- **GSAP scheduler limpo**: `killTweensOf` garante que o frame budget do GSAP não é partilhado com tweens de hover obsoletos
- **Sincronização com Part A**: o `lockInteraction.current = true` coopera directamente com o guard da primeira linha do handler de `mousemove` em `useHoverEffects` (ADR-002)

### Negativas / Trade-offs

- `gsap.killTweensOf(querySelectorAll('[id*="--"]'))` faz uma query DOM no início de cada transição. O custo é negligenciável (única chamada síncrona, não por frame), mas em SVGs com centenas de grupos pode ser optimizado com cache se necessário

---

## Relação com ADR-002

ADR-002 (Hover Event Delegation) e este ADR são complementares e formam o **Nível 1 de Otimização**:

| ADR | Problema | Solução |
|---|---|---|
| ADR-002 | React re-renders durante hover (~60×/s) | Event Delegation nativa; `useRef` em vez de `useState` |
| ADR-003 | Eventos DOM activos durante animações de câmara | `pointerEvents: "none"` + `killTweensOf` antes de qualquer tween |

Juntos garantem que **em nenhum momento** o motor de hover e o motor de câmara competem por recursos — quer ao nível do React, quer ao nível do browser, quer ao nível do scheduler do GSAP.
