---
sidebar_position: 4
title: 03 — Drag & Drop
---

# 03 — Drag & Drop từng bước

Kéo thả là phần nhiều "phép thuật" nhất của editor. Chương này bám theo đúng thứ tự sự kiện.

---

## 1. Hai loại kéo, một đường ống

| | Kéo tạo mới (`'new'`) | Kéo di chuyển (`'existing'`) |
|---|---|---|
| Bắt đầu từ | Item trong picker trái (bọc bởi `ElementDragV2`) | Node trên canvas, hoặc tay cầm ⠿ của `ElementToolbar` |
| `dragTarget` | `{ type:'new', tree }` | `{ type:'existing', nodes:[id] }` |
| Kết thúc bằng | `nodeStore.addNodeTree(...)` | `nodeStore.move(...)` |

Ở giữa, **cả hai dùng chung** `Positioner` → `indicator` → `dnd.endDrag()`. Vì vậy chỉ cần hiểu một đường ống.

---

## 2. Đường đi của người dùng đến nút kéo

Sidebar trái có **ba cấp**:

```
Toolbar.vue (tool rail 60px)         Sidebar.vue (300px)        PickerWrapper.vue (240px)
 Section · Elements · Store ·   →     Elements.vue / Store.vue  →  ElementsLayoutPicker
 Style · Add-on · Layer ·             / Layer.vue / Pages.vue      ProductTitlePicker
 Pages · Settings · Shortcuts                                      …
        ↓ ui.toolbarKeyActive              ↓ ui.leftSidebarKeyActive
```

- `Toolbar.vue` set `ui.toolbarKeyActive` và reset `leftSidebarKeyActive`.
- `Sidebar.vue` chọn component nội dung theo `toolbarKeyActive` (`elements` / `store` / `layer` / `pages`).
- `PickerWrapper.vue` mở panel cấp 3 theo `leftSidebarKeyActive` — 14 picker element + 16 picker store.

Mỗi item kéo được bọc bởi `ElementDragV2`:

```vue
<ElementDragV2 :tree="buildProductTitle" :width="216" :height="100">
  <span>Product Title</span>
</ElementDragV2>
```

Prop `tree` nhận **object `NodeTree` hoặc hàm trả về `NodeTree`**. Dùng hàm là chuẩn — cây phải được tạo *tại thời điểm kéo* để mỗi lần kéo sinh id mới.

---

## 3. `dragstart` — mở phiên kéo

### 3.1 Từ picker (tạo mới)

`ElementDragV2` gắn listener DOM thật (không dùng `@dragstart` của Vue) trong `mounted`:

```js
el.setAttribute('draggable', 'true')

_onDragStart(e) {
  e.stopPropagation()
  const tree = typeof this.tree === 'function' ? this.tree() : this.tree
  if (!tree?.rootNodeId || !tree?.nodes) return              // kèm console.warn
  const shadow = createDomShadow(e, e.currentTarget)         // ảnh ma bám con trỏ
  useDndStore().startCreate(tree, shadow)
  document.body.classList.add('wk-dragging')
}
```

> `.element-drag-v2` **không được** dùng `display: contents` — HTML5 drag cần một hộp DOM thật.

### 3.2 Từ canvas (di chuyển)

Mixin `draggableNode` (`composable/editor_v2/draggableNode.js`):

```js
onMoveDragStart(e) {
  if (this.isEditing || getDef(type)?.rules?.locked) { e.preventDefault(); e.stopPropagation(); return }
  e.stopPropagation()            // ← CỰC KỲ QUAN TRỌNG
  nodeStore.setSelected(this.nodeId)
  dndStore.startMove(this.nodeId, createShadow(e, label))
  e.dataTransfer.effectAllowed = 'move'
  document.body.classList.add('wk-dragging')
}
```

`e.stopPropagation()` ở đây không phải cho đẹp: trình duyệt chọn **draggable trong cùng** làm nguồn kéo, nhưng event **vẫn bubble lên**. Không chặn thì kéo một `flex-block` sẽ khiến `flex-section` ông nội cũng chạy `onMoveDragStart` và ghi đè id trong store — kết quả là kéo nhầm cả section.

### 3.3 `dnd.startCreate` / `startMove` làm gì

```js
startCreate(tree, shadowEl) {
  this.dragTarget = { type: 'new', tree }
  this.setDraggedShadow(shadowEl)
  this.setPositioner(new Positioner(useNodeStore(), this.dragTarget))
}

startMove(nodeId, shadowEl) {
  this.dragTarget = { type: 'existing', nodes: [nodeId] }
  this.setDraggedShadow(shadowEl)
  nodeStore.setNodeEvent('dragged', [nodeId])
  this.setPositioner(new Positioner(useNodeStore(), this.dragTarget))
}
```

Constructor của `Positioner` đăng ký hai listener toàn cục:

