---
sidebar_position: 5
title: 04 — Selection, Toolbar, Edge Overlays, Layers
---

# 04 — Overlay & Chrome

Tất cả phần giao diện *bao quanh* canvas: khung chọn, khung hover, toolbar nổi, dải padding/margin, vạch định vị, Layers panel và sidebar trái.

---

## 1. Nguyên tắc chung: overlay là lớp phủ, không phải CSS của node

Trước đây khung chọn được vẽ bằng `::after` trên chính element. Bây giờ **không còn**: mỗi loại highlight là **một** component duy nhất, `Teleport` ra `<body>` từ `PageWrapper`, rồi tự "nhảy" tới node mục tiêu.

```html
<Teleport to="body">
  <NodeHoverOverlay />      <!-- viền 1px khi rê chuột -->
  <NodeSelectedOverlay />   <!-- viền 2px khi đang chọn -->
  <IndicatorOverlay />      <!-- vạch xanh chỗ sắp thả -->
  <EdgeOverlays />          <!-- dải padding/margin kéo được -->
  <ElementToolbar />        <!-- toolbar nổi phía trên node -->
</Teleport>
```

Lý do đổi: element SFC không phải mang theo CSS chrome, và một node render thành nhiều bản (`doms`) vẫn chỉ có **một** khung chọn — bám đúng bản người dùng vừa click.

### 1.1 Cơ chế bám vị trí

Cả 3 overlay bám node (`NodeHoverOverlay`, `NodeSelectedOverlay`, `ElementToolbar`) dùng chung mẫu:

1. Xác định element mục tiêu:
   - `uiStore.selectionAnchorEl` nếu có (element **đúng bản** vừa được click),
   - ngược lại `node.dom`.
2. `getBoundingClientRect()` → lưu vào `data.rect`.
3. Chạy vòng `requestAnimationFrame` **chỉ khi overlay đang hiển thị**; dừng ngay khi ẩn.
4. Thêm listener `scroll` ở **capture mode** (`true`) để bắt cả cuộn của container bên trong canvas mà không cần từng container tự đăng ký.

`selectionAnchorEl` đến từ đâu:

```js
// nodeBase.onClick
this.setSelected(this.nodeId)                                    // ① xoá anchor
useUIStore().setStateField('selectionAnchorEl', markRaw(e.currentTarget)) // ② gán lại
```

Thứ tự này quan trọng: `setSelected` **luôn xóa** anchor. Chọn node qua Layers hoặc qua DnD thì anchor để trống → overlay rơi về `node.dom` (bản số 0). Chọn bằng click trên canvas thì anchor trỏ đúng bản đã click.

---

## 2. Selection state

Nằm trong `nodeStore.events`:

```js
events: {
  selected: [],      // mảng — hiện tại UX single-select, mảng để dành cho multi-select
  hovered:  null,
  dragged:  [],
  indicator: null,   // { placement: { parent, index, where, currentNode }, error }
  state:    null,    // State đang chọn trong trait panel (hover/active), null = base
}
```

`setSelected(id)` làm 3 việc:

```js
this.events.selected = id ? [id] : []
this.events.state = getDef(nodes[id]?.data?.type)?.states?.base || null   // reset về base
useUIStore().selectionAnchorEl = null
```

`clearSelected()` tương tự nhưng luôn về rỗng.

Sau khi chọn node, `EditorV2.vue` có watcher đẩy sidebar trái sang tab Layers:

```js
watch: { selectedNode() { useUIStore().setToolbarActive('layer') } }
```

---

## 3. `ElementToolbar` — toolbar nổi

Vị trí: `fixed`, ngay phía trên rect của node (`top - TOOLBAR_HEIGHT - GAP`, kẹp `>= 0`).

Nội dung có hai chế độ:

```
isEditText === true  →  <EditTextToolbar>   (B / I / U / S / màu chữ — xem chương 13)
isEditText === false →  [⠿ Nhãn] │ Ungroup? · Duplicate? · Delete? · More
```

| Nút | Hiện khi |
|---|---|
| Tay cầm ⠿ + nhãn | Luôn hiện. `draggable="false"` nếu node `locked` |
| Ungroup | `type === 'flex-block'` |
| Duplicate / Delete | `canMutate` — node đích không `locked` |
| More | Luôn hiện |

