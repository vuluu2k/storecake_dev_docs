---
sidebar_position: 9
title: 08 — Glossary
---

# 08 — Glossary

Tra cứu nhanh mọi thuật ngữ xuất hiện trong code Editor V2.

---

## 1. Khái niệm nền

| Thuật ngữ | Nghĩa | Ở đâu |
|---|---|---|
| **Node** | Một phần tử trên canvas: `{ id, data, dom, doms, events }` | `createNode.js` |
| **NodeTree** | `{ rootNodeId, nodes }` — cụm node chưa gắn vào cây | `createNodeTree`, `nodeFactory.js` |
| **Def** | Mô tả JSON của một node/cụm node: `{ type, style?, config?, children?, … }` | `createNodeTree(def)`, `data/editor_v2/*` |
| **ROOT** | Id node gốc, hằng `'ROOT'` | `constants.js` |
| **Element folder** | `nodes/<name>/{index.vue, meta.js, ai.js?}` | auto-register |
| **Meta** | Dữ liệu thuần mô tả element | `meta.js` |
| **Registry** | Map `type → { ...meta, factory, defaults, allowedKeys, renderers, statefulKeys, component }` | `registry.js` |
| **Factory** | Hàm tạo node mới của một type; được registry **bọc** thêm lớp điền `defaults` | `meta.factory` |
| **Mixin** | `nodeBase` · `nodeLeaf` · `nodeContainer` · `draggableNode` · `editableText` · `satelliteOwner` · `statefulNode` · `dataset` | `mixins/` |

---

## 2. Namespace dữ liệu

| Thuật ngữ | Nghĩa |
|---|---|
| **`style`** | Thuộc tính CSS / CSS var; có responsive; có state override |
| **`config`** | Dữ liệu không phải CSS nhưng đổi theo màn hình; có responsive; có state override |
| **`specials`** | Thuộc tính HTML / metadata (`text`, `htmlTag`, `className`, `customCss`); **base-only** |
| **`events`** | Mảng hành vi `[{ id, name, action, … }]`; base-only |
| **`bindings`** | Mảng nối dữ liệu `[{ id, target: { type, id, kind\|action } }]`; base-only |
| **`states`** | Namespace override theo trạng thái: `states[state] = { style, config }` |
| **`responsive`** | `responsive[bp] = { style, config, states? }` |
| **`custom`** | Túi dữ liệu tự do, không có ràng buộc |

---

## 3. Trait

| Thuật ngữ | Nghĩa |
|---|---|
| **Trait definition** | Một entry trong `DEFINITIONS_DATA`: `{ writes: { writeKey: { target, schema } } }` |
| **defKey / trait key** | Khóa `snake_case` của định nghĩa (`width_select`, `bg_image`) — dùng trong `meta.traits.attributes` |
| **writeKey** | Khóa **thật sự** ghi vào `node.data` (`--node-width`, `htmlTag`, `padding`) |
| **`writes` map** | Cho phép một widget ghi nhiều key, thậm chí khác namespace |
| **`target`** | `'style' | 'config' | 'specials'` — namespace mà writeKey rơi vào |
| **Group** | Một khối trong panel: `{ key, label, attributes, visible?, stateful?, keepInState?, state? }` |
| **`group: 'more'`** | Attribute bị giấu sau nút *Show more* |
| **`allowedKeys`** | `Set` writeKey hợp lệ theo (type, namespace), tính sẵn từ `meta.traits` |
| **`renderers`** | Mảng `(node) → object CSS` tính sẵn theo thứ tự khai báo trait |
| **`statefulKeys`** | `Set` writeKey được phép lưu theo state |
| **`STRIP_INLINE_KEYS`** | 3 key typography khiến inline mark trong text bị xóa: `textGlobalStyle`, `--text-color`, `--text-style` |
| **TRAIT / TARGET** | Enum hằng chuỗi, `fields/enum.js` — nguồn gốc duy nhất |

---

## 4. Responsive & state

