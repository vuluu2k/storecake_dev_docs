# Editor V2 — Bắt đầu từ đây

Editor V2 là **visual page builder** của Storecake: người dùng kéo element từ sidebar vào canvas, chỉnh sửa qua panel bên phải, rồi lưu/publish thành trang thật.

Kiến trúc port từ `craft.js` (React) sang **Vue 3 Options API + Pinia**, giữ convention DOM của Pagefly.

> **Trạng thái**: đồng bộ với branch `feat-builder-v2`, snapshot **2026-07-31**.
> So với bản docs trước, phần lớn nội dung đã viết lại: editor đã có thêm **hệ dataset/binding** (product & collection), **inline rich-text bằng Tiptap**, **tool rail + picker 3 cấp**, và **vòng đời page (load / save / publish / switch)**.

---

## 1. Mô hình tư duy trong 6 dòng

1. Toàn bộ trang là **một map phẳng các node**: `nodes: { [id]: node }`. Quan hệ cha–con nằm trong `node.data.parent` và `node.data.nodes[]`, không phải cây lồng nhau.
2. Mỗi node có `type` (vd `'heading'`). Type tra vào **registry** để biết render bằng component nào, có những trait nào, luật drop ra sao.
3. Mọi thay đổi đều đi qua **action của `useNodeStore()`** — không component nào tự sửa `nodes` trực tiếp.
4. Mọi action ghi state đều chui qua **một chokepoint duy nhất `_commit()`**, nơi patch được thu lại cho undo/redo.
5. Render là **đệ quy một chiều**: `NodeRenderer` đọc registry → dựng component → component đó lại render con qua `NodeRenderer`.
6. Trait panel không biết gì về element cụ thể — nó đọc `meta.traits` rồi map từng field sang widget qua **definitions**.

---

## 2. Luồng lớn của một phiên làm việc

```
① BOOT                     ② LOAD                    ③ RENDER
EditorV2.vue mounted   →   pageList.loadPages()  →   PageWrapper
  registerElements()         page.loadPage(id)         └ NodeRenderer(ROOT)
  (glob nodes/*/index.vue)   └ nodeStore.hydrate()        └ đệ quy xuống lá
  → registry đầy đủ          └ preloadNodeFonts()
                             └ ensureProducts/Categories

④ EDIT                                        ⑤ PERSIST
kéo thả  → dnd.startCreate/startMove      →   page.savePage()
           Positioner.computeIndicator()        └ nodeStore.serialize()
           dnd.endDrag() → addNodeTree/move     └ pageApi.save()
trait    → TraitField.onChange()
           → changeStyle/Config/Specials    →   page.publishSite()
sửa text → Tiptap → changeSpecials({text})
                 ↓
           node._commit() → history.record()
                 ↓
           Ctrl+Z / Ctrl+Shift+Z
```

Mỗi mũi tên trong sơ đồ này được mổ xẻ từng bước ở các chương bên dưới.

---

## 3. Đọc theo thứ tự này

| # | Chương | Trả lời câu hỏi |
|---|---|---|
| 01 | [Kiến trúc](./01-architecture.md) | Dữ liệu một node trông như thế nào? Có bao nhiêu store, mỗi store giữ gì? Registry hoạt động ra sao? |
| 02 | [Rendering](./02-rendering.md) | Từ lúc mở URL đến lúc thấy pixel trên canvas, code chạy qua đâu? |
| 03 | [Drag & Drop](./03-drag-drop.md) | Kéo một element từ sidebar vào canvas thì chuyện gì xảy ra từng mili-giây? |
| 04 | [Overlays & Chrome](./04-overlays.md) | Khung chọn, toolbar nổi, thanh padding, Layers panel, tool rail — vẽ từ đâu? |
| 05 | [Thêm element mới](./05-extending.md) | Muốn thêm một element vào editor thì tạo file gì, khai báo gì? |
| 06 | [Troubleshooting](./06-troubleshooting.md) | Element không hiện / trait không lưu / drop sai chỗ — bắt đầu debug từ đâu? |
| 07 | [Traits & Responsive](./07-traits-and-data.md) | Panel bên phải sinh ra thế nào? Giá trị được ghi vào breakpoint nào? State hover lưu ở đâu? |
| 08 | [Glossary](./08-glossary.md) | `satellite`, `statefulKeys`, `allowedKeys`, `renderers`… nghĩa là gì? |
| 09 | [AI page generation](./09-ai-page-generation.md) | Pipeline sinh trang bằng LLM. |
| 10 | [Undo / Redo](./10-history.md) | Patch được ghi và hoàn tác như thế nào? |
| 11 | [Dataset & Binding](./11-dataset-binding.md) ★ **mới** | Element "Product Title" lấy tên sản phẩm từ đâu? Collection list render thế nào? |
| 12 | [Vòng đời Page](./12-page-lifecycle.md) ★ **mới** | Load / save / publish / đổi trang / dirty tracking / global styling. |
| 13 | [Inline text (Tiptap)](./13-inline-text.md) ★ **mới** | Double-click vào Heading rồi bôi đen bôi đậm — luồng đó chạy ra sao? |

