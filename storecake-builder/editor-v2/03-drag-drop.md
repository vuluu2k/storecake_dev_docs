# 03 — Drag & Drop

Pipeline drag-create (sidebar → canvas) và drag-move (existing node). Positioner deep dive. Indicator overlay. Sidebar pickers.

## 1. Tổng quan 2 loại drag

| Loại | Bắt đầu ở | Source | Apply | Class trong body |
|---|---|---|---|---|
| **Create** | Sidebar (`ElementDragV2`) | `dragTarget = { type: 'new', tree }` | `addNodeTree(tree, parentId, index)` | `wk-dragging` |
| **Move** | Element canvas hoặc Toolbar drag handle | `dragTarget = { type: 'existing', nodes: [id] }` | `move(nodeId, parentId, index)` | `wk-dragging` |

Cả hai dùng chung Positioner và `endDrag` để commit.

## 2. Sidebar pickers (drag source)

Sidebar có 10 picker component, một cho mỗi nhóm element:

```
components/editor_v2/components/sidebar/
  SidebarWrapper.vue                 ← Shell switcher (đọc uiStore.leftSidebarKeyActive)
  SidebarElements.vue                ← Container: layout / basic catalogs
  SidebarSub.vue                     ← Sub-tab
  SidebarLayer.vue                   ← Layers tree (đọc registry)
  LayerItem.vue / LayerGroupWrapper.vue
  ElementContainer.vue               ← Wrap mỗi item (icon + label)

  ElementsLayoutPicker.vue           ← Section + N-column rows + page templates
  ElementsHeadingPicker.vue
  ElementsTextPicker.vue
  ElementsButtonPicker.vue
  ElementsImagePicker.vue
  ElementsIconPicker.vue
  ElementsBreadcrumbPicker.vue
  ElementsListPicker.vue
  ElementsTabPicker.vue
  ElementsImageComparisonPicker.vue
```

Mỗi picker wrap item bằng `<ElementDragV2 :tree="...">` với prop `tree` là **function** trả NodeTree (lazy — tạo tree mới mỗi lần drag).

`ElementsLayoutPicker` đặc biệt: ngoài Section + Row N, còn list `listTemplates()` từ `templateRegistry.js` — vd "Hero" template build NodeTree từ `templates/hero.js#def` qua `buildTemplate(id)`.

Thêm element mới vào sidebar:
1. Trong `meta.js` set `category: 'basic' | 'layout'` + `showInSidebar: true`
2. Tạo picker `Elements<Name>Picker.vue` hoặc thêm vào picker hiện có (vd cùng category)
3. Picker mount qua `SidebarElements.vue` theo group

## 3. Drag-create flow (chi tiết)

### Bước 1 — Sidebar item

```vue
<!-- ElementsLayoutPicker.vue -->
<ElementDragV2 :tree="() => buildElement('flex-section')">
  <ElementContainer label="Section" :icon="SquareStack" />
</ElementDragV2>
```

`buildElement(type, overrides?)` (trong `nodeFactory.js`) → call `factoryFor(type, overrides)` (wrapped factory) → trả `{ rootNodeId, nodes }` NodeTree.

### Bước 2 — `ElementDragV2.vue` xử lý dragstart

```js
this._onDragStart = (e) => {
  e.stopPropagation()
  const tree = typeof this.tree === 'function' ? this.tree() : this.tree
  if (!tree || !tree.rootNodeId || !tree.nodes) return
  const dom = e.currentTarget
  const shadow = createShadow(e, [dom])        // clone preview, set dragImage
  useDndStore().startCreate(tree, shadow)
}
```

`createShadow`:
- Clone DOM source, strip selection/drop-active class
- Scale ≤ 320×240px
- Set opacity, shadow, position absolute off-screen
- `e.dataTransfer.setDragImage(shadow, w/2, h/2)`

### Bước 3 — `dndStore.startCreate(tree, shadowEl)`

