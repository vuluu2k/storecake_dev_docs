# 05 — Extending

Recipe thêm element mới + wire trait panel + cases nâng cao (Grid, Product, ProductSlider) + roadmap.

> **Liên quan chặt:** [`07-traits-and-data.md`](./07-traits-and-data.md) cho trait schema chi tiết + cascade + defaults; [`08-glossary.md`](./08-glossary.md) cho variable abbreviations.

## 1. Recipe: Thêm 1 element mới

### Bước 1 — Tạo folder trong `src/components/editor_v2/nodes/<element_name>/`

Tạo 3 file:
- `index.vue` — Vue component + factory
- `meta.js` — Runtime metadata (pure data, NO Vue)
- `ai.js` — (optional) AI hints cho page generation

Ví dụ: `src/components/editor_v2/nodes/text/`

#### 1a. `meta.js` — metadata (tạo trước)

```js
// src/components/editor_v2/nodes/text/meta.js
export const meta = {
  type: 'text',
  label: 'Text',
  category: 'basic',
  showInSidebar: true,
  isContainer: false,
  rules: { isRootOnly: false },

  traits: {
    general: [
      {
        key: 'content',
        label: 'Content',
        attributes: [
          { key: 'content', type: 'text', target: 'specials', label: 'Text',
            default: 'Lorem ipsum dolor sit amet.' },
        ],
      },
      {
        key: 'typography',
        label: 'Typography',
        attributes: [
          { key: 'fontSize', type: 'number', target: 'style', label: 'Font size',
            default: 16, props: { min: 10, max: 96 } },
          { key: 'fontWeight', type: 'select', target: 'style', label: 'Weight',
            default: '400',
            props: { options: [
              { label: 'Regular', value: '400' },
              { label: 'Bold', value: '700' },
            ]} },
          { key: 'color', type: 'color', target: 'style', label: 'Color',
            default: '#1a1a1a' },
        ],
      },
    ],
    advanced: [
      {
        key: 'html',
        label: 'HTML',
        attributes: [
          { key: 'htmlId', type: 'text', target: 'specials', label: 'ID' },
          { key: 'className', type: 'text', target: 'specials', label: 'Custom class' },
        ],
      },
    ],
  },
}
```

#### 1b. `index.vue` — component + factory

```vue
<!-- src/components/editor_v2/nodes/text/index.vue -->
<template>
  <p
    ref="root"
    class="wk-text"
    :class="{ 'wk-node-selected': isSelected }"
    :data-node-id="nodeId"
    data-node-type="text"
    :style="textStyle"
    draggable="true"
    @click.stop="onClick"
    @dragstart="onMoveDragStart"
    @dragend="onMoveDragEnd"
  >{{ mergedSpecials.content || 'Type something...' }}</p>
</template>

<script>
import { Type } from '@lucide/vue'
import { nodeLeaf, draggableNode } from '@/composable/editor_v2/mixins'
import { createNode } from '@/composable/editor_v2/createNode'
import { meta as baseMeta } from './meta.js'

export default {
  name: 'TextV2',
  mixins: [nodeLeaf, draggableNode],
  computed: {
    textStyle() {
      const s = this.mergedStyle
      return {
        fontSize: s.fontSize ? s.fontSize + 'px' : undefined,
        fontWeight: s.fontWeight,
        color: s.color,
        textAlign: s.textAlign,
      }
    },
  },
}

export const meta = {
  ...baseMeta,
  icon: Type,
  factory: (overrides = {}) =>
    createNode({
      type: 'text',
      isCanvas: false,
      style: overrides.style || {},
      config: overrides.config || {},
      specials: overrides.specials || {},
    }),
}
</script>

<style scoped>
.wk-text {
  margin: 0;
  font-size: 16px;
  line-height: 1.5;
}
</style>
```

### Bước 2 — Refresh editor

Vite HMR hoặc reload. `registerElements.js` scan `nodes/*/index.vue` qua glob, tự phát hiện folder mới + wrap factory để seed defaults.

### Bước 3 — Bonus: thêm vào sidebar

Hiện sidebar `ElementsLayoutPicker` chỉ liệt kê layout (Blank Section + Row N). Để Text xuất hiện làm draggable item:

