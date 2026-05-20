# 04 — Selection, Toolbar, Edge Overlays

UI nổi (floating) phục vụ tương tác với node đã chọn: ElementToolbar, EdgeOverlays.

## 1. Selection state

Sống trong `nodeStore.events.selected: string[]`. Array để hỗ trợ multi-select tương lai, hiện single-select.

### Set selection

```js
// nodeStore actions
setSelected(id)    { this.events.selected = id ? [id] : [] }
addSelected(id)    { ... push không duplicate }
removeSelected(id) { ... splice }
clearSelected()    { this.events.selected = [] }
```

### Trigger

| Hành động | Code | Hiệu ứng |
|---|---|---|
| Click element | `onClick` mixin → `setSelected(nodeId)` | Outline + Toolbar + EdgeOverlays |
| Click empty canvas | `RootCanvasV2.onClickRoot` (`@click.self`) → `clearSelected()` | Ẩn tất cả overlay |
| Bắt đầu drag-move | `onMoveDragStart` → `setSelected(nodeId)` | Element được select trước khi drag |
| Click trong Layers panel | `LayerItem.onClick` → `setSelected(nodeId)` | Outline + cuộn canvas tới element (tương lai) |
| Click "+" sibling button trong EdgeOverlays | `addSibling` → `setSelected(newId)` | Element mới được select ngay |

### Visual

CSS global `node.css`:
```css
.wk-node-selected {
  outline: 2px solid #3F8DFF;
  outline-offset: -2px;
}
.wk-flex-block.wk-node-selected.wk-flex-block--drop-active {
  outline: none;     /* tránh outline đôi khi vừa selected vừa drop-active */
}
```

Mỗi element template:
```vue
<div :class="{ 'wk-node-selected': isSelected }">
```

`isSelected` từ `nodeBase` mixin = `events.selected.includes(nodeId)`. Reactive, đổi tức thì.

## 2. ElementToolbar

`src/components/editor_v2/elements/ElementToolbar.vue` — floating toolbar trên element selected. Teleport to body.

### Vị trí

```js
computed: {
  selectedNode() {
    const id = useNodeStore().events.selected[0]
    return id ? useNodeStore().nodes[id] : null
  },
  show() { return !!this.selectedNode },
},
mounted() {
  this._raf = null
  this._updatePosition = () => {
    if (!this.show || !this.selectedNode.dom) return
    const r = this.selectedNode.dom.getBoundingClientRect()
    this.position.top = r.top - 32 + 'px'        // 32px above top
    this.position.left = r.left + 'px'
    this._raf = requestAnimationFrame(this._updatePosition)
  }
  this._updatePosition()
},
beforeUnmount() {
  if (this._raf) cancelAnimationFrame(this._raf)
}
```

rAF loop cập nhật vị trí mỗi frame để toolbar follow theo:
- Scroll canvas (selected element di chuyển)
- Resize element (drag-to-resize)
- Browser resize

Cost ~1ms/frame khi selected, không khi không selected.

### Template

```vue
<div v-if="show" class="wk-toolbar" :style="position">
  <button @click="duplicate"><Copy /></button>
  <button @click="remove"><Trash /></button>
  <span class="wk-toolbar__handle"
        draggable="true"
        @dragstart="onDragHandleStart"
        @dragend="onDragHandleEnd"
  ><Move /></span>
  <span class="wk-toolbar__label">{{ typeLabel }}</span>
</div>
```

Drag handle (icon Move) khi user drag → bắt đầu drag-move giống drag thẳng vào element:
```js
onDragHandleStart(e) {
  const shadow = createShadow(e, [this.selectedNode.dom])
  useDndStore().startMove(this.selectedNode.id, shadow)
  e.dataTransfer.effectAllowed = 'move'
  document.body.classList.add('wk-dragging')
}
onDragHandleEnd(e) {
  useDndStore().endDrag(e)
  document.body.classList.remove('wk-dragging')
}
```

Lợi: user có thể chọn element rồi grab handle (không phải grab body element), dễ hơn khi element nhỏ hoặc bị child che.

### typeLabel

Đọc từ registry:
```js
typeLabel() {
  const def = getDef(this.selectedNode.data.type)
  return def?.label || this.selectedNode.data.type
}
```