```js
startCreate(tree, shadowEl) {
  this.dragTarget = { type: 'new', tree }
  this.setDraggedShadow(shadowEl)               // markRaw
  const nodeStore = useNodeStore()
  this.setPositioner(new Positioner(nodeStore, this.dragTarget))
}
```

Positioner constructor:
```js
this.draggedNodes = this.getDraggedNodes()      // [{ node: treeRoot, exists: false }]
window.addEventListener('scroll', this.onScrollListener, true)
window.addEventListener('dragover', documentDragoverEventHandler, false)  // preventDefault
```

Window dragover preventDefault để browser cho phép drop ở mọi đâu. Side-effect: drop ngoài canvas vẫn fire `endDrag` — guard `dropInsideCanvas`.

### Bước 4 — User di chuyển chuột → `dragover` ở canvas containers

Mỗi container (`RootCanvas`, `FlexSection`, `FlexBlock`, `Tab`, `List`, …) có handler `onDragOver` từ `nodeContainer` mixin:

```js
onDragOver(e) {
  const dndStore = useDndStore()
  if (!dndStore.positioner) return
  e.preventDefault()
  e.stopPropagation()
  const indicator = dndStore.positioner.computeIndicator(this.nodeId, e.clientX, e.clientY)
  if (indicator) useNodeStore().setIndicator(indicator)
}
```

`e.stopPropagation` quan trọng: container con fire trước → set indicator cho con; nếu bubble lên cha thì cha overwrite, indicator bị "nhảy" lên parent.

`positioner.computeIndicator(nodeId, x, y)` trả về:
```js
{
  placement: {
    parent: { id, data, ... },        // node sẽ là parent sau khi drop
    index: 2,                          // vị trí trong parent.data.nodes
    where: 'before' | 'after',         // bên nào của index
    currentNode,                       // node tại index hiện tại (nếu có)
  },
  error: null | 'flex-section can only live at the page root',
}
```

### Bước 5 — IndicatorOverlay render vạch xanh

`IndicatorOverlay.vue` (Teleport to body) watch `events.indicator`. Khi có, đọc placement, query DOM của `placement.currentNode.dom` hoặc cuối parent's children, vẽ overlay (`position: fixed`, vạch xanh 2px, x/y theo rect).

Container target có class `wk-flex-section--drop-active` hoặc `wk-flex-block--drop-active` (qua `isDropTarget` computed trong mixin). Tint xanh nhẹ + placeholder lift up.

### Bước 6 — User nhả chuột → `dragend`

`onMoveDragEnd` (drag existing) hoặc `_onDragEnd` (drag sidebar) cùng gọi `dndStore.endDrag(e)`.

```js
endDrag(e) {
  // 1. Guard: cursor có trong canvas không?
  let dropInsideCanvas = true
  if (e?.clientX != null && e?.clientY != null) {
    const canvas = document.querySelector('.wk-editor-body')
    if (canvas) {
      const r = canvas.getBoundingClientRect()
      dropInsideCanvas = e.clientX >= r.left && e.clientX <= r.right
                      && e.clientY >= r.top  && e.clientY <= r.bottom
    }
  }

  // 2. Apply nếu có indicator hợp lệ và cursor trong canvas
  if (this.positioner && dropInsideCanvas) {
    const indicator = this.positioner.getIndicator()
    if (this.dragTarget && indicator && !indicator.error) {
      const idx = indicator.placement.index + (indicator.placement.where === 'after' ? 1 : 0)

      if (this.dragTarget.type === 'new') {
        nodeStore.addNodeTree(this.dragTarget.tree, indicator.placement.parent.id, idx)
      } else if (this.dragTarget.type === 'existing') {
        nodeStore.move(this.dragTarget.nodes[0], indicator.placement.parent.id, idx)
      }
    }
  }

  // 3. Cleanup
  this.draggedElementShadow?.el?.parentNode?.removeChild(this.draggedElementShadow.el)
  this.setDraggedShadow(null)
  this.positioner?.cleanup()                    // remove window listeners
  this.setPositioner(null)
  this.dragTarget = null
  nodeStore.setIndicator(null)
  nodeStore.setNodeEvent('dragged', null)
}
```