```vue
<!-- src/components/editor_v2/components/sidebar/SidebarElements.vue -->
<template>
  <div>
    <div v-for="def in sidebarElements" :key="def.type">
      <ElementDragV2 :tree="() => buildElement(def.type)">
        <ElementContainer>
          <component :is="def.icon" /> {{ def.label }}
        </ElementContainer>
      </ElementDragV2>
    </div>
  </div>
</template>

<script>
import { listSidebar } from '@/composable/editor_v2/registry'
import { buildElement } from '@/composable/editor_v2/nodeFactory'
import ElementDragV2 from '@/components/editor_v2/elements/ElementDragV2.vue'

export default {
  components: { ElementDragV2 },
  computed: {
    sidebarElements() { return listSidebar() },
  },
  methods: { buildElement },
}
</script>
```

### Bước 4 — Test

- Drag Text từ sidebar → canvas → element xuất hiện với content default
- Click → outline xanh + ElementToolbar hiện label "Text"
- Trait panel hiện 3 group (Content / Typography / HTML)
- Đổi breakpoint → cascade style hoạt động đúng
- Edit text field → ghi qua `applyTrait → changeSpecials`

### Checklist

- [ ] Folder `nodes/<element_name>/` với 3 file: `index.vue`, `meta.js`, optional `ai.js`
- [ ] `meta.js` — pure data, NO Vue imports, NO `@/` aliases
- [ ] `index.vue` — import meta từ `./meta.js`, export component + spread meta + factory
- [ ] Template: root `ref="root"` + `:data-node-id` + `data-node-type` + 5 drag attrs
- [ ] `mixins: [nodeLeaf | nodeContainer, draggableNode]`
- [ ] meta có `type`, `label`, `traits` tối thiểu
- [ ] meta.factory call `createNode({ type, style:{}, config:{}, specials:{} })`
- [ ] Container element: `meta.isContainer: true` + có `<NodeRenderer v-for>` trong template
- [ ] Style scoped chỉ có structural CSS — selection/cursor/placeholder ở global
- [ ] Trait attributes có `default` cho field nào muốn pre-fill
- [ ] Chạy `npm run validate:schemas` để verify trait schema hợp lệ

## 2. Wire Trait panel — đã có sẵn

Trait panel hiện đã schema-driven. Chỉ cần khai schema trong `meta.traits` thì panel tự render — KHÔNG cần thêm code component.

Components chính:
- `Trait.vue` — container, đọc `getDef(type).traits` → render tab → group → field
- `TraitField.vue` — generic field renderer (resolve component + read merged value + write qua `applyTrait`)
- `fields/registry.js` — `FIELD_COMPONENTS` (name→Vue), `COMPONENT_BY_TYPE` (type→default UI)

Pipeline:
```
schema field → TraitField → resolve component → bind v-model →
  on change → applyTrait(nodeId, field, value) →
  → changeStyle/Config/Specials theo field.target →
  → store update → mergeNamespace re-compute → element + field display sync
```

Chi tiết line-by-line + dialog pattern xem [`07-traits-and-data.md`](./07-traits-and-data.md) sections 3-9.

### Custom field component

Nếu data type không match COMPONENT_BY_TYPE (vd cần widget riêng), register vào registry:

```js
// src/components/editor_v2/components/trait/fields/registry.js
import MyCustomPicker from '../components/MyCustomPicker.vue'

export const FIELD_COMPONENTS = {
  ..., MyCustomPicker,
}

// Optional: bind type → default
export const COMPONENT_BY_TYPE = {
  ..., 'custom-picker': MyCustomPicker,
}
```

Trong schema:
```js
{ key: 'foo', type: 'custom-picker', component: 'MyCustomPicker',
  target: 'config', props: { ... } }
```

Component sẽ nhận props từ TraitField: `:value`, `:model-value`, `:field`, `:node-id`, `:disabled`, và mọi key trong `schema.props`. Emit qua `@input`, `@change`, `@update:value`, hoặc `@update:modelValue` (TraitField listen 4 variant).

## 3. Cases nâng cao

### Grid — container chuẩn