| Thuật ngữ | Nghĩa |
|---|---|
| **Breakpoint** | `'desktop' 1920` · `'laptop' 1440` · `'tablet' 768` · `'mobile' 360`; mặc định `laptop` |
| **Slot** | Ô lưu theo breakpoint: `data.responsive[bp]` |
| **`STYLE_ASYNC` / `CONFIG_ASYNC`** | Danh sách key **mặc định** ghi vào slot breakpoint hiện tại |
| **Sentinel slot** | `'base'` → `data.style`; `'current'` → slot bp đang xem; tên bp cụ thể → slot đó |
| **Cascade** | Desktop-first hai pha: xuống (bp rộng hơn) rồi fallback lên (bp hẹp hơn, chỉ điền key thiếu) |
| **`NON_CASCADING`** | Key không kế thừa qua breakpoint — hiện chỉ có `config.hidden` |
| **State / Variant** | `meta.states = { base, variants: [{ value, label, selector, visible? }] }` |
| **`stateful: true`** | Cờ ở group cho phép ghi theo state; `stateful: false` ở attribute để từ chối |
| **`keepInState`** | Group vẫn hiện khi đang ở state khác base, dù không stateful |
| **`_routeState`** | Hàm trong node store chuyển hướng writeKey stateful sang `states[st][ns]` |
| **`mergeNamespace`** | Cascade một namespace theo bp |
| **`mergeStateNs`** | Cascade override của một state theo bp |
| **`mergeStateMap`** | Union phẳng style+config của một state — dùng để biết state đó đổi key nào |
| **`mergeStateNode`** | Node tổng hợp với state đã gộp vào style/config — để renderer chạy như bình thường |

---

## 5. Cây & node đặc biệt

| Thuật ngữ | Nghĩa |
|---|---|
| **Satellite** | Node có `parent` nhưng **không** nằm trong `parent.data.nodes` → vô hình với Layers/DnD; id lưu ở `config[configKey]` |
| **Locked** | `rules.locked` — không xóa/nhân bản/kéo riêng, chỉ đi theo owner |
| **`hideInLayer`** | Không hiện trong Layers panel |
| **`isRootOnly`** | Chỉ sống trực tiếp dưới ROOT (element cấp trang) |
| **`nodeChildAllows`** | Whitelist type con của một container |
| **`canDropInto(parentType)`** | Luật thả tự do do element tự quyết |
| **`isContentEditable`** | Bật inline-edit bằng Tiptap |
| **`edgeOverlay`** | Bật/tắt dải padding-margin kéo được |
| **`toolbarTarget(node, nodes)`** | Chuyển hướng Duplicate/Delete sang node khác |
| **`isCanvas`** | Node chứa được con — Positioner leo tìm tổ tiên `isCanvas` gần nhất |
| **Auto-wrap** | Thả node non-section vào ROOT → tự bọc `flex-section` (`wrapInBlankSection`) |
| **Clone** | Bản render thêm của cùng một node (`isClone`, `nodeIndex`, `node.doms[i]`) |

---

## 6. Kéo thả

| Thuật ngữ | Nghĩa |
|---|---|
| **`dragTarget`** | `{ type:'new', tree }` hoặc `{ type:'existing', nodes:[id] }` |
| **Positioner** | Class tính vị trí thả; `computeIndicator(dropTargetId, x, y, dom)` |
| **Indicator** | `{ placement: { parent, index, where, currentNode }, error }` |
| **`where`** | `'before' | 'after'` — chèn trước hay sau con thứ `index` |
| **`inFlow`** | Con xếp theo chiều dọc (`getDOMInfo`) — quyết định mép nào là "vùng thoát" |
| **`BORDER_OFFSET`** | 16px; thực dùng `min(16, span * 0.2)` |
| **Escape zone** | Vùng sát mép container ⇒ thả làm anh em thay vì thả vào trong |
| **Shadow** | Ảnh ma bám con trỏ (`createShadow` / `createDomShadow`) |
| **`wk-dragging`** | Class trên `<body>` trong lúc kéo |
| **`wk-drop-active`** | Class trên container đang là drop target |

---

## 7. Dataset & binding