**Người mới**: đọc 01 → 02 → 05 là đủ để thêm element đầu tiên.
**Đụng vào dữ liệu sản phẩm**: đọc thêm 11.
**Đụng vào panel phải**: đọc 07.

---

## 4. Bản đồ thư mục

Bốn khu vực, phân theo *mức độ phụ thuộc Vue*:

```
src/
├── composable/editor_v2/      ← LOGIC THUẦN (không import SFC)
│   ├── constants.js             ROOT_NODE, BREAKPOINTS (4), PLACEHOLDER_*
│   ├── createNode.js            createNode / createNodeTree / genId
│   ├── registry.js              getDef / registerElement / canDropInto / getAllowedKeys
│   ├── registerElements.js      bootstrapper — glob nodes/*/index.vue
│   ├── nodeFactory.js           wrapInBlankSection / buildBlankSection / buildRowSection
│   ├── templateRegistry.js      + templates/hero.js
│   ├── Positioner.js            engine tính vị trí drop
│   ├── getDOMInfo.js            rect + hướng flow
│   ├── findPosition.js          index + where trong danh sách con
│   ├── createShadow.js          ảnh ma khi kéo
│   ├── draggableNode.js         mixin dragstart/dragend
│   ├── get.js                   getStyle / getConfig / getSpecials (đọc có cascade)
│   ├── mergeNode.js             mergeNamespace + mergeStateNs/Map/Node
│   ├── responsivePolicy.js      STYLE_ASYNC / CONFIG_ASYNC
│   ├── patchRecorder.js         PatchRecorder + compactPatches + applyPatches
│   ├── cssShorthand.js          parseSides / formatSides
│   ├── tiptap.js                schema inline + stripInlineMarks/Color/Style
│   ├── productImageState.js     state chia sẻ giữa product-image-feature ↔ list
│   ├── mixins/
│   │   ├── nodeBase.js          (+ nodeLeaf) props, merged*, commonStyleData, onClick
│   │   ├── nodeContainer.js     isEmpty, isDropTarget, dropListeners
│   │   ├── editableText.js      dblclick → Tiptap
│   │   ├── satelliteOwner.js    node con "vệ tinh" ngoài data.nodes
│   │   ├── statefulNode.js      sinh CSS cho :hover / :active
│   │   └── dataset.js           ★ nền tảng cho mọi element bound dữ liệu
│   └── ai/                      pipeline AI (xem chương 09)
│
├── stores/editor_v2/          ← STATE (11 store Pinia)
│   ├── node.js                  cây node + toàn bộ action ghi
│   ├── dnd.js                   phiên kéo thả + Positioner
│   ├── editor.js                UI state (breakpoint, tool rail, dialog, scale)
│   ├── history.js               timeline undo/redo
│   ├── edittext.js              trạng thái inline-edit + editor Tiptap đang sống
│   ├── page.js                  load / save / publish / switch trang hiện tại
│   ├── pageList.js              danh sách page của site + cache source
│   ├── pageAction.js            dialog rename / duplicate / copy-to / delete
│   ├── globalStyling.js         preset typography toàn site → CSS injected
│   ├── product_dataset.js       ★ fetch + cache sản phẩm
│   └── category_dataset.js      ★ fetch + cache collection
│
├── components/editor_v2/      ← VIEW
│   ├── PageWrapper.vue          canvas + zoom-to-fit + mount overlays
│   ├── Header.vue               breakpoint tabs, save, publish, page switcher
│   ├── Toolbar.vue              tool rail 60px bên trái (9 mục)
│   ├── Sidebar.vue              panel 300px, đổi theo tool rail
│   ├── Trait.vue                panel 300px bên phải
│   ├── nodes/                   ★ 35 element folder (auto-register)
│   ├── elements/                chrome không phải node
│   │   ├── NodeRenderer.vue       switcher đệ quy
│   │   ├── ElementDragV2.vue      wrapper kéo item từ picker
│   │   ├── ElementToolbar.vue     toolbar nổi trên node đang chọn
│   │   ├── EditTextToolbar.vue    toolbar B/I/U khi inline-edit
│   │   ├── NodeSelectedOverlay.vue / NodeHoverOverlay.vue
│   │   ├── EdgeOverlays.vue       dải padding/margin kéo được
│   │   ├── IndicatorOverlay.vue   vạch xanh chỉ chỗ thả
│   │   ├── NodePlaceholder.vue    placeholder container rỗng
│   │   └── SelectDataset.vue      placeholder "chưa chọn sản phẩm"
│   └── components/
│       ├── toolbar/               Elements / Store / Layer / Pages (nội dung Sidebar)
│       ├── picker/                cấp 3: elements/*Picker.vue + store/*Picker.vue
│       ├── layer/                 LayerItem / LayerGroupWrapper
│       ├── sidebar/               SidebarWrapper / SidebarItem
│       ├── color_picker/          ColorPicker & bạn bè
│       └── trait/
│           ├── components/        TraitField / TraitWrapper / fields/*.vue (79 widget)
│           └── fields/            DỮ LIỆU THUẦN (Vue-free)
│               ├── definitions.js   getDefinitionData + buildElementSchema + …
│               ├── defs/            82 định nghĩa trait, chia 14 nhóm domain
│               ├── registry.js      defKey → widget Vue
│               ├── styleRenderers.js (node) → object CSS
│               ├── stateCss.js      render CSS cho state hover/active
│               ├── enum.js          TRAIT / TARGET / DISPLAY_PRICE …
│               └── eventDefinitions.js + events/actions/*
│
├── data/editor_v2/            ★ def cây node dựng sẵn (composite dataset)
├── utils/editor_v2/           ★ bindings.js / visible.js / map-product.js / fonts.js / page.js
└── api/editor_v2/             pageApi / siteApi / styleGlobalApi / bindings/{product,category,…}Api
```