**meta.js:**
```js
export const meta = {
  type: 'grid',
  label: 'Grid',
  category: 'layout',
  showInSidebar: true,
  isContainer: true,
  rules: { isRootOnly: false },
  traits: {
    general: [{
      key: 'layout',
      label: 'Layout',
      attributes: [
        { key: 'columns', type: 'number', target: 'style', label: 'Columns',
          default: { base: 3, mobile: 1 }, props: { min: 1, max: 12 } },
        { key: 'gap', type: 'number', target: 'style', label: 'Gap',
          default: 16, props: { min: 0 } },
      ],
    }],
    advanced: [],
  },
}
```

**index.vue:**
```vue
<template>
  <div
    ref="root"
    class="wk-grid"
    :class="{ 'wk-node-selected': isSelected, 'wk-grid--drop-active': isDropTarget }"
    :data-node-id="nodeId"
    data-node-type="grid"
    :style="gridStyle"
    draggable="true"
    @click.stop="onClick"
    @dragstart="onMoveDragStart"
    @dragend="onMoveDragEnd"
    @dragover="onDragOver"
    @dragenter="onDragEnter"
  >
    <template v-if="!isEmpty">
      <NodeRenderer
        v-for="childId in node.data.nodes"
        :key="childId"
        :node-id="childId"
      />
    </template>
    <div v-else class="wk-node-placeholder">...</div>
  </div>
</template>

<script>
import { nodeContainer, draggableNode } from '@/composable/editor_v2/mixins'
import { createNode } from '@/composable/editor_v2/createNode'
import NodeRenderer from '../elements/NodeRenderer.vue'
import { meta as baseMeta } from './meta.js'

export default {
  name: 'GridV2',
  components: { NodeRenderer },
  mixins: [nodeContainer, draggableNode],
  computed: {
    gridStyle() {
      const s = this.mergedStyle
      return {
        display: 'grid',
        gridTemplateColumns: `repeat(${s.columns || 3}, 1fr)`,
        gap: (s.gap || 16) + 'px',
      }
    },
  },
}

export const meta = {
  ...baseMeta,
  factory: (overrides = {}) =>
    createNode({
      type: 'grid',
      isCanvas: true,
      style: overrides.style || {},
      config: overrides.config || {},
      specials: overrides.specials || {},
    }),
}
</script>
```

Hoạt động với hệ hiện tại: `nodeContainer` xử lý drop, Positioner đo `getDOMInfo` (đọc `display:grid`), children là editable nodes — full drop support.

### Product — leaf with data binding

```vue
<template>
  <div
    ref="root"
    class="wk-product"
    :class="{ 'wk-node-selected': isSelected }"
    :data-node-id="nodeId"
    data-node-type="product"
    draggable="true"
    @click.stop="onClick"
    @dragstart="onMoveDragStart"
    @dragend="onMoveDragEnd"
  >
    <template v-if="product">
      <img :src="product.image" />
      <h4>{{ product.title }}</h4>
      <span>{{ product.price }}</span>
    </template>
    <div v-else class="wk-product--empty">Select a product</div>
  </div>
</template>

<script>
import { nodeLeaf, draggableNode } from '@/composable/editor_v2/mixins'
import { createNode } from '@/composable/editor_v2/createNode'
import { fetchProduct } from '@/api/productApi'

export default {
  name: 'ProductV2',
  mixins: [nodeLeaf, draggableNode],
  data() { return { product: null } },
  watch: {
    // productId là DATA cố định cho mọi viewport → specials
    'mergedSpecials.productId': {
      immediate: true,
      async handler(id) {
        this.product = id ? await fetchProduct(id) : null
      },
    },
  },
}

export const meta = {
  type: 'product',
  label: 'Product Card',
  category: 'commerce',
  showInSidebar: true,
  isContainer: false,
  factory: (overrides = {}) =>
    createNode({
      type: 'product',
      style: overrides.style || {},
      config: overrides.config || {},
      specials: overrides.specials || {},
    }),
  traits: {
    general: [{
      key: 'data', label: 'Product', attributes: [
        { key: 'productId', type: 'product-picker', target: 'specials', label: 'Product',
          component: 'ProductPicker' },                    // custom widget — register vào FIELD_COMPONENTS
        { key: 'layout', type: 'select', target: 'specials', label: 'Layout',
          default: 'vertical',
          props: { options: [
            { label: 'Vertical', value: 'vertical' },
            { label: 'Horizontal', value: 'horizontal' },
          ]} },
      ],
    }],
    advanced: [],
  },
}
</script>
```