Toolbar **không** render trên `ROOT` và không render nếu node đang `hidden`.

### 3.1 Nhãn hiển thị

```js
typeLabel = mapNodeBindings(selectedNode)?.label   // node có binding → "Product title", "Add to cart"…
         || nodeDef.label                          // nhãn trong meta
         || node.data.type
```

### 3.2 `meta.rules.toolbarTarget` — chuyển hướng hành động

Một số node cấu trúc cần **hiện toolbar cho chính nó** nhưng **duplicate/delete phải tác động lên node khác**. Ví dụ: chọn nút của một tab (`tab-item`) thì Delete phải xóa cả tab, không phải mỗi cái nút.

```js
// nodes/tab_item/index.vue
const toolbarTarget = (node, nodes) => { /* → id của tab owner */ }
meta.rules = { ...baseMeta.rules, toolbarTarget }
```

`ElementToolbar` resolve:

```js
actionTargetId = getDef(type)?.rules?.toolbarTarget?.(node, nodes) ?? selectedId
canMutate      = actionTargetNode && !getDef(actionTargetNode.type)?.rules?.locked
```

### 3.3 Tay cầm kéo

```js
onHandleDragStart(e) {
  if (this.isLocked) return
  // Cố ý dùng selectedNode.dom (bản 1), KHÔNG dùng anchorEl:
  // kéo là kéo node logic, không phải bản sao vừa click. Đừng "sửa" chỗ này.
  dndStore.startMove(this.selectedId, createShadow(e, this.typeLabel))
}
```

Từ đây trở đi luồng giống hệt kéo trên canvas ([chương 03](./03-drag-drop.md)).

---

## 4. `EdgeOverlays` — dải padding & margin

Bốn dải quanh node đang chọn; kéo dải để chỉnh `padding` / `margin` trực tiếp trên canvas, có mũi tên hai đầu và một pill hiện số px ở giữa.

Điều khiển bằng `meta.rules.edgeOverlay`:

| Giá trị | Nghĩa |
|---|---|
| `true` / không khai | Bật đủ padding + margin |
| `false` | Tắt hoàn toàn |
| `{ padding: false }` | Chỉ còn margin (dùng nhiều cho element text/dataset) |
| `{ margin: false }` | Chỉ còn padding |
| `{ marginSides: { top, bottom, left, right } }` | Bật/tắt từng cạnh |

Ghi giá trị qua `parseSides` / `formatSides` (`cssShorthand.js`) rồi `changeStyle` với coalesce — kéo liên tục chỉ tạo **một** entry undo (xem [chương 10](./10-history.md)).

---

## 5. `IndicatorOverlay` — vạch định vị lúc kéo

Đọc `nodeStore.events.indicator` rồi vẽ vạch tại vị trí sắp chèn. Chi tiết cách `indicator` được tính: [chương 03 §4](./03-drag-drop.md).

Hai điều chỉnh nhỏ đáng biết:

- Nó cố ý phụ thuộc `breakpointActive` để Vue tính lại rect DOM khi canvas đổi kích thước.
- Khi drop target là **container rỗng**, vạch bị nén: viền của placeholder đã là chỉ dẫn đủ rõ, vẽ chồng nữa trông như đường kẻ đôi.

---

## 6. Layers panel

Đường đi: tool rail → `Layer` → `Sidebar.vue` render `components/toolbar/Layer.vue`.

```
SidebarWrapper "Page contents"
 ├─ LayerGroupWrapper "Header"   (chỗ dành sẵn)
 ├─ LayerGroupWrapper "Body"
 │    └─ LayerItem v-for childId in nodes.ROOT.data.nodes  (depth 0)
 │          └─ LayerItem đệ quy cho các con
 └─ LayerGroupWrapper "Footer"   (chỗ dành sẵn)
```

`LayerItem` cung cấp:

- Thụt lề theo `depth * 20px`.
- Mũi tên xổ khi node có con.
- Click → `setSelected`; hover → `events.hovered`.
- **Kéo thả sắp xếp ngay trong panel**: `dragstart / dragover / dragleave / drop`, với 3 kiểu chỉ báo `before` / `after` / `inside`.
- `draggable = !isLocked`.
- Nhãn và icon lấy từ registry (`meta.label`, `meta.icon`) hoặc từ `mapNodeBindings` với node có binding.

