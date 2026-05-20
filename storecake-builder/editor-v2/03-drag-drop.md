# 03 — Drag & Drop

Pipeline drag-create (sidebar → canvas) và drag-move (existing node). Positioner deep dive. Indicator overlay.

## 1. Tổng quan 2 loại drag

| Loại | Bắt đầu ở | Source | Apply | Class trong body |
|---|---|---|---|---|
| **Create** | Sidebar (`ElementDragV2`) | `dragTarget = { type: 'new', tree }` | `addNodeTree(tree, parentId, index)` | `wk-dragging` |
| **Move** | Element canvas hoặc Toolbar drag handle | `dragTarget = { type: 'existing', nodes: [id] }` | `move(nodeId, parentId, index)` | `wk-dragging` |

Cả hai dùng chung Positioner và `endDrag` để commit.

## 2. Drag-create flow (chi tiết)

### Bước 1 — Sidebar item

`ElementsLayoutPicker.vue` render danh sách:

```vue
<ElementDragV2 :tree="buildBlankSection">
  <ElementContainer>
    <div>Section</div>
  </ElementContainer>
</ElementDragV2>
```

`tree` là **function** trả về NodeTree (lazy — chỉ gọi khi dragstart, mỗi lần drag là 1 tree độc lập).

### Bước 2 — `ElementDragV2.vue` xử lý dragstart

```js
this._onDragStart = (e) => {
  e.stopPropagation()

  const tree = typeof this.tree === 'function' ? this.tree() : this.tree
  if (!tree || !tree.rootNodeId || !tree.nodes) return

  const dom = e.currentTarget                     // bóng preview chính là sidebar item
  const shadow = createShadow(e, [dom])           // tạo clone, set dragImage
  const dndStore = useDndStore()
  dndStore.startCreate(tree, shadow)
}
```

`createShadow`:
- Clone DOM source, strip class chọn lựa (`wk-node-selected`, `wk-flex-block--drop-active`)
- Scale ≤ 320×240px cho khỏi che hết canvas
- Set opacity, shadow, position absolute off-screen
- `e.dataTransfer.setDragImage(shadow, w/2, h/2)` — cursor anchor giữa preview

### Bước 3 — `dndStore.startCreate(tree, shadowEl)`

```js
startCreate(tree, shadowEl) {
  this.dragTarget = { type: 'new', tree }
  this.setDraggedShadow(shadowEl)               // markRaw, lưu để cleanup
  const nodeStore = useNodeStore()
  const p = new Positioner(nodeStore, this.dragTarget)
  this.setPositioner(p)                         // markRaw
}
```

Positioner constructor:
```js
this.draggedNodes = this.getDraggedNodes()      // [{ node: treeRoot, exists: false }]
window.addEventListener('scroll', this.onScrollListener, true)
window.addEventListener('dragover', documentDragoverEventHandler, false)  // preventDefault
```

Listener `dragover` cấp window `preventDefault` để browser cho phép drop ở mọi đâu (default browser deny drop). Lưu ý side-effect: drop ngoài canvas vẫn fire `endDrag` — phải guard.

### Bước 4 — User di chuyển chuột → `dragover` ở canvas containers

