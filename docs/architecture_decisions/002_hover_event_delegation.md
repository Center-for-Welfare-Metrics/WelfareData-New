# ADR-002: Hover via Event Delegation Nativa (Otimização Nível 1)

**Status:** Aceito  
**Data:** 05/03/2026  
**Autores:** WFI Engineering Team

---

## Contexto

O motor de hover do SVG Navigator rastreava o elemento sob o cursor através de um `useState` React (`onHover: string | null`) no orquestrador `useSvgNavigatorLogic`. A cada pixel percorrido pelo rato, o fluxo era:

```
mousemove (React synthetic event)
  → setOnHover(novoId)          ← agendava re-render
    → React reconcilia vDOM     ← trabalho desnecessário (até 60×/s)
      → useEffect([onHover])    ← detectava mudança de state
        → GSAP animava          ← só aqui ocorria o efeito desejado
```

Este ciclo forçava potencialmente 60 re-renders por segundo do componente `page.tsx` — que contém breadcrumb, SidePanel e ProcessogramViewer — mesmo que o único efeito observável fosse uma animação GSAP no DOM. O resultado era **lag perceptível** no hover, especialmente em SVGs com muitos nós.

---

## Decisão

Migrar o motor de hover de **state React reactivo** para **Event Delegation nativa com manipulação directa de DOM via GSAP**.

### Implementação

`useHoverEffects` passou a gerir os seus próprios listeners DOM:

```typescript
useEffect(() => {
  if (!svgElement) return;
  const svg = svgElement;

  svg.addEventListener("mousemove", handleMouseMove);
  svg.addEventListener("mouseleave", handleMouseLeave);

  return () => {
    svg.removeEventListener("mousemove", handleMouseMove);
    svg.removeEventListener("mouseleave", handleMouseLeave);
  };
}, [svgElement]); // Registados uma única vez por SVG
```

O estado do hover é rastreado por uma `useRef` interna:

```typescript
const hoveredElementId = useRef<string | null>(null);
```

Optimizações adicionais dentro do handler de `mousemove`:

| Guard | Propósito |
|---|---|
| `if (lockInteraction.current) return` | Aborta durante animações de câmara |
| `if (!nextLevelKey) return` | Ignora nível folha (sem sub-grupos) |
| `if (group.id === hoveredElementId.current) return` | Evita spam de GSAP no mesmo pixel |

O tema visual é lido via `themeRef` (ref sincronizada com `currentTheme` via `useEffect`), evitando que mudanças de tema forcem o re-registo dos listeners.

### Ficheiros Alterados

| Ficheiro | Mudança |
|---|---|
| `navigator/hooks/useHoverEffects.ts` | Refatoração completa: Event Delegation + `useRef` interno |
| `navigator/useSvgNavigatorLogic.ts` | Removidos `onHover` (useState), `onMouseMove`, `onMouseLeave` |
| `navigator/hooks/useClickHandler.ts` | Removido `setOnHover` das props (substituído pelo lock) |
| `ProcessogramViewer.tsx` | Removidos `onMouseMove` e `onMouseLeave` das props |
| `app/view/[id]/page.tsx` | Removidos `onMouseMove` e `onMouseLeave` do destructuring e JSX |

---

## Consequências

### Positivas

- **Zero re-renders React** durante o movimento do rato — a reconciliação do React nunca é activada por hover
- **60 FPS garantidos**: o caminho crítico é `mousemove → lógica JS pura → GSAP → DOM`, sem overhead de framework
- **Guard de deduplicação**: o mesmo pixel não dispara múltiplas animações GSAP
- **Isolamento de preocupações**: `useHoverEffects` é completamente auto-suficiente; não expõe nem consome state externo
- **Superfície de API reduzida**: `ProcessogramViewer` e `page.tsx` ficaram mais simples

### Negativas / Trade-offs

- O `useEffect` de registo tem `eslint-disable-line react-hooks/exhaustive-deps` (supressão intencional e documentada): `lockInteraction`, `currentLevelRef` e `currentElementIdRef` são refs estáveis — listá-las nas deps criaria re-registos desnecessários sem benefício
- `themeRef` adiciona um nível de indirección para acesso ao tema; o custo é negligenciável

---

## Alternativas Consideradas

### Manter `useState` com `throttle`/`debounce`

Limitaria a frequência de `setOnHover`, reduzindo re-renders mas não eliminando-os. A latência perceptível permaneceria e o comportamento ficaria menos determinístico.

### `useDeferredValue` do React 18

Adiaria a renderização do estado de hover para frames de baixa prioridade. Resolveria parcialmente o lag mas manteria o custo de reconciliação e introduziria comportamento assíncrono difícil de depurar.

### Manter a arquitectura actual sem alterações

Aceitável para SVGs pequenos, mas não escala para processogramas com dezenas de grupos semânticos e animações CSS concorrentes.