Thêm element mới = label tự xuất hiện trong toolbar.

## 3. EdgeOverlays

`src/components/editor_v2/elements/EdgeOverlays.vue` — overlay padding + margin visualizer cho element selected. Pagefly-style: SVG hatched pattern + dimension arrows + click-to-edit.

### Khi nào hiển thị

- `selected` có 1 node
- Node `type` không phải `root` hoặc `heading` (chỉ container có ý nghĩa)
- Node có DOM ref (đã mount)

### Anatomy

```
Selected element rect:
┌─────────────────────────────────────┐  ← MARGIN strip (4 mép, ra ngoài rect)
│ ╔═══════════════════════════════╗   │
│ ║ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ ║   │  ← PADDING strip (4 mép, vào trong rect)
│ ║ ░ ┌─────────────────────────┐ ░ ║   │
│ ║ ░ │                         │ ░ ║   │
│ ║ ░ │   element content area  │ ░ ║   │
│ ║ ░ │                         │ ░ ║   │
│ ║ ░ └─────────────────────────┘ ░ ║   │
│ ║ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ ║   │
│ ╚═══════════════════════════════╝   │
└─────────────────────────────────────┘
```

Mỗi strip:
- SVG hatched pattern (gạch chéo) background
- Dimension arrow 2 đầu chỉ chiều rộng/cao
- Số `px` ở giữa
- Border nhạt 3 mép còn lại (để nhìn ra strip tách biệt)

### Hover-only

```js
hoveredEdge() {
  // Tính theo (cursor x, y) vs rect
  // - cursor INSIDE rect: padding side hovered (gần edge nào nhất)
  // - cursor OUTSIDE rect (trong margin zone): margin side
  // - threshold: PADDING_REACH = 40px (trong), MARGIN_REACH = 80px (ngoài)
}
```

Chỉ render strip của edge đang hover (1 trong 4: top/right/bottom/left). User di chuột tới đâu mới hiện đó, không chiếm 4 strip cùng lúc.

### Edit padding/margin

Click vào strip → mở popup nhập px hoặc kéo strip để resize. Apply qua:
```js
nodeStore.changeStyle(id, { padding: '20px 24px 20px 24px' })
// Default opts.breakpoint='current' → ghi vào responsive[currentBp].style.padding
```

`cssShorthand.parseSides(str)` → `{ top, right, bottom, left }`
`cssShorthand.formatSides({...})` → shorthand string (auto-collapse khi đối xứng)

### "+" sibling buttons (chỉ FlexSection)

```js
showInsertButtons() {
  return this.selectedNode.data.type === 'flex-section'
}
```

Nút "+" ở 2 đầu trên/dưới Section. Click → tạo Section mới ngay trước/sau.

Lý do chỉ Section: page-level Insert. Block đã có drop affordance (placeholder, drag-drop). Section là "ô lớn" nên cần shortcut nhanh để thêm section liền kề.

### Implementation chính

```js
data() {
  return {
    cursor: { x: 0, y: 0 },
    rect: { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 },
  }
},
mounted() {
  document.addEventListener('mousemove', this.onMouseMove)
  this._raf = null
  this._updateRect = () => {
    if (!this.selectedNode?.dom) return
    const r = this.selectedNode.dom.getBoundingClientRect()
    this.rect = {
      top: r.top, left: r.left, width: r.width, height: r.height,
      right: r.left + r.width, bottom: r.top + r.height,
    }
    this._raf = requestAnimationFrame(this._updateRect)
  }
  this._updateRect()
}
```

`right`/`bottom` quan trọng: `hoveredEdge` đọc chúng để check cursor side. Trước có bug quên compute → strip top hiện được, các strip khác null.

### SVG pattern & arrows

```html
<svg>
  <defs>
    <pattern id="hatch" patternUnits="userSpaceOnUse" width="6" height="6">
      <path d="M-1,1 l2,-2 M0,6 l6,-6 M5,7 l2,-2" stroke="#3F8DFF" stroke-width="1"/>
    </pattern>
    <marker id="arrow-start" viewBox="0 0 10 10" refX="10" refY="5" orient="auto">
      <path d="M10,0 L0,5 L10,10 z" fill="#3F8DFF"/>
    </marker>
    <marker id="arrow-end" viewBox="0 0 10 10" refX="10" refY="5" orient="auto">
      <path d="M0,0 L10,5 L0,10 z" fill="#3F8DFF"/>
    </marker>
  </defs>
  <rect fill="url(#hatch)" .../>
  <line marker-start="url(#arrow-start)" marker-end="url(#arrow-end)" .../>
  <text>{{ px }}</text>
</svg>
```

