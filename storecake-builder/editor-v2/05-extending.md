# 05 — Thêm element mới

Công thức đầy đủ để thêm một element vào editor, kèm catalog 35 type hiện có.

---

## 1. Ba file, một thư mục

```
src/components/editor_v2/nodes/<ten-element>/
├── meta.js     ← DỮ LIỆU THUẦN: type, label, traits, rules, defaults
├── index.vue   ← Component Vue + export const meta = { ...baseMeta, icon, factory }
└── ai.js       ← (tùy chọn) gợi ý cho AI page-gen
```

Không cần sửa file nào khác: `registerElements.js` glob `nodes/*/index.vue` và tự đăng ký.

**Vì sao tách `meta.js` và `index.vue`?**
`meta.js` không import Vue → script CI (`scripts/validate-trait-schemas.mjs`) chạy được bằng plain Node. `index.vue` bổ sung hai thứ *bắt buộc phải là JS runtime*: `icon` (component Vue) và `factory` (tạo node).

---

## 2. `meta.js` — giải phẫu

```js
import { TRAIT } from '../../components/trait/fields/enum.js'

export const meta = {
  // ─── Định danh ─────────────────────────────────────────────
  type:  'heading',        // DUY NHẤT toàn hệ thống, kebab-case
  label: 'Heading',        // hiện ở Layers + toolbar nổi
  category: 'basic',       // 'basic' | 'layout' | 'media' | 'dataset' | 'system'
  showInSidebar: true,
  isContainer: false,      // true ⇒ chứa được node con

  // ─── Giá trị khởi tạo ──────────────────────────────────────
  // Key ở đây là WRITEKEY THẬT, không phải slug định nghĩa trait.
  defaults: {
    style:    { '--node-width': 'fill', '--text-align': 'left' },
    config:   { textGlobalStyle: 'heading-1' },
    specials: { htmlTag: 'h2', text: 'Enter your heading here' },
    states:   { hover: { style: { … } } },        // tùy chọn
    responsive: { mobile: { style: { … } } },     // tùy chọn
  },

  // ─── Luật hành vi ──────────────────────────────────────────
  rules: {
    isRootOnly: false,
    isContentEditable: true,
    edgeOverlay: { padding: false },
  },

  // ─── Panel bên phải ────────────────────────────────────────
  traits: {
    general:  [ /* nhóm */ ],
    advanced: [ /* nhóm */ ],
  },

  // ─── Tùy chọn nâng cao ─────────────────────────────────────
  states:    { base: 'default', variants: [ … ] },
  satellite: [ { type: 'tab-item', configKey: 'tabItemId' } ],
  events:    [ … ],   // khai báo event mà element hỗ trợ
}
```

### 2.1 Toàn bộ `rules`

| Rule | Kiểu | Tác dụng |
|---|---|---|
| `isRootOnly` | `bool` | Chỉ sống trực tiếp dưới ROOT (element cấp trang). Positioner luôn ép cha = ROOT khi kéo. |
| `isContentEditable` | `bool` | Bật mixin `editableText` → double-click sửa text tại chỗ. |
| `locked` | `bool` | Node cấu trúc: không xóa/nhân bản/kéo riêng, chỉ đi theo owner. |
| `hideInLayer` | `bool` | Không hiện trong Layers. |
| `nodeChildAllows` | `string[]` | Whitelist type con. Rỗng/không khai = không giới hạn. |
| `canDropInto` | `(parentType) => bool` | Luật thả tự do do element tự quyết. |
| `edgeOverlay` | `bool` \| `{ padding?, margin?, marginSides? }` | Bật/tắt dải padding-margin kéo được. |
| `toolbarTarget` | `(node, nodes) => id` | Chuyển hướng Duplicate/Delete của toolbar sang node khác. |
| `selectable` | — | Dùng ở một số element cấu trúc để chặn chọn trực tiếp. |