| Thuật ngữ | Nghĩa |
|---|---|
| **`target.type`** | `'product'` hoặc `'category'` (giao diện gọi category là **Collection**) |
| **`target.kind`** | Trường cần đọc: `title`, `price`, `prices`, `compare_price`, `description`, `vendor`, `media`, `variants`, `quantity`, `product_general`, `product_list`, `category_general`, `collection_list` |
| **`target.action`** | Hành vi: `add_to_cart`, `dynamic_checkout` |
| **`datasetItem`** | Bản ghi cụ thể được `provide/inject` xuống khi render danh sách |
| **`productsSaved` / `categoriesSaved`** | Cache `id → bản ghi` mà canvas đọc |
| **`allCollections`** | Feed "tất cả collection", tách riêng khỏi danh sách của dialog |
| **`ensureProducts` / `ensureCategories`** | Fetch một lượt mọi id còn thiếu lúc load trang |
| **`ensureCategoryMeta`** | Hydrate nhẹ, không kèm sản phẩm |
| **`variation_preview`** | Biến thể đầu tiên có ảnh — nguồn ảnh/giá đại diện của sản phẩm |
| **`mapProduct` / `mapCategory`** | Chuẩn hóa bản ghi API → `{ title, image, price, … }` |
| **`resolveFieldValue(key)`** | Đọc config với fallback lên node cha |
| **`mapNodeBindings(node)`** | Sinh `{ icon, label }` cho toolbar và Layers |
| **`visibleChildIds(node)`** | Con được render, có lọc theo `displayPriceId` |

---

## 8. Undo / Redo

| Thuật ngữ | Nghĩa |
|---|---|
| **`PatchRecorder`** | Vừa mutate state vừa thu cặp (forward, inverse) |
| **Patch** | `{ op: 'set'\|'unset'\|'insert'\|'remove', path, value?, index? }` |
| **`_commit`** | Chokepoint duy nhất ghi state trong node store |
| **Coalesce key** | Khóa gộp; cùng key trong cửa sổ throttle ⇒ một entry |
| **Throttle** | Mặc định 300ms (`defaultThrottleMs`) |
| **`compactPatches`** | Chỉ giữ lần ghi cuối trên mỗi path (bỏ qua nếu có insert/remove) |
| **`silent`** | Mutate nhưng không ghi timeline |
| **`ignore(fn)`** | Chạy fn ngoài timeline, lồng nhau an toàn |
| **`scrubDomRefsFromPatches`** | Đặt `node.dom = null` cho node được tạo lại bởi patch |

---

## 9. Page & UI

| Thuật ngữ | Nghĩa |
|---|---|
| **`source`** | Document trang, BE lưu dạng **chuỗi JSON** trong cột cùng tên |
| **`serialize()` / `hydrate()`** | Xuất/nạp cây node (bỏ mọi trường runtime) |
| **`dirty`** | Có mutation node sau khi load xong |
| **`remapPageNodeIds`** | Đổi toàn bộ id node khi duplicate/copy trang (thay trên chuỗi JSON) |
| **`typePages`** | Gom page theo nhóm cho page picker |
| **`DEFAULT_PAGE_TYPES`** | `main`, `cart`, `checkout`, `search`, `complete` |
| **`toolbarKeyActive`** | Mục tool rail đang chọn (cấp 1) |
| **`leftSidebarKeyActive`** | Picker đang mở (cấp 3) |
| **`selectionAnchorEl`** | Element DOM chính xác vừa được click; overlay bám theo nó |
| **`canvasScale`** | Tỉ lệ zoom-to-fit, sàn 0.4 |
| **`settingDialogs`** | Stack popover dùng chung |
| **Global styling preset** | `heading-1`…`heading-6`, `text-1`…`text-3` → class `wk-gs-*` |

---

## 10. Tiền tố tên biến hay gặp

| Tiền tố / hậu tố | Nghĩa |
|---|---|
| `merged*` | Đã qua cascade responsive (`mergedStyle`, `mergedConfig`) |
| `change*` | Action ghi (`changeStyle`, `changeConfig`, `changeSpecials`) |
| `_write*` | Helper ghi nội bộ của node store |
| `_route*` | Chuyển hướng patch sang namespace khác (`_routeState`) |
| `build*` | Sinh def / schema / tree (`buildElementSchema`, `buildRowSection`) |
| `ensure*` | Fetch nếu còn thiếu, idempotent (`ensureProducts`, `ensureSatellite`) |
| `is*` / `has*` | Predicate |
| `wk-` | Prefix class CSS của Webcake |
| `Wk*` | Component của `webcake-ui-kit` |
| `*Trait.vue` | Widget trong panel bên phải |
| `*Picker.vue` | Item kéo được trong sidebar trái |
| `*DataDef` | Hàm trả về def cây node dựng sẵn |