`productId` đi vào specials vì 1 product card cố định cho mọi bp.

### ProductSlider — Pattern A (đơn giản, đủ 90% case)

```vue
<template>
  <div
    ref="root"
    class="wk-product-slider"
    :class="{ 'wk-node-selected': isSelected }"
    :data-node-id="nodeId"
    data-node-type="product-slider"
    draggable="true"
    @click.stop="onClick"
    @dragstart="onMoveDragStart"
    @dragend="onMoveDragEnd"
  >
    <swiper
      :slides-per-view="mergedConfig.slidesPerView"
      :autoplay="mergedSpecials.autoplay"
      :space-between="mergedStyle.gap"
    >
      <swiper-slide v-for="p in products" :key="p.id">
        <ProductCard :product="p" />
      </swiper-slide>
    </swiper>
  </div>
</template>

<script>
import { nodeLeaf, draggableNode } from '@/composable/editor_v2/mixins'
import { createNode } from '@/composable/editor_v2/createNode'
import { Swiper, SwiperSlide } from 'swiper/vue'
import ProductCard from './ProductCard.vue'                // fixed internal template
import { fetchCollection } from '@/api/collectionApi'

export default {
  name: 'ProductSliderV2',
  components: { Swiper, SwiperSlide, ProductCard },
  mixins: [nodeLeaf, draggableNode],
  data() { return { products: [] } },
  watch: {
    'mergedSpecials.collectionId': {
      immediate: true,
      async handler(id) { this.products = id ? await fetchCollection(id) : [] },
    },
  },
}

export const meta = {
  type: 'product-slider',
  label: 'Product Slider',
  category: 'commerce',
  showInSidebar: true,
  isContainer: false,
  factory: (overrides = {}) =>
    createNode({
      type: 'product-slider',
      style: overrides.style || {},
      config: overrides.config || {},
      specials: overrides.specials || {},
    }),
  traits: {
    general: [
      {
        key: 'data', label: 'Data', attributes: [
          { key: 'collectionId', type: 'collection-picker', target: 'specials',
            label: 'Collection', component: 'CollectionPicker' },
        ],
      },
      {
        key: 'layout', label: 'Layout', attributes: [
          // slidesPerView khác theo bp → config với per-bp default
          { key: 'slidesPerView', type: 'number', target: 'config', label: 'Slides per view',
            default: { base: 3, mobile: 1, tablet: 2 },
            props: { min: 1, max: 8 } },
          { key: 'gap', type: 'number', target: 'style', label: 'Gap',
            default: 16,
            props: { min: 0, suffix: 'px' } },
        ],
      },
      {
        key: 'behavior', label: 'Behavior', attributes: [
          { key: 'autoplay', type: 'switch', target: 'specials', label: 'Autoplay',
            default: true },
        ],
      },
    ],
    advanced: [],
  },
}
</script>
```

Bảng phân namespace:

| Field | Namespace | Lý do |
|---|---|---|
| `collectionId` | specials | Data cố định cho mọi bp |
| `slidesPerView` | config | KHÁC theo bp (3 desktop, 1 mobile) — dùng per-bp default |
| `gap` | style | CSS visual |
| `autoplay` | specials | Behavior cố định |

### ProductSlider — Pattern B (advanced — linked nodes)

Goal: card template là **subtree editable**, runtime clone × N products. Cần extend hệ thống (linked nodes, instance render). Không cover ở đây — xem [`07-traits-and-data.md`](./07-traits-and-data.md) roadmap.

## 4. Roadmap

### Tier 1 (ngắn hạn)

- [x] Wire `meta.traits` vào Trait panel (TraitField + applyTrait)
- [ ] Wire registry vào LayerItem (label + icon từ `getDef`)
- [ ] Sidebar element picker đọc `listSidebar()` thay vì hardcode
- [ ] Thêm Text, Button, Image, Spacer, Divider (leaf elements)
- [ ] Thêm Grid container
- [ ] Trait field widget: SpacingField (4-input), ColorPicker, ImagePicker