### 2.2 Cấu trúc `traits`

```js
traits: {
  general: [
    {
      key: 'typography',          // định danh nhóm (dùng cho show-more + switch header)
      label: 'Typography',        // tiêu đề nhóm trong panel
      visible: (node, nodes) => …,// tùy chọn: ẩn/hiện nhóm theo ngữ cảnh
      stateful: true,             // tùy chọn: nhóm này ghi được theo state hover/active
      keepInState: true,          // tùy chọn: giữ nhóm khi đang ở state khác base
      state: true,                // tùy chọn: đây là ô chọn State, không phải nhóm trait
      attributes: [
        TRAIT.TEXT_COLOR,                              // dạng ngắn: chỉ là key
        { key: TRAIT.FONT_SIZE },                      // dạng object
        { key: TRAIT.LINE_HEIGHT, group: 'more' },     // nằm sau nút "Show more"
        { key: TRAIT.TEXT_CONTENT, visible: false },   // khai để hợp lệ hóa writeKey, không hiện UI
        { key: TRAIT.WIDTH_SELECT, disabled: (data) => … },
      ],
    },
  ],
  advanced: [ … ],
}
```

Nhớ hai điều:

1. **Trait không khai ở đây thì writeKey tương ứng bị chặn** — `allowedKeys` được trích ra chính từ `traits`. Đây là lý do có mẹo `{ key: …, visible: false }`: khai để hợp lệ hóa nhưng không vẽ UI.
2. `renderers` cũng được trích từ `traits`, **theo đúng thứ tự khai báo**. Renderer sau ghi đè renderer trước khi trùng key CSS.

Chi tiết panel: [chương 07](./07-traits-and-data.md).

---

## 3. `index.vue` — giải phẫu

```vue
<template>
  <component
    :is="mergedSpecials.htmlTag"
    ref="root"                                     <!-- ① BẮT BUỘC -->
    class="wk-heading"
    :class="[nodeClassMap, globalStyleClass]"      <!-- ② -->
    :style="headingStyle"                          <!-- ③ -->
    canvas-node-wrapper                            <!-- ④ -->
    v-bind="{ ...nodeAttrs, ...editableAttrs }"    <!-- ⑤ -->
    v-on="{ ...nodeListenersBase, ...dragListeners, ...editableListeners }"
  >
    <EditorContent v-if="isEditing" :editor="textEditor" />
    <span v-else ref="editableContent" v-html="displayText || 'Enter your heading here'" />
  </component>
</template>

<script>
import { EditorContent } from '@tiptap/vue-3'
import { nodeLeaf, draggableNode } from '@/composable/editor_v2/mixins'
import { createNode } from '@/composable/editor_v2/createNode'
import { meta as baseMeta } from './meta.js'
import { Heading } from '@lucide/vue'

export default {
  name: 'HeadingNode',
  components: { EditorContent },
  mixins: [nodeLeaf, draggableNode],
  computed: {
    headingStyle() { return { ...this.commonStyleData, ...this.animationStylePatch } },
  },
}

export const meta = {
  ...baseMeta,
  icon: Heading,
  factory: (overrides = {}) => createNode({
    type: 'heading',
    isCanvas: false,
    style:    overrides.style    || {},
    config:   overrides.config   || {},
    specials: { htmlTag: 'h2', ...(overrides.specials || {}) },
  }),
}
</script>
```

Checklist năm thứ bắt buộc:

| # | Thứ | Không có thì sao |
|---|---|---|
| ① | `ref="root"` trên thẻ gốc | `node.dom` null → overlay/toolbar/Positioner mù |
| ② | `:class="nodeClassMap"` | Mất viền chọn, mất `wk-hidden`, mất `wk-drop-active` |
| ③ | `:style="commonStyleData"` (hoặc object trộn nó) | Trait không có tác dụng gì |
| ④ | Attribute `canvas-node-wrapper` / `canvas-flex` | `--node-width` / `--layout-direction` bị renderer bỏ qua |
| ⑤ | `v-bind="nodeAttrs"` + `v-on="nodeListenersBase"` | Không chọn được, không kéo được, `data-node-id` biến mất |