### Bước 7 — Store apply

`addNodeTree(tree, 'ROOT', 0)`:
1. `parentIsRoot && !treeRootIsRootOnly` → `treeToInsert = wrapInBlankSection(tree)` (auto-wrap)
2. `_commit('addNodeTree', mutateFn)` — qua PatchRecorder
3. Lặp `treeToInsert.nodes`, build node mới (clone style/config/specials/events/bindings + seed responsive[currentBp]), `rec.set(['nodes', id], newNode)`
4. `rec.insert(['nodes', parentId, 'data', 'nodes'], insertAt, treeRootId)`

Vue reactivity notify → mọi NodeRenderer re-eval → new element xuất hiện trong DOM. History được record 1 entry "addNodeTree" → undo xoá hết tree.

## 4. Drag-move flow

Khác create:
- Bắt đầu từ element trong canvas (drag handle trên ElementToolbar hoặc drag thẳng vào element)
- Source là node đã tồn tại, không phải tree mới
- Apply qua `move(id, newParentId, idx)` thay vì `addNodeTree`

### `onMoveDragStart` (trong `draggableNode` mixin)

```js
onMoveDragStart(e) {
  e.stopPropagation()
  const nodeStore = useNodeStore()
  const dndStore = useDndStore()
  // Locked element không drag riêng
  if (getDef(this.node.data.type)?.rules?.locked) { e.preventDefault(); return }
  nodeStore.setSelected(this.nodeId)
  const shadow = createShadow(e, [this.$refs.root])
  dndStore.startMove(this.nodeId, shadow)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
  document.body.classList.add('wk-dragging')
}
```

**`e.stopPropagation()` quan trọng:** Browser pick `draggable=true` ancestor gần nhất làm drag source, NHƯNG event vẫn bubble. Nếu Heading (child) và Block (parent) cùng `draggable=true`, drag Heading sẽ bubble lên Block's `@dragstart` → `setSelected(blockId)` override → store nghĩ đang drag Block.

### `move(nodeId, newParentId, newIndex)` trong store

Logic phức tạp hơn `addNodeTree`:

1. **Validation:** `nodeId !== newParentId`, không có cycle (descendants không include newParentId), không root-only nesting (`isRootOnlyType(node.data.type) && newParent.data.type !== 'root'`), và parent whitelist (`getNodeChildAllows(newParent.data.type)` — nếu non-empty và không include `node.data.type` → reject)
2. **No-op fast path:** cùng parent + cùng spot → return
3. **Auto-wrap:** newParent=ROOT + node không phải root-only → `wrapInBlankSection({ rootNodeId: nodeId, nodes: {} })` → wrap thành flex-section
4. **Normal re-parent:** remove khỏi old parent, adjust index nếu same parent (oldIdx < newIndex → newIndex--), insert vào new parent, ghi `node.data.parent = newParentId`

Mọi mutation qua `_commit('move', mutateFn)` → 1 entry history.

### `reorderChildren(parentId, orderedIds)`

Khi user drag-reorder trong cùng container hoặc Layers panel: thay vì `move` từng item (N entries), gọi `reorderChildren` → 1 entry permutation. Validate permutation (length match + same set) trước khi commit.

## 5. Positioner deep dive

`src/composable/editor_v2/Positioner.js` — port craft.js.

### Constructor

```js
constructor(store, dragTarget) {
  this.store = store
  this.dragTarget = dragTarget
  this.draggedNodes = this.getDraggedNodes()
  window.addEventListener('scroll', this.onScrollListener, true)
  window.addEventListener('dragover', preventDefault, false)
}
```