Mỗi container (`RootCanvasV2`, `FlexSectionV2`, `FlexBlockV2`) có handler `onDragOver` từ `nodeContainer` mixin:

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
  error: null | 'FlexSection can only live at the page root',
}
```

### Bước 5 — IndicatorOverlay render vạch xanh

`IndicatorOverlay.vue` (Teleport to body) watch `events.indicator`. Khi có, đọc placement, query DOM của `placement.currentNode.dom` hoặc cuối parent's children, vẽ overlay (`position: absolute`, vạch xanh 2px, x/y theo rect).

```js
// pseudo
const target = placement.currentNode?.dom
const rect = target ? target.getBoundingClientRect() : null
// vẽ ở top/bottom của rect tuỳ placement.where
```

Container target có class `wk-flex-section--drop-active` hoặc `wk-flex-block--drop-active` (vì `isDropTarget` computed trong mixin). Tint xanh nhẹ + placeholder lift up.

### Bước 6 — User nhả chuột → `dragend`

`onMoveDragEnd` (nếu drag existing) hoặc `_onDragEnd` (nếu drag từ sidebar) cùng gọi `dndStore.endDrag(e)`.

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
  if (positioner && dropInsideCanvas) {
    const indicator = positioner.getIndicator()
    if (dragTarget && indicator && !indicator.error) {
      const idx = indicator.placement.index + (indicator.placement.where === 'after' ? 1 : 0)

      if (dragTarget.type === 'new') {
        nodeStore.addNodeTree(dragTarget.tree, indicator.placement.parent.id, idx)
      } else if (dragTarget.type === 'existing') {
        const movedId = dragTarget.nodes[0]
        nodeStore.move(movedId, indicator.placement.parent.id, idx)
      }
    }
  }

  // 3. Cleanup
  shadowRef?.el?.parentNode?.removeChild(shadowRef.el)
  setDraggedShadow(null)
  positioner?.cleanup()                          // remove window listeners
  setPositioner(null)
  this.dragTarget = null
  nodeStore.setIndicator(null)
  nodeStore.setNodeEvent('dragged', null)
}
```

### Bước 7 — Store apply

`addNodeTree(tree, 'ROOT', 0)`:
1. `parentIsRoot && !treeRootIsRootOnly` → `tree = wrapTree(tree, 'flex-section')` (auto-wrap)
2. Lặp `tree.nodes`, merge vào `state.nodes`, seed `responsive[currentBp] = { props: {} }`
3. Re-parent tree root onto parentId
4. `parent.data.nodes.splice(insertAt, 0, treeRootId)`

Vue reactivity notify → mọi NodeRenderer re-eval → new element xuất hiện trong DOM.

## 3. Drag-move flow

Khác create:
- Bắt đầu từ element trong canvas (drag handle trên ElementToolbar hoặc drag thẳng vào element)
- Source là node đã tồn tại, không phải tree mới
- Apply qua `move(id, newParentId, idx)` thay vì `addNodeTree`

### `onMoveDragStart` (trong `draggableNode` mixin)

```js
onMoveDragStart(e) {
  e.stopPropagation()                            // ⚠️ CRITICAL — xem ghi chú dưới
  const nodeStore = useNodeStore()
  const dndStore = useDndStore()
  nodeStore.setSelected(this.nodeId)             // auto-select khi bắt đầu drag
  const shadow = createShadow(e, [this.$refs.root])
  dndStore.startMove(this.nodeId, shadow)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
  document.body.classList.add('wk-dragging')
}
```

**Tại sao `e.stopPropagation()` cần thiết:** Browser pick `draggable=true` ancestor gần nhất làm drag source, NHƯNG event vẫn bubble. Nếu Heading (child) và Block (parent) cùng `draggable=true`, drag Heading sẽ bubble lên Block's `@dragstart` → `setSelected(blockId)` override → store nghĩ đang drag Block. Fix: `stopPropagation` ở event bubble.

### `dndStore.startMove(id, shadowEl)`

Tương tự `startCreate` nhưng:
```js
this.dragTarget = { type: 'existing', nodes: [nodeId] }
nodeStore.setNodeEvent('dragged', [nodeId])     // visual indicator (giảm opacity?)
```

### `move(nodeId, newParentId, newIndex)` trong store

Logic phức tạp hơn `addNodeTree`:

