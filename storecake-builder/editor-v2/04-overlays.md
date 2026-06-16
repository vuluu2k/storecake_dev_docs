# 04 — Selection, Toolbar, Edge Overlays, Layers

UI nổi (floating) phục vụ tương tác với node đã chọn: ElementToolbar, EdgeOverlays. + Layers panel.

## 1. Selection state

Sống trong `nodeStore.events.selected: string[]`. Array để hỗ trợ multi-select tương lai, hiện single-select.

`events.state: 'default' | 'hover' | 'active' | null` — active variant cho selected node (xem statefulNode mixin trong [`01-architecture.md`](./01-architecture.md) §5).

### Set selection

```js
// nodeStore actions
setSelected(id) {
  this.events.selected = id ? [id] : []
  this.events.state = id && getDef(this.nodes[id]?.data?.type)?.states?.base || null
}
addSelected(id)    { ... push không duplicate }
removeSelected(id) { ... splice }
clearSelected()    { this.events.selected = []; this.events.state = null }
```

### Trigger

| Hành động | Code | Hiệu ứng |
|---|---|---|
| Click element | `onClick` mixin → `setSelected(nodeId)` | Outline + Toolbar + EdgeOverlays |
| Click empty canvas | `RootCanvas.onClickRoot` (`@click.self`) → `clearSelected()` | Ẩn tất cả overlay |
| Bắt đầu drag-move | `onMoveDragStart` → `setSelected(nodeId)` | Element được select trước khi drag |
| Click trong Layers panel | `LayerItem.onClick` → `setSelected(nodeId)` | Outline + cuộn canvas tới element |
| Click "+" sibling button trong EdgeOverlays | `addSibling` → `setSelected(newId)` | Element mới được select ngay |
| Đổi variant trong toolbar | `setState('hover')` | Trait edit dispatch vào `states[state]` |

### Visual

CSS global `node.css`:
```css
.wk-node-selected {
  outline: 2px solid #3F8DFF;
  outline-offset: -2px;
}
.wk-flex-block.wk-node-selected.wk-flex-block--drop-active {
  outline: none;
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

rAF loop cập nhật vị trí mỗi frame để toolbar follow theo scroll / resize / drag-resize.

### Template

```vue
<div v-if="show" class="wk-toolbar" :style="position">
  <span class="wk-toolbar__label">{{ typeLabel }}</span>
  <span class="wk-toolbar__handle"
        draggable="true"
        @dragstart="onDragHandleStart"
        @dragend="onDragHandleEnd"><Move /></span>
  <button @click="duplicate"><Copy /></button>
  <button @click="ungroup" v-if="canUngroup"><GroupOff /></button>
  <button @click="remove" :disabled="isLocked"><Trash /></button>
</div>
```

`isLocked = getDef(selectedNode.data.type)?.rules?.locked` — trash + duplicate disabled cho locked.

`canUngroup = node.data.isCanvas && nodes.length > 0 && parent !== ROOT` (Block-level only).

Drag handle (icon Move) → bắt đầu drag-move thay vì grab body:
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

### typeLabel

Đọc từ registry:
```js
typeLabel() {
  const def = getDef(this.selectedNode.data.type)
  return def?.label || this.selectedNode.data.type
}
```

### State picker (nếu stateful)

Khi `meta.states.variants` tồn tại, toolbar hiện thêm WkSegmented switch các variant:

```vue
<WkSegmented
  v-if="stateVariants"
  :model-value="state"
  :options="stateVariants"
  @update:model-value="onSetState"
/>
```

```js
onSetState(value) { useNodeStore().setState(value) }
```

User edit trait khi state ≠ base → `changeStyle(id, patch, { stateful: true })` → `_routeState` divert stateful writeKey vào `states[state].{style,config}` (per-bp qua `writeStateWithRec`).

## 3. EdgeOverlays

`src/components/editor_v2/elements/EdgeOverlays.vue` — overlay padding + margin visualizer cho element selected. Pagefly-style: SVG hatched pattern + dimension arrows + click-to-edit.

### Khi nào hiển thị

- `selected` có 1 node
- `getDef(type)?.rules?.edgeOverlay !== false` (cho phép element opt-out)
- Node có DOM ref (đã mount)

Element opt-out trong `meta.rules.edgeOverlay`:
```js
rules: { edgeOverlay: { padding: false, marginSides: { left: false } } }
```

### Anatomy

```
┌─────────────────────────────────────┐  ← MARGIN strip (4 mép, ra ngoài rect)
│ ╔═══════════════════════════════╗   │
│ ║ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ ║   │  ← PADDING strip (4 mép, vào trong rect)
│ ║ ░ ┌─────────────────────────┐ ░ ║   │
│ ║ ░ │  element content area   │ ░ ║   │
│ ║ ░ └─────────────────────────┘ ░ ║   │
│ ║ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ ║   │
│ ╚═══════════════════════════════╝   │
└─────────────────────────────────────┘
```

Mỗi strip:
- SVG hatched pattern (gạch chéo) background
- Dimension arrow 2 đầu chỉ chiều rộng/cao
- Số `px` ở giữa
- Border nhạt 3 mép còn lại

### Hover-only

```js
hoveredEdge() {
  // - cursor INSIDE rect: padding side hovered (gần edge nào nhất)
  // - cursor OUTSIDE rect (trong margin zone): margin side
  // - threshold: PADDING_REACH = 40px (trong), MARGIN_REACH = 80px (ngoài)
}
```

Chỉ render strip của edge đang hover.

### Edit padding/margin

Click vào strip → mở popover nhập px hoặc kéo strip để resize. Apply qua:
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

Nút "+" ở 2 đầu trên/dưới Section. Click → tạo Section mới qua `addNodeTree(buildBlankSection(), ROOT, idx)`.

### Implementation

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

`right`/`bottom` quan trọng: `hoveredEdge` đọc chúng để check cursor side.

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

## 4. Layers panel

`src/components/editor_v2/components/sidebar/SidebarLayer.vue` + `LayerGroupWrapper.vue` + `LayerItem.vue` — tree view của toàn bộ nodes.

```vue
<!-- SidebarLayer.vue (a.k.a PageContents) -->
<template>
  <SidebarWrapper :width="280" type="layer" title="Page contents">
    <LayerGroupWrapper title="Header" />
    <LayerGroupWrapper title="Body">
      <LayerItem v-for="childId in rootChildren" :key="childId" :node-id="childId" :depth="0" />
    </LayerGroupWrapper>
    <LayerGroupWrapper title="Footer" />
  </SidebarWrapper>