### `computeIndicator(dropTargetId, x, y)` — luồng

```
Input: dropTargetId, (x, y) cursor
1. isDraggingRootOnly()?
     ├─ true  → newParentNode = ROOT (force)
     └─ false → newParentNode = getCanvasAncestor(dropTargetId)
                (đi ngược lên tới node có isCanvas=true)

2. isNearBorders(newParentNode.dom, x, y)?
     ├─ true (cursor sát mép) → ESCAPE: newParentNode = parent của newParentNode
     └─ false → keep newParentNode

3. childDims = getChildDimensions(newParentNode)
     [{ id, top, bottom, left, right, inFlow }] cho mỗi child

4. position = findPosition(newParentNode, childDims, x, y)
     { parent, index, where }

5. isDroppable(newParentNode, draggedNodes)?
     ├─ true  → error = null
     └─ false → error = string

6. currentIndicator = { placement: { ...position, currentNode }, error }
   return currentIndicator (hoặc undefined nếu KHÔNG đổi vs lần trước)
```

### `isNearBorders` — axis-aware

Khi cursor sát mép parent, user muốn drop làm **sibling của parent**, không phải drop vào trong.

- `inFlow === true` (parent stack children theo column) → top/bottom là escape, left/right không
- `inFlow === false` (parent stack theo row) → left/right là escape

`BORDER_OFFSET = 16` px (xem `constants.js`). Cursor cách mép > 16 px → coi như muốn drop INTO.

### `findPosition` — quyết định index + where

Walk childDims, tính `distanceToCenter(child, x, y)`, lấy closest. Sau đó:
- Vertical layout: cursor trên/dưới center → 'before' / 'after'
- Horizontal layout: cursor trái/phải center → 'before' / 'after'

Edge cases:
- Parent rỗng → `{ index: 0, where: 'before' }`
- Cursor ngoài tất cả children → closest child, where='after'

### Indicator caching

```js
isDiff(newPosition) {
  return !currentIndicator
    || currentIndicator.placement.parent.id !== newPosition.parent.id
    || currentIndicator.placement.index !== newPosition.index
    || currentIndicator.placement.where !== newPosition.where
}
```

Nếu position không đổi, `computeIndicator` return `undefined` → store không notify → overlay không re-render.

### Cleanup

```js
cleanup() {
  window.removeEventListener('scroll', this.onScrollListener, true)
  window.removeEventListener('dragover', preventDefault, false)
}
```

Gọi từ `endDrag`. Nếu không cleanup, listener window `preventDefault` còn → mọi drag-drop sau bị browser allow drop bừa.

## 6. IndicatorOverlay component

`src/components/editor_v2/elements/IndicatorOverlay.vue` render **2 chế độ**:

1. **OK drop** (`indicator.error == null`) → vạch xanh 2px ở vị trí placement.
2. **Reject drop** (`indicator.error` có message) → ô đỏ (`border + bg rgba(255,77,79,.08)`) bọc parent rect + label đỏ ghi lý do reject (vd "Allowed drop: TEXT", "flex-section can only live at the page root").

```js
computed: {
  indicator() { return useNodeStore().events.indicator },
  // Red box + label khi cố drop vào parent không hợp lệ
  errorBox() {
    const ind = this.indicator
    if (!ind || !ind.error) return null
    const parentNode = ind.placement?.parent && this.nodes[ind.placement.parent.id]
    if (!parentNode?.dom) return null
    const info = getDOMInfo(parentNode.dom)
    return {
      message: ind.error,
      style: { position: 'fixed', top: info.top + 'px', left: info.left + 'px',
        width: info.width + 'px', height: info.height + 'px',
        border: '1px solid #FF4D4F', background: 'rgba(255,77,79,.08)',
        zIndex: 'var(--wk-z-drop-indicator)', cursor: 'not-allowed' },
    }
  },
  show() {
    const ind = this.indicator
    if (!ind || ind.error) return false
    if (ind.placement.parent.data.nodes.length === 0) return false  // empty container có placeholder rồi
    return true
  },
  style() {
    /* vạch xanh placement — position fixed, height 2px, bg #3F8DFF */
    /* dùng movePlaceholder(placement, canvasDOMInfo, targetDOMInfo) để tính top/left/width */
  },
}
```