---

## 5. Tra cứu nhanh — "muốn làm X thì mở file nào"

| Việc cần làm | File |
|---|---|
| Thêm element mới | `nodes/<name>/{index.vue, meta.js, ai.js?}` |
| Thêm trait field mới | `trait/fields/defs/<nhóm>.js` + `trait/fields/registry.js` + `trait/components/fields/<X>Trait.vue` |
| Sửa trait của một element | `nodes/<name>/meta.js` → `traits.general` / `traits.advanced` |
| Ẩn/hiện một nhóm trait theo ngữ cảnh | `visible: (node) => …` trong group, xem `utils/editor_v2/visible.js` |
| Sửa luật thả | `meta.rules.canDropInto` / `meta.rules.nodeChildAllows` / `Positioner.js` |
| Đổi giá trị mặc định lưu theo breakpoint | `composable/editor_v2/responsivePolicy.js` |
| Sửa toolbar nổi | `elements/ElementToolbar.vue` (+ `meta.rules.toolbarTarget`) |
| Tắt dải padding/margin cho một type | `meta.rules.edgeOverlay` |
| Thêm mục vào tool rail trái | `Toolbar.vue` + `Sidebar.vue` + `picker/PickerWrapper.vue` |
| Thêm element "Store" bind dữ liệu | `data/editor_v2/<x>.js` + `picker/store/<X>Picker.vue` |
| Đổi danh sách breakpoint | `composable/editor_v2/constants.js` |
| Thêm action cho event | `trait/fields/events/actions/<name>.js` + `eventDefinitions.js` |
| Thêm page template | `composable/editor_v2/templates/<id>.js` |

---

## 6. Quy ước đặt tên

- **Folder element**: `snake_case` hoặc `kebab-case` theo file hiện có (`flex_block/`, `image-comparison/`); **type string luôn `kebab-case`** (`flex-block`, `image-comparison`).
- **File SFC trong folder element**: luôn `index.vue`.
- **CSS class**: prefix `wk-`, modifier `--`, element `__` → `wk-list-dataset__nav--prev`.
- **Store**: `useXxxStore` (`useNodeStore`, `useEditorPageStore`, `useProductDatasetStore`).
- **Trait def key**: `snake_case` (`width_select`, `bg_image`); **writeKey** giữ nguyên dạng CSS var hoặc camelCase (`--node-width`, `htmlTag`).
- Element **không import nhau trực tiếp** — luôn qua `<NodeRenderer>` (ngoại lệ có chủ đích: `list-dataset` import `dataset-block` để render nhiều bản sao, xem chương 11).

---

## 7. Ngoài phạm vi hiện tại

- Multi-select / shift-click (mảng `events.selected` đã sẵn sàng nhưng UX chưa làm).
- Toggle lock / hide trong Layers (flag `locked`, `hidden` đã có, UI chưa đầy đủ).
- Copy/paste qua clipboard hệ thống (mới có `duplicate`).
- Điều hướng bàn phím (mũi tên chọn anh em, Esc bỏ chọn).
- AI inline-edit node đang chọn — xem roadmap trong chương 09.
