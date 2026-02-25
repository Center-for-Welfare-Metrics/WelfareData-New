# GSAP ViewBox Camera Engine

> Documentação da transição do motor de câmera de `react-zoom-pan-pinch` para
> animação nativa de `viewBox` via GSAP, baseada na engenharia reversa do sistema legado.

---

## 1. Por que trocar o motor de câmera?

### Problema com `react-zoom-pan-pinch`

| Aspecto              | react-zoom-pan-pinch                        | GSAP viewBox                              |
| -------------------- | ------------------------------------------- | ----------------------------------------- |
| **Mecanismo**        | `transform: scale() translate()` no wrapper | Altera `viewBox` do `<svg>` diretamente   |
| **Renderização**     | Rasteriza e escala pixels → desfoque        | SVG re-renderiza vetores nativos → nítido  |
| **Centralização**    | Depende de BBox do DOM + scroll container   | Matemática pura no espaço SVG             |
| **Enquadramento**    | Escala aproximada, offset frequente         | viewBox = recorte exato, sem offset       |
| **Reset**            | `resetTransform()` / `centerView()` — catapulta | `gsap.to(viewBox original)` — suave  |
| **Bundle size**      | ~45KB minified                              | gsap core ~25KB (já compartilhado)        |

### Decisão

O SVG deve ser o motor de câmera. Ao animar `viewBox`, o browser recalcula os vetores
nativamente a cada frame. Isso elimina:
- Desfoque em zoom alto (pois não há rasterização)
- Bugs de centralização (não depende de getBoundingClientRect)
- O efeito "catapulta" do resetTransform

---

## 2. Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│                   ProcessogramViewer                     │
│                                                          │
│  ┌──────────────────────┐  ┌──────────────────────────┐ │
│  │   useViewBoxCamera   │  │     useSvgPanZoom        │ │
│  │                      │  │                          │ │
│  │  originalViewBoxRef  │  │  Wheel → zoom centrado   │ │
│  │  currentViewBoxRef ◄─┼──┤  Pointer → pan (drag)    │ │
│  │  tweenRef            │  │                          │ │
│  │                      │  │  Lê/escreve direto no    │ │
│  │  captureOriginal()   │  │  currentViewBoxRef       │ │
│  │  animateTo(vb)       │  │                          │ │
│  │  zoomToTarget(id)    │  └──────────────────────────┘ │
│  │  zoomIn/Out()        │                                │
│  │  resetView()         │  ┌──────────────────────────┐ │
│  │  fitToScreen()       │  │  useEffect(zoomTargetId) │ │
│  └──────────────────────┘  │  ← do useProcessogramState│ │
│                             │  Dispara zoomToTarget()  │ │
│                             └──────────────────────────┘ │
│                                                          │
│  <div.processogram-svg-container>                        │
│    <svg viewBox="..." preserveAspectRatio="xMidYMid">   │
│  </div>                                                  │
│                                                          │
│  <HUD: ZoomIn, ZoomOut, Reset, Fit>                      │
└─────────────────────────────────────────────────────────┘
```

### Fluxo de dados unidirecional

```
useProcessogramState.zoomTargetId (token: zoom__id__level__ts)
  → useEffect no ProcessogramViewer
    → extractRealId(token) → "id"
    → zoomToTarget("id")
      → getBBox() do elemento SVG
      → computeTargetViewBox() → { x, y, w, h } com padding
      → gsap.to(proxy, { x, y, w, h, onUpdate: svg.setAttribute('viewBox') })
        → animação fluida frame-a-frame
```

---

## 3. Matemática do Bounding Box

### `computeTargetViewBox(element)`

```
1. bbox = element.getBBox()
   → { x, y, width, height } em unidades SVG nativas

2. Padding Adaptativo:
   padX = max(bbox.width × 0.20, 30)      // 20% ou mínimo 30 units
   padY = max(bbox.height × 0.20, 30)     // 20% ou mínimo 30 units

3. ViewBox bruto:
   x = bbox.x - padX
   y = bbox.y - padY
   w = bbox.width + padX × 2
   h = bbox.height + padY × 2

4. Clamp para MIN_VIEWBOX_DIM (120):
   Se w < 120 → w = 120, re-centraliza x
   Se h < 120 → h = 120, re-centraliza y
```

### Visualização do padding

```
┌───────────────── viewBox (w × h) ─────────────────┐
│                    padY                             │
│     ┌────────── bbox ──────────┐                   │
│ padX│                          │padX               │
│     │      Elemento SVG        │                   │
│     │                          │                   │
│     └──────────────────────────┘                   │
│                    padY                             │
└─────────────────────────────────────────────────────┘
```

### Por que padding adaptativo?

| Caso                     | bbox ~size | padding        | viewBox       |
| ------------------------ | ---------- | -------------- | ------------- |
| Production System (ps)   | 1600×900   | 320×180 (20%)  | 2240×1260     |
| Life-Fate (lf)           | 400×300    | 80×60 (20%)    | 560×420       |
| Phase (ph)               | 100×80     | 30×30 (mín.)   | 160×140       |
| Circumstance (ci) pequena| 20×15      | 30×30 (mín.)   | 120×120 (clamp)|

Sem o mínimo absoluto, um elemento microscópico faria zoom extremo (viewBox de 24×18),
mostrando apenas pixels. O `MIN_VIEWBOX_DIM = 120` garante contexto visual sempre.

---

## 4. Interação do Usuário (Pan + Scroll)

### `useSvgPanZoom` — Sem bibliotecas externas

O pan e zoom são implementados com event listeners nativos:

#### Scroll Zoom (centrado no cursor)

```
handleWheel(e):
  1. normX = (cursor.x - svgRect.left) / svgRect.width   // 0..1
  2. normY = (cursor.y - svgRect.top) / svgRect.height    // 0..1
  3. factor = deltaY > 0 ? 1.1 : 0.9                      // zoom out / in
  4. newW = vb.w × factor
  5. newH = vb.h × factor
  6. newX = vb.x + (vb.w - newW) × normX   // mantém cursor "fixo"
  7. newY = vb.y + (vb.h - newH) × normY
  8. svg.viewBox = "newX newY newW newH"