</template>
```

`rootChildren` = `nodes[ROOT_NODE].data.nodes`. Header / Footer là placeholder cho roadmap multi-region.

```vue
<!-- LayerItem.vue -->
<div
  class="flex items-center gap-... rounded-... cursor-pointer"
  :class="{ 'bg-neutral-200': isSelected, 'opacity-40': isDragging,
            'ring-1 ring-inset': dropIndicator === 'inside' }"
  :style="{ marginLeft: `calc(var(--spacing-2xs) + ${depth * 20}px)` }"
  draggable="true"
  @click.stop="onClick"
  @mouseenter="onHover" @mouseleave="onLeave"
  @dragstart.stop="onDragStart"
  @dragend="onDragEnd"
  @dragover="onDragOver" @dragleave="onDragLeave"
  @drop.stop.prevent="onDrop"
>
  <component :is="icon" :size="14" />
  <span class="truncate">{{ label }}</span>
  <button v-if="hidden" @click="toggleHidden"><EyeOff /></button>
</div>
<LayerItem
  v-for="childId in node.data.nodes"
  :key="childId" :node-id="childId" :depth="depth + 1"
/>
```

`label` và `icon` đọc trực tiếp từ registry:
```js
computed: {
  def() { return getDef(this.node.data.type) },
  label() { return this.node.data.name || this.def?.label || this.node.data.type },
  icon() { return this.def?.icon || Square },
}
```

Thêm element mới → tự xuất hiện trong Layers (lấy label/icon từ registry).

### Layers hide rule

`meta.rules.hideInLayer = true` → LayerItem skip render node đó + descendants. Vd `root_canvas` (vì Sidebar wrapper đã có header "Page contents").

Satellite cũng có thể `hideInLayer: true` để không lộ ra (vd `tab-content` nằm bên trong Tab).

### Drag-reorder trong Layers

`LayerItem` reuse `draggableNode` semantics: dragstart → `dndStore.startMove(nodeId, shadow)`. Drop trên layer khác → tính placement theo cursor Y vs item rect:
- Cursor 25% trên → `where: 'before'` parent của item
- Cursor 25% dưới → `where: 'after'` parent của item
- Cursor giữa → `'inside'` (chỉ với container item)

Apply qua `move(id, newParentId, idx)`. Same parent + permutation → tự coalesce thành `reorderChildren` (1 entry history).

### Click → select + scroll

```js
onClick() {
  useNodeStore().setSelected(this.nodeId)
  this.$nextTick(() => {
    const node = useNodeStore().nodes[this.nodeId]
    node?.dom?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}
```

## 5. Body classlist marker `wk-dragging`

Khi `startCreate` hoặc `startMove`:
```js
document.body.classList.add('wk-dragging')
```
`endDrag` xoá. CSS có thể dùng để disable hover effect khi đang drag:
```css
body.wk-dragging .wk-edge-overlay { display: none; }
```

## 6. SettingDialog hub

`src/components/editor_v2/components/SettingDialog.vue` — mount tập hợp popover (asset picker, color picker, animation editor, …). Đọc `uiStore.settingDialogs` stack.

```js
toggleDialogVis(e, type, data?)   // open
closeDialog(type)                  // close
setDialogPosition(type, position)  // reposition
```

Trait widget (vd `BackgroundImageTrait`) click button trigger:
```js
useUIStore().toggleDialogVis(event, 'asset-picker', { nodeId, fieldKey: 'backgroundImage' })
```

Dialog đọc `ctx.data.nodeId` + `ctx.data.fieldKey` để biết edit field gì của node nào → on confirm gọi `nodeStore.changeStyle(...)`.

## 7. Tóm tắt overlay priority

Khi 1 element được select:

1. Element outline (`.wk-node-selected`) — CSS outline, không phải overlay riêng
2. EdgeOverlays — `z-index: 9990`, follow rect bằng rAF
3. ElementToolbar — `z-index: 10000`, follow rect bằng rAF
4. IndicatorOverlay — chỉ khi drag, `z-index: 10000`
5. SettingDialog popovers — `z-index: 10010`

Tất cả Teleport vào `body` để tránh bị clip bởi canvas overflow.