```js
move(nodeId, newParentId, newIndex) {
  // 1. Validation
  if (!node || !newParent) return
  if (nodeId === newParentId) return             // self
  if (descendants(nodeId).includes(newParentId)) return  // cycle

  // 2. Type rule
  if (isRootOnlyType(node.data.type) && newParent.data.type !== 'root') return

  // 3. Auto-wrap (giống addNodeTree)
  if (newParent.data.type === 'root' && !isRootOnlyType(node.data.type)) {
    // Synthesize wrapper section
    const oldParent = nodes[node.data.parent]
    oldParent.data.nodes.splice(oldIdx, 1)
    const wrapperId = newId()
    this.nodes[wrapperId] = { id: wrapperId, data: { type: 'flex-section', ... } }
    newParent.data.nodes.splice(insertAt, 0, wrapperId)
    node.data.parent = wrapperId
    return
  }

  // 4. Normal re-parent
  const oldParent = nodes[node.data.parent]
  const oldIdx = oldParent.data.nodes.indexOf(nodeId)
  oldParent.data.nodes.splice(oldIdx, 1)

  // Adjust index nếu move trong CÙNG parent (sau khi splice ra, index dịch)
  let adjusted = newIndex
  if (oldParent === newParent && oldIdx < newIndex) adjusted--

  newParent.data.nodes.splice(adjusted, 0, nodeId)
  node.data.parent = newParentId
}
```

## 4. Positioner deep dive

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

`getDraggedNodes()` trả về `[{ node, exists: bool }]` để Positioner biết source.

### `computeIndicator(dropTargetId, x, y)` — luồng

```
Input: dropTargetId = node hover sang, (x, y) cursor
1. isDraggingRootOnly()
     ├─ true  → newParentNode = ROOT (force)
     └─ false → newParentNode = getCanvasAncestor(dropTargetId)
                  (đi ngược lên tới node có isCanvas=true)

2. isNearBorders(newParentNode.dom, x, y)?
     ├─ true (cursor sát mép) → ESCAPE
     │   newParentNode = parent của newParentNode
     │   (cho phép drop thành sibling, không vào trong)
     └─ false → keep newParentNode

3. childDims = getChildDimensions(newParentNode)
     [{ id, top, bottom, left, right, inFlow }] cho mỗi child

4. position = findPosition(newParentNode, childDims, x, y)
     {
       parent: newParentNode,
       index: int,             // index trong newParentNode.data.nodes
       where: 'before'|'after',
     }

5. isDroppable(newParentNode, draggedNodes)?
     ├─ true  → error = null
     └─ false → error = string (vd 'FlexSection can only live at root')

6. currentIndicator = { placement: { ...position, currentNode }, error }
   return currentIndicator
```

### `isNearBorders(domInfo, x, y)` — axis-aware

Khi cursor sát mép parent, user nhiều khả năng muốn drop làm **sibling của parent** chứ không phải drop vào trong. craft.js gọi đây là "border escape".

Mép nào tính là escape?
- Nếu `inFlow === true` (parent stack children theo column) → top/bottom là escape, left/right không
- Nếu `inFlow === false` (parent stack theo row) → left/right là escape

`inFlow` lấy từ `getDOMInfo`:
```js
const cs = getComputedStyle(el)
inFlow = cs.flexDirection === 'column' || cs.display !== 'flex'  // simplified
```

`BORDER_OFFSET = 40` px. Cursor cách mép > 40 px → coi như muốn drop INTO.

Vì sao axis-aware: drop sát top của cột 1 → user muốn drop vào cột 1 ở vị trí đầu, không phải drop trên row container. Trước fix axis-aware: cứ sát mép là escape, gây UX khó chịu "drop chạy lên ngoài".

### `findPosition` — quyết định index + where

```js
// pseudo
for each child in childDims:
  distance = distanceToCenter(child, x, y)
  if (closest > distance) closest = child, idx = i

// sau khi tìm closest child, xem cursor ở nửa trên/dưới (column) hoặc trái/phải (row)
where = (cursor < child.center) ? 'before' : 'after'
```

Edge cases:
- Parent rỗng → `position = { index: 0, where: 'before' }`
- Cursor ngoài tất cả children (vd parent có 1 child ở top, cursor ở giữa parent) → child duy nhất là closest, where='after'