```js
window.addEventListener('scroll', this.onScrollListener, true)   // cuộn ⇒ xóa cache kích thước con
window.addEventListener('dragover', e => e.preventDefault(), false) // cho phép thả ở mọi nơi
```

---

## 4. `dragover` — tính chỗ thả (chạy liên tục)

Container nào dùng `nodeContainer` đều có `dropListeners`:

```js
onDragOver(e) {
  if (!dndStore.positioner) return
  e.preventDefault(); e.stopPropagation()
  const indicator = dndStore.positioner.computeIndicator(
    this.nodeId, e.clientX, e.clientY, e.currentTarget)
  if (indicator) useNodeStore().setIndicator(indicator)
}
```

### 4.1 Thuật toán `computeIndicator` — 6 bước

```
computeIndicator(dropTargetId, x, y, dropTargetDom)

BƯỚC 1 — Nguồn kéo có phải root-only không?
  isDraggingRootOnly() (vd flex-section)
    → LUÔN chọn ROOT làm cha, bỏ qua vị trí con trỏ.
      Section là phần tử cấp trang, không bao giờ lồng vào node khác.
  Ngược lại → getCanvasAncestor(dropTargetId):
      leo lên cho tới node đầu tiên có data.isCanvas === true.
      (node lá không chứa được con → cha thật sự là container gần nhất)

BƯỚC 2 — Kiểm tra "vùng viền" (escape zone)
  isNearBorders(getDOMInfo(parentDom), x, y)
    inFlow  (cha xếp con theo chiều dọc)  → chỉ mép TRÊN/DƯỚI là vùng thoát
    !inFlow (cha là flex-row / grid)      → chỉ mép TRÁI/PHẢI là vùng thoát
    offset = min(BORDER_OFFSET=16, span * 0.2)
  Trúng vùng viền ⇒ nhảy lên cha của cha ("thả làm anh em", không "thả vào trong").

  Vì sao chặn ở 20%? Nếu cứ dùng cứng 16px, một FlexBlock cao <80px sẽ toàn
  là vùng thoát và mọi cú thả đều bật lên section cha.

BƯỚC 3 — Đo kích thước các con
  getChildDimensions(parent, parentDom) → [{ id, ...getDOMInfo(dom) }]
  Có cache theo (currentTargetId, currentTargetDom); cuộn trang thì xóa cache.

BƯỚC 4 — findPosition(parent, dims, x, y) → { index, where: 'before' | 'after' }
  Con inFlow  : so sánh y với TÂM DỌC của con
  Con !inFlow : so sánh x với TÂM NGANG, kèm xLimit/yLimit/leftLimit
                để đi đúng theo hàng (wrap) chứ không nhảy lung tung.

BƯỚC 5 — isDiff(position)?
  Trùng chỗ cũ ⇒ return sớm, không gây re-render vô ích.

BƯỚC 6 — Kiểm tra hợp lệ: query.node(parent).isDroppable(draggedNodes, onError)
  ① Nguồn là root-only mà cha không phải ROOT
       → "X can only live at the page root"
  ② Cha có rules.nodeChildAllows và type nguồn không nằm trong đó
       → "Allowed drop: LIST-ITEM"

⇒ currentIndicator = { placement: { parent, index, where, currentNode }, error }
```

### 4.2 `indicator` được vẽ ra sao

`nodeStore.events.indicator` được `IndicatorOverlay.vue` đọc và vẽ một vạch định vị. Đồng thời mọi `nodeContainer` có `isDropTarget === true` (khi `indicator.placement.parent.id === nodeId`) sẽ nhận class `wk-drop-active` → nền xanh nhạt.

Nếu drop target là container **rỗng**, vạch định vị bị nén lại: viền placeholder đã đủ để chỉ chỗ, chồng thêm vạch nữa nhìn như đường kẻ đôi.

### 4.3 Tự cuộn canvas

`PageWrapper` gắn `dragover` ở cấp `document`:

```js
ZONE = 60px, SPEED = 14px
con trỏ cách mép trên  < 60 → canvas.scrollTop -= SPEED * cường độ
con trỏ cách mép dưới  < 60 → canvas.scrollTop += SPEED * cường độ
```

Nhờ vậy thả được vào vùng nằm ngoài màn hình mà không phải cuộn tay trước.

---

## 5. `dragend` — chốt kết quả

`dnd.endDrag(e)`:

```
① Ghi nhớ dropNodeIndex = positioner.currentTargetDom['data-node-index'] || 0

② Có thả trong canvas không?
     so tọa độ con trỏ với rect của .wk-editor-body
     (Positioner cho preventDefault trên toàn window, nên vẫn có thể nhả
      chuột ngoài canvas mà indicator cũ vẫn còn — chốt chặn nằm ở đây)

③ Có indicator và indicator.error rỗng:
     'new'      → index = placement.index + (where === 'after' ? 1 : 0)
                  nodeStore.addNodeTree(tree, placement.parent.id, index)
     'existing' → nodeStore.move(movedId, parentId, index)

④ Dọn dẹp: gỡ shadow (gọi el._cleanup nếu có), positioner.cleanup(),
   dragTarget = null, setIndicator(null), setNodeEvent('dragged', null)

⑤ Sau nextTick: selectionAnchorEl = node.doms[dropNodeIndex]
   → toolbar/overlay bám đúng bản render vừa thả

⑥ setSelected(droppedNodeId) + uiStore.setToolbarActive('layer')
   (thả xong là sidebar nhảy sang Layers)
```

---

## 6. Auto-wrap: thả thẳng vào ROOT

ROOT chỉ chứa **element root-only** (thực tế: `flex-section`). Thả một Heading thẳng vào trang thì:

```js
// addNodeTree
const treeToInsert = parentIsRoot && !treeRootIsRootOnly
  ? wrapInBlankSection(tree)   // tạo flex-section rỗng, nhét tree vào trong
  : tree
```

`move()` cũng có nhánh tương ứng: kéo một node lên cấp trang sẽ tự sinh section bọc quanh.

Kết quả: người dùng không bao giờ tạo được node lơ lửng ngoài section.

---

## 7. Toàn bộ luật chặn thả

| Luật | Khai ở đâu | Chặn ở đâu |
|---|---|---|
| Chỉ sống ở cấp trang | `meta.rules.isRootOnly` | `Positioner.isDroppable`, `move`, `addNodeTree` |
| Cha giới hạn loại con | `meta.rules.nodeChildAllows: ['list-item']` | `getNodeChildAllows` → `isDroppable`, `move`, `addNodeTree` |
| Node cấu trúc, không kéo/xóa riêng | `meta.rules.locked` | `move`, `remove`, `duplicate`, `onMoveDragStart`, `nodeAttrs.draggable` |
| Luật tự do theo cha | `meta.rules.canDropInto(parentType)` | helper `canDropInto` |
| Không thả vào chính mình / con cháu | — | `move` kiểm tra vòng lặp |
| Không thả khi đang inline-edit | — | `onMoveDragStart` kiểm tra `isEditing` |

`move()` còn có chốt "cùng chỗ thì thôi": nếu node được thả về đúng vị trí cũ, hàm return sớm để không tạo entry history vô nghĩa.

---

## 8. Cây dựng sẵn (composite)

`ElementDragV2` nhận `NodeTree`, nên một item picker có thể tạo **cả một cụm node**:

| Helper | File | Sinh ra |
|---|---|---|
| `buildElement(type, overrides)` | `nodeFactory.js` | 1 node từ factory của registry |
| `buildBlankSection()` | `nodeFactory.js` | `flex-section` rỗng |
| `buildRowSection(n)` | `nodeFactory.js` | `flex-block` chứa n cột (n≤1 → 1 block) |
| `buildNestedRowSection()` | `nodeFactory.js` | bố cục lồng nhiều tầng dựng sẵn |
| `createNodeTree(def)` | `createNode.js` | Cây bất kỳ từ def JSON |
| `singleDatasetDataDef()` / `multiDatasetDataDef()` | `data/editor_v2/dataset.js` | Thẻ sản phẩm / collection đầy đủ ([chương 11](./11-dataset-binding.md)) |

`createNodeTree(def)` là **hợp đồng chuẩn** — cùng một def dùng được cho DnD, template và AI page-gen. Shape:

```js
{ type, name?, style?, config?, specials?, events?, bindings?,
  states?, isCanvas?, hidden?, custom?, satellite?, children?: [ …def ] }
```

Trong lúc đi cây, `createNodeTree` còn tự dựng **satellite** cho những type có khai `meta.satellite`, và gán id satellite vào `config[configKey]` của owner.

---

## 9. Bảng debug nhanh

| Triệu chứng | Kiểm tra |
|---|---|
| Kéo không thấy vạch định vị | Container gốc có mixin `nodeContainer` chưa? Có bind `dropListeners` vào `v-on` chưa? |
| Kéo con lại chọn nhầm cha | Thiếu `e.stopPropagation()` trong `dragstart`, hoặc `draggable` bị gán sai thẻ |
| Luôn thả ra ngoài container | Container quá nhỏ → toàn vùng viền; xem lại `isNearBorders` và chiều cao thật của nó |
| Thả xong không có gì xuất hiện | `indicator.error` có giá trị (xem `nodeStore.events.indicator`), hoặc `nodeChildAllows` chặn |
| Node lơ lửng ngoài section | Đang gọi `addNodeTree` với `parentId` khác ROOT nên không kích hoạt auto-wrap |
| Kéo item picker mà `tree` rỗng | Prop `tree` truyền object cố định thay vì hàm → id trùng nhau giữa các lần kéo |