`orient="auto"` quan trọng — `auto-start-reverse` render inconsistently. Dùng 2 marker với path khác hướng.

### Margin "+ border ngoài 3 cạnh"

Khi hover margin top:
- Strip top: SVG pattern + arrows + label
- 3 cạnh còn lại (right, bottom, left): vẽ border màu nhạt (1px solid rgba blue 0.3) ngoài rect — để user nhận ra "đây là strip ngoài, không phải padding"

Code:
```vue
<div class="wk-margin-strip wk-margin-strip--top" :style="{...}">
  <svg>...</svg>
</div>
<div class="wk-margin-frame" :style="{
  top: rect.top - marginTop + 'px',
  left: rect.left - marginLeft + 'px',
  width: rect.width + marginLeft + marginRight + 'px',
  height: rect.height + marginTop + marginBottom + 'px',
  border: '1px solid rgba(63,141,255,0.3)',
}" v-if="hoveredSide === 'margin-top'"/>
```

### Padding side phải full height

Bug trước: padding top/bottom strip full width, nhưng padding left/right chỉ cao = vùng padding ngang.

Fix: left/right strip phải full height của element (kể cả padding top/bottom area) để nhìn liền mạch giống Pagefly.

```css
.wk-padding-strip--left {
  height: 100%;        /* full element */
  width: var(--pad-left);
}
```

## 4. Layers panel

`src/components/editor_v2/components/sidebar/PageContents.vue` + `LayerItem.vue` — tree view của toàn bộ nodes.

```vue
<!-- PageContents.vue -->
<div>
  <LayerItem :node-id="ROOT_NODE" :depth="0" />
</div>

<!-- LayerItem.vue -->
<div
  :class="{ 'wk-layer--selected': isSelected }"
  :style="{ paddingLeft: depth * 16 + 'px' }"
  @click="onClick"
>
  <component :is="icon" :size="14" />
  {{ label }}
</div>
<LayerItem
  v-for="childId in node.data.nodes"
  :key="childId"
  :node-id="childId"
  :depth="depth + 1"
/>
```

`label` và `icon` đọc từ map cứng (hiện chưa wire registry):
```js
const LABEL_BY_TYPE = { 'flex-section': 'Section', 'flex-block': 'Block', heading: 'Heading' }
const ICON_BY_TYPE = { 'flex-section': SquareStack, 'flex-block': Square, heading: Type }
```

**TODO future:** thay bằng `getDef(type).label` và `getDef(type).icon` từ registry — thêm element mới tự xuất hiện trong Layers.

### Click → select

```js
onClick() {
  useNodeStore().setSelected(this.nodeId)
  // TODO: scrollIntoView trên canvas
}
```

### Drag-reorder trong Layers (chưa làm)

Pattern: dùng cùng `draggableNode` mixin trên `LayerItem` — drag → startMove(nodeId). Drop trên layer khác → move. Cùng Positioner & indicator pipeline.

## 5. Body classlist marker `wk-dragging`

Khi `startCreate` hoặc `startMove`, `draggableNode` mixin:
```js
document.body.classList.add('wk-dragging')
```
`endDrag` xoá. CSS có thể dùng để disable hover effect khi đang drag:
```css
body.wk-dragging .wk-edge-overlay { display: none; }
```

(Hiện chưa apply rộng, sẵn cho mở rộng.)

## 6. Tóm tắt overlay priority

Khi 1 element được select, các overlay xuất hiện theo z-index:

1. Element outline (`.wk-node-selected`) — `outline` CSS, không phải overlay riêng
2. EdgeOverlays — `z-index: 9990`, follow rect bằng rAF
3. ElementToolbar — `z-index: 10000`, follow rect bằng rAF
4. IndicatorOverlay — chỉ khi drag, `z-index: 10000`, không có khi không drag

Tất cả Teleport vào `body` để tránh bị clip bởi canvas overflow.