### Indicator caching

```js
isDiff(newPosition) {
  return !currentIndicator
    || currentIndicator.placement.parent.id !== newPosition.parent.id
    || currentIndicator.placement.index !== newPosition.index
    || currentIndicator.placement.where !== newPosition.where
}
```

Nếu position không đổi, `computeIndicator` return `undefined` → `setIndicator` không bị gọi → store không notify → overlay không re-render. Tránh thrash.

### Cleanup

```js
cleanup() {
  window.removeEventListener('scroll', this.onScrollListener, true)
  window.removeEventListener('dragover', preventDefault, false)
}
```

Gọi từ `endDrag`. Quan trọng: nếu không cleanup, listener window `preventDefault` còn tồn → mọi drag-drop sau (kể cả ở phần khác app) bị browser allow drop, UX kỳ.

## 5. IndicatorOverlay component

`src/components/editor_v2/elements/IndicatorOverlay.vue`:

```js
computed: {
  indicator() { return useNodeStore().events.indicator },
  rect() {
    const ind = this.indicator
    if (!ind || ind.error) return null
    const target = ind.placement.currentNode?.dom
    if (target) return target.getBoundingClientRect()
    // fallback: cuối parent
    return ind.placement.parent.dom.getBoundingClientRect()
  },
  show() {
    const ind = this.indicator
    if (!ind || ind.error) return false
    // Ẩn nếu target container EMPTY — vì placeholder của container đã đủ hint
    if (ind.placement.parent.data.nodes.length === 0) return false
    return true
  },
  style() {
    if (!this.rect) return {}
    const isAfter = this.indicator.placement.where === 'after'
    return {
      position: 'fixed',
      left: this.rect.left + 'px',
      top: (isAfter ? this.rect.bottom : this.rect.top) + 'px',
      width: this.rect.width + 'px',
      height: '2px',
      background: '#3F8DFF',
      zIndex: 10000,
    }
  }
}
```

Teleport vào body để không bị clip bởi overflow của canvas.

## 6. Auto-scroll khi drag

`PageWrapper.mounted` cài listener `dragover` cấp document:

```js
this._onDocumentDragOver = (e) => {
  const dndStore = useDndStore()
  if (!dndStore.dragTarget) return
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

Gradient `1 - fromTop/ZONE` → càng gần mép càng scroll nhanh. Không phải Vue re-render, chỉ mutate `scrollTop`.

`beforeUnmount` remove listener.

## 7. Common gotchas

### Drop outside canvas vẫn apply

**Symptom:** Drag từ sidebar, nhả chuột ngoài cửa sổ → element vẫn được tạo.

**Cause:** Positioner cài window dragover preventDefault → browser cho drop ở mọi đâu → dragend fire với indicator còn nguyên từ lần dragover cuối trong canvas.

**Fix:** `endDrag(e)` check `dropInsideCanvas` bằng `e.clientX/Y` vs `.wk-editor-body` rect. Out → chỉ cleanup không apply.

### Drag child chọn parent

**Symptom:** Drag Heading → ElementToolbar hiện trên Block.

**Cause:** dragstart bubble từ Heading lên Block. Block's handler chạy sau, `setSelected(blockId)` overwrite.

**Fix:** `e.stopPropagation()` đầu `onMoveDragStart`.

### Border-top doubled khi drop-active

**Symptom:** Empty container có border dashed của placeholder + thêm vạch indicator top → 2 đường chồng lên.

**Fix:** `IndicatorOverlay.show` ẩn khi `parent.data.nodes.length === 0` (placeholder đã đủ thông tin).

### Drag flex-section vào flex-block không bị chặn ở UI

**Symptom:** Section to xanh khi hover Block (sai), nhả mới chặn ở store.

**Fix:** Positioner `isDraggingRootOnly()` đẩy target về ROOT ngay → indicator không trỏ vào Block. Store còn 1 lớp safety nữa.