```

A fórmula `vb.x + (vb.w - newW) × normX` garante que o ponto sob o cursor
permanece estável durante o zoom — o mesmo comportamento do Google Maps.

#### Pan (drag)

```
handlePointerMove(e):
  1. scaleX = vb.w / svgRect.width    // pixels → unidades SVG
  2. scaleY = vb.h / svgRect.height
  3. dx = (startX - e.clientX) × scaleX
  4. dy = (startY - e.clientY) × scaleY
  5. vb.x += dx, vb.y += dy
  6. svg.viewBox = atualizado
```

Isso converte pixels de movimento do mouse em deslocamento proporcional
no espaço de coordenadas do SVG.

---

## 5. Integração com GSAP

### Proxy Object Pattern

GSAP não pode animar `viewBox` diretamente (é uma string). A solução:

```ts
const proxy = { x, y, w, h };   // objeto com valores numéricos atuais

gsap.to(proxy, {
  x: target.x, y: target.y, w: target.w, h: target.h,
  duration: 0.8,
  ease: "power3.inOut",
  onUpdate: () => {
    svg.setAttribute("viewBox", `${proxy.x} ${proxy.y} ${proxy.w} ${proxy.h}`);
  }
});
```

GSAP interpola os 4 valores numéricos. A cada frame, `onUpdate` reconstrói
a string do viewBox e a aplica no SVG — o browser re-renderiza os vetores.

### Easing: `power3.inOut`

```
     ╭──────────╮
    ╱            ╲     ← Desaceleração suave
   ╱              ╲
──╱                ╲── ← Aceleração suave
```

Início lento → velocidade máxima no meio → desaceleração suave.
Sensação natural de "câmera cinematográfica", sem cortes abruptos.

---

## 6. Zoom Token

O `zoomTargetId` vem do `useProcessogramState` no formato:

```
zoom__<realId>__<levelIndex>__<timestamp>
```

Exemplo: `zoom__fase--ph_03__2__1740412800000`

- `realId`: ID do elemento SVG (`fase--ph_03`)
- `levelIndex`: nível na hierarquia Matrioska (2 = phase)
- `timestamp`: `Date.now()` — garante unicidade

A função `extractRealId()` extrai apenas o `realId` para uso em
`querySelector` e `getBBox`. O timestamp garante que o `useEffect`
dispare mesmo quando o mesmo elemento é o alvo em diferentes níveis.

---

## 7. Arquivos Envolvidos

| Arquivo                                        | Responsabilidade                                    |
| ---------------------------------------------- | --------------------------------------------------- |
| `ProcessogramViewer.tsx`                        | Motor de câmera GSAP + Pan/Zoom + HUD               |
| `useProcessogramState.ts`                      | Gera `zoomTargetId` (token) baseado na navegação    |
| `ProcessogramInteractiveLayer.tsx`             | Captura cliques + Visual Isolation (não toca câmera) |
| `globals.css`                                  | Transições CSS de brightness (não toca viewBox)      |

---

## 8. Migração (Changelog)

### Removido
- `react-zoom-pan-pinch` do `package.json`
- `<TransformWrapper>`, `<TransformComponent>`, `useControls()`
- Componente `CameraController` (renderless)
- `computeDynamicScale()` (calculava scale para transform)

### Adicionado
- `gsap` no `package.json`
- Hook `useViewBoxCamera` — motor de animação viewBox
- Hook `useSvgPanZoom` — pan e scroll zoom nativos
- `computeTargetViewBox()` — BBox + padding adaptativo → viewBox string
- `parseViewBox()` / `viewBoxToString()` — conversores
- `extractRealId()` — extrai ID real do zoom token
- `preserveAspectRatio="xMidYMid meet"` no SVG
- SVG renderizado diretamente (sem wrapper de transformação)
- `data-hud` attr nos botões para evitar que pan capture cliques neles

---

## 9. Testes Manuais

### Cenário 1: Zoom programático (drill-down)
- [ ] Clique em elemento → câmera enquadra com padding de 20%
- [ ] Elemento pequeno → viewBox ≥ 120×120 (não zoom excessivo)
- [ ] Transição suave com easing power3.inOut (~0.8s)
- [ ] Cores e vetores permanecem nítidos em qualquer zoom

### Cenário 2: Reset
- [ ] clearSelection() → câmera volta ao viewBox original
- [ ] Transição suave, sem "catapulta" para fora da tela

### Cenário 3: Pan + Scroll
- [ ] Scroll zoom centrado no cursor (ponto sob cursor fica fixo)
- [ ] Drag pan proporcional ao nível de zoom atual
- [ ] Botões do HUD não acionam pan

### Cenário 4: HUD
- [ ] Zoom In → viewBox diminui 25% (aproxima)
- [ ] Zoom Out → viewBox aumenta 25% (afasta)
- [ ] Reset → volta ao viewBox original
- [ ] Fit → ajusta ao bbox total do conteúdo SVG