### 3.1 `factory` phải làm gì

- Nhận `overrides` = `{ style, config, specials, events, bindings }` và **để chúng thắng** giá trị mặc định.
- Không cần lặp lại `meta.defaults` — lớp bọc trong `registerElement` đã tự điền phần thiếu.
- Đặt `isCanvas: true` nếu element chứa con.
- Không tự dựng node con: cây con do `createNodeTree(def).children` hoặc `data/editor_v2/*.js` lo.

---

## 4. Bốn mẫu nâng cao

### 4.1 Container

```js
// meta.js
isContainer: true,
rules: { isRootOnly: false, nodeChildAllows: ['list-item'] },

// index.vue
mixins: [nodeContainer, draggableNode]
```

```vue
<div ref="root" canvas-flex canvas-node-wrapper
     :class="nodeClassMap" :style="blockStyle"
     v-bind="nodeAttrs"
     v-on="{ ...nodeListenersBase, ...dragListeners, ...dropListeners }">
  <NodePlaceholder v-if="isEmpty" />
  <NodeRenderer v-for="id in node.data.nodes" :key="id" :node-id="id" />
</div>
```

### 4.2 Stateful (hover / active)

```js
// meta.js
states: {
  base: 'default',
  variants: [
    { label: 'Default', value: 'default' },
    { label: 'Hover',   value: 'hover',  selector: ':hover' },
    { label: 'Active',  value: 'active', selector: '.is-active' },
  ],
},
traits: { general: [
  { key: '__state__', state: true },              // vị trí ô chọn State
  { key: 'background', label: 'Background', stateful: true, attributes: [ … ] },
]},
```

```js
mixins: [nodeLeaf, draggableNode, statefulNode]
```

```vue
<component :is="'style'" v-if="stateCss">{{ stateCss }}</component>
```

`variants[].visible(node, nodes)` cho phép ẩn một variant tùy ngữ cảnh (ví dụ `product-variant-option` giấu Active khi đang ở kiểu select).

### 4.3 Satellite

```js
// meta owner
satellite: [{ type: 'tab-item', configKey: 'tabItemId' }],
mixins: [nodeContainer, satelliteOwner]
```

```js
// meta satellite
rules: { hideInLayer: true, locked: true, edgeOverlay: { padding: false } }
```

Satellite được `ensureSatellite()` tạo lười khi owner mount; id lưu ở `config.tabItemId`. Xem [chương 01 §7](./01-architecture.md).

### 4.4 Element bind dữ liệu (dataset)

```js
mixins: [dataset]   // đã gồm nodeLeaf + draggableNode + statefulNode
```

```vue
<template v-if="notShowContent">
  <SelectDataset :node="node" :node-id="nodeId" />
</template>
<template v-else>
  <!-- render dữ liệu thật qua getValue(target.kind) -->
</template>
```

Chi tiết đầy đủ: [chương 11](./11-dataset-binding.md).

---

## 5. Đưa element ra sidebar

Element có `showInSidebar: true` chưa tự hiện — vẫn cần một item kéo được:

1. Tạo `components/picker/elements/Elements<X>Picker.vue`:

```vue
<ElementDragV2 :tree="build" :width="216" :height="100">
  <span>Tên hiển thị</span>
</ElementDragV2>
…
methods: { build: () => buildElement('my-type', {}) }
```

2. Thêm dòng dispatch vào `components/picker/PickerWrapper.vue`.
3. Thêm mục mở picker trong `components/toolbar/Elements.vue` (hoặc `Store.vue`).

`tree` **nên truyền hàm** — cây phải sinh mới mỗi lần kéo để id không trùng.

---