### Tier 2 (trung hạn)

- [ ] Mỗi dialog (BackgroundColorDialog, BorderDialog, ...) wire `applyTrait` qua `ui.settingDialogs[i].data` context
- [ ] Multi-select (shift-click) → events.selected có thể > 1 item
- [ ] Undo/Redo (history store snapshot mỗi action)
- [ ] Copy / Cut / Paste (Cmd-C, Cmd-V) — serialize node JSON
- [ ] Reset to default UI per trait field (qua `getDefaultsFor(type)`)

### Tier 3 (dài hạn)

- [ ] Linked nodes (ProductSlider pattern B, ProductGrid, FormBuilder)
- [ ] Inline text editing (Heading, Text contentEditable + commit qua `applyTrait`)
- [ ] Save / Load page state (serialize `nodeStore.nodes` JSON — xem section 7 ở `01-architecture.md`)
- [ ] Custom elements ecosystem (3rd-party developers register meta)
- [ ] Keyboard nav (arrow chọn sibling, Esc deselect)
- [ ] Lock / Hide element (specials.hiddenOn array)

## 5. Conventions tổng kết

| Việc | Quy ước |
|---|---|
| File element | `nodes/XxxV2.vue` PascalCase |
| Type string | kebab-case (`flex-section`, `product-slider`) |
| CSS class | prefix `wk-`, modifier `--`, element `__` |
| Mixin compose | `[nodeLeaf\|nodeContainer, draggableNode]` |
| Default render | `<NodeRenderer v-for>` cho container, leaf không cần |
| Read data | `mergedStyle`, `mergedConfig`, `mergedSpecials` (mixin) |
| Write data | `changeStyle / changeConfig / changeSpecials / applyTrait` (qua mixin method shortcuts hoặc `useNodeStore()`) |
| Hardcoded type string trong code | TRÁNH — lookup `getDef(type)` |
| Component nội bộ (vd ProductCard) | Đặt cạnh file element, không trong `nodes/` |
| API call trong element | Watch `mergedSpecials.xxxId` / `mergedConfig.xxxId`, async fetch |
| Side-effect cleanup | `beforeUnmount` cancel rAF, remove listener, abort fetch |
| Trait default per-bp | Dùng `default: { base, mobile, ... }` — object có key bp/reserved auto-detect qua `isBreakpointMap` |
| Trait default complex value | Object không có key bp/reserved → wrapper ghi NGUYÊN object vào base |

## 6. Common element type sketch

| Element | Mixin | Container? | Key trait |
|---|---|---|---|
| Heading | `nodeLeaf + draggableNode` | No | text(specials), color/fontSize/weight/align(style) |
| Text (long) | `nodeLeaf + draggableNode` | No | content(specials), typography(style) |
| Button | `nodeLeaf + draggableNode` | No | label(specials), href(specials), bg/color/padding(style) |
| Image | `nodeLeaf + draggableNode` | No | src(specials hoặc config nếu art-direction), alt(specials), size(style) |
| Spacer | `nodeLeaf + draggableNode` | No | height(style — per-bp) |
| Divider | `nodeLeaf + draggableNode` | No | color/thickness(style) |
| FlexBlock | `nodeContainer + draggableNode` | Yes | flexDirection/gap/padding(style) |
| FlexSection | `nodeContainer + draggableNode` | Yes (root-only) | padding/background(style) |
| Grid | `nodeContainer + draggableNode` | Yes | columns/gap(style — per-bp) |
| Card | `nodeContainer + draggableNode` | Yes | bg/padding/border(style) |
| Tabs | `nodeContainer + draggableNode` | Yes (linked-node future) | tabs label(specials) |
| Product (1 card) | `nodeLeaf + draggableNode` | No | productId(specials), layout(specials) |
| ProductSlider Pattern A | `nodeLeaf + draggableNode` | No | collectionId(specials), slidesPerView(config per-bp), autoplay(specials) |
| ProductSlider Pattern B (future) | `nodeContainer + draggableNode` + linked node | Special | + item template subtree |