Node có `meta.rules.hideInLayer` (ví dụ `root_canvas`) không xuất hiện. Satellite **không bao giờ** xuất hiện vì không nằm trong `data.nodes`.

---

## 7. Sidebar trái — ba cấp

```
┌──────┬──────────────┬──────────────┐
│ 60px │    300px     │    240px     │
│ tool │  Sidebar.vue │ PickerWrapper│
│ rail │              │  (fixed)     │
└──────┴──────────────┴──────────────┘
   ↓          ↓               ↓
toolbarKeyActive        leftSidebarKeyActive
```

**Cấp 1 — `Toolbar.vue`** (9 mục): `section`, `elements`, `store`, `style`, `addon`, `layer`, `pages` ở trên; `setting`, `shortcuts` ở dưới.

**Cấp 2 — `Sidebar.vue`** chọn nội dung:

| `toolbarKeyActive` | Component |
|---|---|
| `elements` | `components/toolbar/Elements.vue` |
| `store` | `components/toolbar/Store.vue` |
| `layer` | `components/toolbar/Layer.vue` |
| `pages` | `components/toolbar/Pages.vue` |

**Cấp 3 — `PickerWrapper.vue`** mở panel kéo thả theo `leftSidebarKeyActive`:

- Nhóm `elements` (14): layout, heading, text, button, icon, list, tab, image, image-comparison, breadcrumb, text-marquee, google-map, accordion, video.
- Nhóm `store` (16): product-media, product-title, product-vendor, product-price, product-description, product-quantity, product-variants, product, product-list, add-to-cart, dynamic-checkout, collection, collection-media, collection-title, collection-description, collection-list.

Thêm một mục mới ⇒ sửa **ba** file: `Toolbar.vue` (nếu là cấp 1), component cấp 2 tương ứng, và `PickerWrapper.vue`.

---

## 8. Trait panel (bên phải)

Panel `301px` cố định bên phải, `Trait.vue`. Nội dung sinh hoàn toàn từ `meta.traits` — xem [chương 07](./07-traits-and-data.md).

Bố cục có tính thích ứng, khai trong `views/EditorV2.vue`:

| Bề rộng | Hành vi |
|---|---|
| > 1280px | Trait `position: fixed` bên phải; body chừa `padding-right: 300px` |
| ≤ 1280px | Trait rơi vào luồng, xếp **dưới** Sidebar, hai panel chia đôi chiều cao cột |
| < 640px | Ẩn hết tool rail + sidebar + trait. Một lớp `.editor-v2-mobile-blocker` trong suốt chặn mọi pointer dưới header → canvas chỉ để xem. Kèm `WkAlert` cảnh báo (đóng được) |

---

## 9. `settingDialogs` — popover dùng chung

`useUIStore` giữ một stack dialog:

```js
toggleDialogVis(e, type, data)  // mở/đóng theo type, vị trí lấy từ rect của nút bấm
closeDialog(type)
setDialogPosition(type, position)
settingDialogs: [ { type, position: { x, y }, data } ]
```

`SettingDialog.vue` render toàn bộ stack. Nhờ vậy trait widget chỉ cần gọi `toggleDialogVis` chứ không phải tự quản lý popover riêng.

> ⚠️ Popover của `webcake-ui-kit` (WkDropdown / WkMenu) portal ở z-index ~1001, thấp hơn `--wk-z-sidebar-wrapper` (1100). Mở trong vùng sidebar trái sẽ bị che — phải nâng z-index thủ công.

---

## 10. Bảng debug nhanh

| Triệu chứng | Kiểm tra |
|---|---|
| Khung chọn lệch khỏi element | `ref="root"` gắn đúng thẻ gốc chưa; node render nhiều bản mà thiếu `nodeIndex` |
| Khung chọn bám sai bản sao | `onClick` không lưu `selectionAnchorEl`, hoặc code gọi `setSelected` sau khi đã gán anchor |
| Toolbar không hiện | Node là `ROOT`, hoặc `config.hidden` đang bật |
| Duplicate xóa nhầm node | Xem lại `meta.rules.toolbarTarget` |
| Dải padding không hiện | `meta.rules.edgeOverlay` đang là `false` hoặc `{ padding: false }` |
| Node lạ hiện trong Layers | Thiếu `meta.rules.hideInLayer`, hoặc satellite bị đẩy nhầm vào `data.nodes` |