## 6. Kiểm chứng trước khi báo xong

```bash
npx --yes vite-node@0.34.6 scripts/validate-trait-schemas.mjs
```

Script này chạy bằng plain Node (nên `meta.js` mới không được import `.vue`). Nó kiểm tra `traits` khớp `DEFINITIONS_DATA`, `defaults` khớp schema, và các writeKey đều hợp lệ.

Sau đó: mở editor, kéo element ra canvas, đổi qua cả 4 breakpoint, thử undo/redo, thử duplicate và delete.

---

## 7. Catalog 35 element

### Hệ thống & layout

| Type | Label | Ghi chú |
|---|---|---|
| `root` | Page | Container gốc, `hideInLayer` |
| `flex-section` | Section | `isRootOnly` — element cấp trang |
| `flex-block` | Block | Container đa dụng, có Ungroup |

### Cơ bản

| Type | Label | Ghi chú |
|---|---|---|
| `heading` | Heading | contenteditable |
| `text` | Text body | contenteditable |
| `button` | Button | contenteditable + states |
| `icon` | Icon | picker icon |
| `image` | Image | |
| `video` | Video | |
| `image-comparison` | Image Comparison | thanh trượt trước/sau |
| `breadcrumb` | Breadcrumb | |
| `google-map` | Google Map | |
| `list` | List | `nodeChildAllows: ['list-item']` |
| `list-item` | List item | contenteditable |
| `tab` | Tab | container + satellite `tab-item` |
| `tab-content` | Tab content | container |
| `tab-item` | Tab item | satellite, `locked` + `hideInLayer` + states |
| `accordion` | Accordion | container + satellite `accordion-item` |
| `accordion-content` | Accordion content | container |
| `accordion-item` | Accordion header | satellite, `locked` + `hideInLayer` + states |
| `text-marquee` | Text Marquee | `nodeChildAllows: ['text-marquee-item']` |
| `text-marquee-item` | Text marquee item | contenteditable, render nhiều bản (clone) |

### Dataset & Store

| Type | Label | Ghi chú |
|---|---|---|
| `dataset-block` | Product | Thẻ sản phẩm/collection, container |
| `list-dataset` | Product | Danh sách/slide, render N bản `dataset-block` |
| `text-dataset` | Default | Title / vendor / description… tùy `binding.kind` |
| `pricing-dataset` | Product | Giá + giá so sánh |
| `quantity-dataset` | Product | Bộ chọn số lượng (có satellite) |
| `quantity-button` | Quantity button | states |
| `quantity-input` | Quantity input | |
| `media-dataset` | Media | Ảnh sản phẩm/collection, container |
| `product-image-feature` | Feature image | Ảnh lớn |
| `product-image-list` | Image list | Thumbnail, states |
| `product-variants` | Product variants | container |
| `product-variant-label` | Variant label | |
| `product-variant-option` | Variant option | states |

---

## 8. Lỗi hay gặp khi thêm element

| Triệu chứng | Nguyên nhân |
|---|---|
| Element không hiện trong registry | `index.vue` thiếu `export const meta`, hoặc `meta.type` rỗng |
| Canvas hiện `[unknown: my-type]` | `type` trong node khác `meta.type` |
| Trait chỉnh mà không đổi gì | Thiếu `:style="commonStyleData"`, hoặc thiếu `canvas-node-wrapper` |
| Log `unknown key '…' — dropped` | writeKey chưa khai trong `meta.traits` |
| Không chọn được | Thiếu `v-on="nodeListenersBase"` hoặc thiếu `v-bind="nodeAttrs"` |
| Không kéo được | Thiếu mixin `draggableNode` / thiếu `dragListeners`, hoặc `rules.locked` đang bật |
| Mất default sau khi render lại | Đặt default trong `data()` của component thay vì `meta.defaults` |
| Vòng lặp import lúc boot | `meta.js` import `.vue` hoặc import store |
