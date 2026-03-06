# ADR-004: Motor de Rasterização Dinâmica (Otimização Nível 2)

**Status:** Aceito  
**Data:** 05/03/2026  
**Autores:** WFI Engineering Team

---

## Contexto

Durante animações de zoom (drill-down / drill-up), o GSAP anima o `viewBox` do `<svg>` a cada frame. O browser, por sua vez, é obrigado a recalcular o layout e rasterizar todos os nós vectoriais visíveis — potencialmente milhares de `<path>`, `<text>` e `<g>` — mesmo aqueles que estão escurecidos (`brightness: 0.3`) e portanto irrelevantes visualmente.

Este é o principal bottleneck de GPU em processogramas complexos: a placa de vídeo não distingue entre "este grupo está visível" e "este grupo está a 30% de brilho". Recalcula tudo.

---

## Decisão

Implementar o `useOptimizeSvgParts` — um hook que converte os grupos SVG fora de foco em imagens bitmap (`<image>` PNG) imediatamente antes de o GSAP iniciar a animação de viewBox. O browser passa a rasterizar 1 PNG por grupo em vez de N mil nós vectoriais.

### Princípio

```
Antes:  GSAP anima viewBox → browser recalcula 10.000 nós vectoriais/frame
Depois: GSAP anima viewBox → browser recalcula 5 imagens PNG/frame
```

O efeito visual é **idêntico** — os grupos estão sempre escurecidos durante a animação.

### Fluxo por Transição

```
changeLevelTo(target)
  │
  ├─ 0. restoreAllRasterized()          ← DOM limpo (sync)
  ├─ 3. Blindagem DOM                   ← lock + pointerEvents: none
  ├─ 4. outOfFocusAnimation (GSAP)      ← aplica brightness(0.3) nos <g>
  ├─ 5. onChange(identifier, hierarchy) ← notifica UI
  ├─ 5.5 optimizeLevelElements(target, outOfFocusElements)
  │       ├─ restoreElement(target)     ← garante target 100% vectorial (sync)
  │       └─ setTimeout(0):
  │             rasterizeElement(sibling1)  ─┐
  │             rasterizeElement(sibling2)   │ async: Blob → Image → Canvas → PNG
  │             rasterizeElement(sibling3)  ─┘
  │
  └─ 6. gsap.to(svgElement, viewBox)    ← câmara anima (frame limpo)
```

### Cache e Reutilização

```typescript
rasterCache: Map<id, "pending" | base64>
```

- `"pending"` — serialização em curso (Image.onload ainda não disparou)
- `string` — base64 PNG gerado; reutilizado em navegações repetidas para o mesmo elemento sem re-rasterizar

### Segurança contra Race Conditions

| Cenário | Mecanismo |
|---|---|
| `restoreElement` chamado durante `Image.onload` | `delete(id)` do cache → `onload` verifica `get(id) !== "pending"` e aborta |
| Drill-up antes da rasterização terminar | `restoreAllRasterized()` no início de `changeLevelTo` reconstrói o DOM antes de qualquer querySelector |
| Canvas `getContext("2d")` falha | `rasterCache.delete(id)` → permite nova tentativa em navegações futuras |
| Elemento sem ID ou com BBox zero | Guards de entrada: `if (!id) return` / `if (bbox.width === 0) return` |

### Servidor de Recursos SVG

A serialização via `XMLSerializer.serializeToString(element)` captura apenas os atributos DOM inline. Para que gradientes e patterns do `<defs>` do SVG raiz sejam correctamente renderizados no bitmap, o SVG autónomo inclui os `<defs>` do root:

```typescript
const svgString = `<svg xmlns="..." viewBox="..." width="..." height="...">
  ${defsString}  ← <defs> do SVG raiz
  ${gString}     ← o <g> serializado
</svg>`
```

### Troca Atómica no DOM

O `<g>` é ocultado e o `<image>` é inserido no mesmo microtask (dentro de `onload`), eliminando qualquer flicker visual:

```typescript
element.style.display = "none";
element.parentNode?.insertBefore(imageEl, element.nextSibling);
```

### Ficheiros Alterados

| Ficheiro | Mudança |
|---|---|
| `navigator/hooks/useOptimizeSvgParts.ts` | **Criado** — Motor completo de rasterização |
| `navigator/hooks/useNavigator.ts` | Adicionadas props opcionais `restoreAllRasterized?` e `optimizeLevelElements?`; chamadas nas posições 0 e 5.5 de `changeLevelTo` |
| `navigator/useSvgNavigatorLogic.ts` | Instancia `useOptimizeSvgParts` (4a, antes de `useNavigator`); passa funções ao `useNavigator`; chama `restoreAllRasterized` no RESET TOTAL de `navigateToLevel` |

---

## Consequências

### Positivas

- **Salto de FPS durante zoom**: de potencialmente 20-30 FPS (SVGs complexos) para 60 FPS sustentados — o browser só rasteriza pixels, não curvas de Bézier
- **Opacidade zero para o utilizador**: a troca vector→bitmap é invisível; os grupos estão sempre escurecidos durante a animação
- **Cache inteligente**: navegações repetidas para o mesmo contexto não re-rasterizam
- **Degradação graciosa**: as props `restoreAllRasterized?` e `optimizeLevelElements?` são opcionais — o `useNavigator` funciona identicamente sem o optimizador
- **Limpeza garantida**: `restoreAllRasterized` é chamado no início de cada transição, eliminando estados inconsistentes

### Negativas / Trade-offs

- **Latência de ~0-50ms** após o início da animação antes do bitmap aparecer (assíncrono). Na prática imperceptível porque os grupos já estão escurecidos pelo `outOfFocusAnimation` antes do bitmap ser inserido
- **Memória**: bitmaps PNG ficam no cache. Em sessões longas com muita navegação, o cache pode crescer. Mitigação futura: adicionar LRU ou limite de tamanho ao `rasterCache`
- **`<defs>` incluídos**: serializar os `<defs>` do SVG raiz aumenta ligeiramente o tamanho do SVG string. Compensado largamente pelo ganho de performance

---

## Relação com ADR-002 e ADR-003

Os três ADRs formam o **Nível 1 + Nível 2 de Otimização**:

| ADR | Camada | Problema | Solução |
|---|---|---|---|
| ADR-002 | React | 60 re-renders/s durante hover | Event Delegation nativa; `useRef` |
| ADR-003 | Browser / GSAP | Eventos DOM activos durante câmara | `pointerEvents: none` + `killTweensOf` |
| ADR-004 | GPU | Milhares de nós vectoriais/frame durante zoom | Rasterização selectiva `<g>` → `<image>` |