Template:
```vue
<div v-if="show" class="wk-indicator" :style="style" />
<div v-else-if="errorBox" class="wk-indicator-error" :style="errorBox.style">
  <span class="wk-indicator-error__label">{{ errorBox.message }}</span>
</div>
```

Error message string đến từ `node.js` store action `setIndicator` callback hoặc trực tiếp từ `Positioner.isDroppable`:
- `flex-section can only live at the page root` — root-only nest sai chỗ
- `Allowed drop: TEXT, IMAGE` — parent có `rules.nodeChildAllows` whitelist src.data.type không nằm trong

Teleport vào body để không bị clip bởi overflow canvas.

## 7. Auto-scroll khi drag

`PageWrapper.mounted` cài listener `dragover` cấp document:

```js
this._onDocumentDragOver = (e) => {
  if (!useDndStore().dragTarget) return
  const canvas = this.$refs.canvas
  const rect = canvas.getBoundingClientRect()
  const ZONE = 60
  const SPEED = 14
  const fromTop = e.clientY - rect.top
  const fromBottom = rect.bottom - e.clientY
  if (fromTop < ZONE && fromTop > 0) {
    canvas.scrollTop -= SPEED * (1 - fromTop / ZONE)
  } else if (fromBottom < ZONE && fromBottom > 0) {
    canvas.scrollTop += SPEED * (1 - fromBottom / ZONE)
  }
}
document.addEventListener('dragover', this._onDocumentDragOver)
```

Gradient `1 - fromTop/ZONE` → càng gần mép càng scroll nhanh. Không re-render Vue, chỉ mutate `scrollTop`.

`beforeUnmount` remove listener.

## 8. Common gotchas

### Drop outside canvas vẫn apply

**Symptom:** Drag từ sidebar, nhả chuột ngoài cửa sổ → element vẫn được tạo.

**Cause:** Positioner cài window dragover preventDefault → dragend fire với indicator còn nguyên.

**Fix:** `endDrag(e)` check `dropInsideCanvas` bằng `e.clientX/Y` vs `.wk-editor-body` rect.

### Drag child chọn parent

**Symptom:** Drag Heading → ElementToolbar hiện trên Block.

**Cause:** dragstart bubble từ Heading lên Block. Block's handler chạy sau và override.

**Fix:** `e.stopPropagation()` đầu `onMoveDragStart` (đã có sẵn trong `draggableNode`).

### Drop satellite từ Tab vào FlexBlock

**Symptom:** Có thể drag `tab-content` ra ngoài Tab → broken layout.

**Cause:** Satellite ngầm draggable=true.

**Fix:** `tab_content/meta.js` set `rules.locked: true` → `onMoveDragStart` return ngay; thêm rule chỉ cho phép sống trong `tab` owner. Có thể bổ sung `canDropInto(parent) => parent === 'tab'` cho an toàn.

### Drag flex-section vào flex-block không bị chặn ở UI

**Cause:** Positioner `isDraggingRootOnly()` không nhận diện đúng. Check `meta.rules.isRootOnly: true` cho Section.

**Verify:**
```js
import('@/composable/editor_v2/registry').then(r => console.log(r.isRootOnlyType('flex-section')))  // phải true
```

### Border-top doubled khi drop-active

**Symptom:** Empty container có border placeholder + vạch indicator top → 2 đường chồng.

**Fix:** `IndicatorOverlay.show` ẩn khi `parent.data.nodes.length === 0` (placeholder đã đủ).
