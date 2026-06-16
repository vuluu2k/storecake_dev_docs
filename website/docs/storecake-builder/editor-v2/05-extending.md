---
sidebar_position: 6
title: 05 — Extending
---

# 05 — Extending

Recipe thêm element mới + 4 pattern nâng cao (stateful / satellite / locked / contenteditable) + element catalog + Wk* widgets.

> **Liên quan chặt:**
> - [`07-traits-and-data.md`](./07-traits-and-data.md) — trait schema chi tiết, cascade, defaults, defs/*
> - [`08-glossary.md`](./08-glossary.md) — variable abbreviations
> - Skill `builderx_spa-editor-v2-element` — template AI-ready

## 1. Recipe: Thêm element mới

### Bước 1 — Tạo folder `src/components/editor_v2/nodes/<snake_case>/`

3 file:
- `meta.js` — Pure data (NO Vue, NO `@/` aliases — chỉ relative imports để `node` thuần chạy được)
- `index.vue` — Component + factory
- `ai.js` — (optional) AI hints

> **Naming:** folder dùng `snake_case` (`my_widget/`), `meta.type` dùng `kebab-case` (`'my-widget'`).

### Bước 2 — `meta.js`

```js
// nodes/my_widget/meta.js
// Relative (không @/) vì build:schemas/validate:schemas chạy bằng `node` thuần.
import { TRAIT } from '../../components/trait/fields/enum.js'

export const meta = {
  type: 'my-widget',
  label: 'My Widget',
  category: 'basic',                          // 'layout' | 'basic' | 'system'
  showInSidebar: true,
  isContainer: false,
  rules: {
    isRootOnly: false,
    edgeOverlay: { padding: false },          // tùy chọn: tắt overlay padding
    nodeChildAllows: [],                      // whitelist child type strings; [] = no restriction
  },
  defaults: {
    style: {
      '--node-width': 'fit',
      padding: '12px',
    },
    config: {},
    specials: {
      text: 'My widget',
    },
    responsive: {
      mobile: { padding: '8px' },             // flat OK — normalizeResponsiveSlot route
    },
  },
  traits: {
    general: [
      { key: 'layout',     label: 'Layout',     attributes: ['width_select', 'padding'] },
      { key: 'background', label: 'Background', attributes: ['bg_color'] },
    ],
    advanced: [
      { key: 'spacing',    label: 'Spacing',    attributes: ['padding_margin'] },
      { key: 'display',    label: 'Display',    attributes: ['display'] },
    ],
  },
}
```

**Required fields:** `type`, `label`. Mọi field khác optional với fallback hợp lý.

**`TRAIT` enum** trong `enum.js` chứa key chuẩn cho trait definitions (vd `TRAIT.WIDTH_SELECT === 'width_select'`). Có thể dùng string trực tiếp, nhưng dùng enum bắt typo sớm.

### Bước 3 — `index.vue`

```vue
<template>
  <div
    ref="root"
    v-bind="{ ...nodeAttrs, ...editableAttrs }"
    :class="nodeClassMap"
    :style="commonStyleData"
    v-on="{ ...nodeListenersBase, ...dragListeners, ...editableListeners }"
  >
    {{ mergedSpecials.text || 'My widget' }}
  </div>
</template>

<script>
import { Type } from '@lucide/vue'                           // sidebar icon
import { nodeLeaf, draggableNode } from '@/composable/editor_v2/mixins'
import { createNode } from '@/composable/editor_v2/createNode'
import { meta as baseMeta } from './meta.js'

export default {
  name: 'MyWidget',
  mixins: [nodeLeaf, draggableNode],
}

// Compose runtime meta — spread base + thêm factory + icon (Vue).
// Factory trả minimal node — registry sẽ wrap để fill defaults.
export const meta = {
  ...baseMeta,
  icon: Type,
  factory: (overrides = {}) =>
    createNode({
      type: 'my-widget',
      isCanvas: false,
      style: overrides.style || {},
      config: overrides.config || {},
      specials: overrides.specials || {},
    }),
}
</script>

<style scoped>
.wk-my-widget {
  /* structural CSS — selection/cursor/placeholder ở global */
}
</style>
```

### Bước 4 — `ai.js` (optional, recommended)

```js
// nodes/my_widget/ai.js
export const ai = {
  description: 'A small widget rendering text for X purpose.',
  hints: {
    useWhen:     ['concrete scenario 1', 'concrete scenario 2'],
    avoidWhen:   ['use Heading for SEO h1/h2 instead'],
    contentTips: ['keep text short, 1 line'],
  },
  examples: [
    { description: 'Default', def: { type: 'my-widget', specials: { text: 'Hello' } } },
  ],
  semantics: ['typography', 'inline-content'],
}
```

Sidecar lazy-load chỉ bởi AI gen pipeline (`composable/editor_v2/ai/schema.js`).

### Bước 5 — Thêm vào sidebar (nếu `showInSidebar: true`)

Tạo / mở rộng `Elements<Group>Picker.vue`:

```vue
<!-- components/editor_v2/components/sidebar/ElementsBasicPicker.vue -->
<template>
  <div class="grid grid-cols-2 gap-2">
    <ElementDragV2 :tree="() => buildElement('my-widget')">
      <ElementContainer label="My Widget" :icon="Type" />
    </ElementDragV2>
  </div>
</template>

<script>
import { Type } from '@lucide/vue'
import { buildElement } from '@/composable/editor_v2/nodeFactory'
import ElementDragV2 from '@/components/editor_v2/elements/ElementDragV2.vue'
import ElementContainer from './ElementContainer.vue'

export default {
  components: { ElementDragV2, ElementContainer, Type },
  setup() { return { Type, buildElement } },
}
</script>
```

Hoặc tự động qua `listSidebar()` (đọc registry):

```js
import { listSidebar } from '@/composable/editor_v2/registry'
const items = listSidebar().filter(d => d.category === 'basic')
```

### Bước 6 — Test

```bash
npm run dev
```

- Drag element từ sidebar → canvas → outline xanh + ElementToolbar
- Trait panel hiện đúng group/attribute
- Đổi breakpoint → cascade hoạt động
- Edit trait → store update + Vue re-render
- Undo (Cmd-Z) → revert đúng 1 entry

### Checklist

- [ ] Folder `nodes/<snake>/{index.vue, meta.js}` + tùy chọn `ai.js`
- [ ] `meta.js` Vue-free, dùng relative import (`../../components/...`)
- [ ] `meta.type` kebab-case, unique
- [ ] `meta.traits` chỉ tham chiếu definition đã có trong `defs/*.js` (hoặc khai inline-spec đúng shape)
- [ ] `index.vue` template root: `ref="root"` + `v-bind="nodeAttrs"` + `v-on="{...nodeListenersBase, ...dragListeners}"`
- [ ] Mixin: `[nodeLeaf|nodeContainer, draggableNode]` (+ thêm `editableText`/`statefulNode`/`satelliteOwner` qua opt-in rule)
- [ ] `meta.factory` call `createNode({type, style, config, specials})` — KHÔNG inline literal
- [ ] Style scoped chỉ structural CSS
- [ ] `npm run validate:schemas` pass (nếu CI bật)

## 2. Wire Trait panel — đã có sẵn

Trait panel schema-driven. Chỉ cần khai trong `meta.traits` → panel tự render — KHÔNG cần thêm code.

Components chính:
- `Trait.vue` — container, đọc `getDef(type).traits`
- `TraitField.vue` — dispatcher resolve widget + bind value
- `fields/registry.js` — `VUE_COMPONENTS` map (definition key → Vue widget)
- `fields/defs/*` — `DEFINITIONS_DATA` chia domain

Pipeline:
```
meta.traits attribute (key=string hoặc {key,...})
  → resolve qua DEFINITIONS_DATA[key]
  → TraitField render <component :is="VUE_COMPONENTS[key]" />
  → widget emit ('change', writeKey, value)
  → TraitField.onChange route theo def.writes[writeKey].target
  → nodeStore.changeStyle / changeConfig / changeSpecials
  → store update → mergeNamespace re-compute → element + field display sync
```

Chi tiết + dialog pattern + custom widget xem [`07-traits-and-data.md`](./07-traits-and-data.md) sections 4-7, 10.

## 3. Pattern nâng cao

### 3.1. Container (`isContainer: true`)

```js
// meta.js
isContainer: true,
defaults: {
  style: {
    '--node-width': 'fill',
    '--node-height': 'fit',
    '--layout-direction': 'horizontal',
    '--layout-vertical': 'top',
    '--layout-horizontal': 'left',
    padding: '0px',
  },
  config: { contentWidth: 'fill_container' },
  responsive: {
    mobile: { '--layout-direction': 'vertical' },
  },
},
traits: {
  general: [
    { key: 'size',   attributes: ['width_select', 'height_select'] },
    { key: 'layout', attributes: ['direction', 'gap', 'padding', 'vertical', 'horizontal'] },
  ],
},
```

```vue
<template>
  <div ref="root" v-bind="nodeAttrs" :class="nodeClassMap" :style="commonStyleData"
       v-on="{ ...nodeListenersBase, ...dragListeners, dragover: onDragOver, dragenter: onDragEnter }">
    <template v-if="!isEmpty">
      <NodeRenderer v-for="childId in node.data.nodes" :key="childId" :node-id="childId" />
    </template>
    <NodePlaceholder v-else />
  </div>
</template>

<script>
import { nodeContainer, draggableNode } from '@/composable/editor_v2/mixins'
import NodeRenderer from '../../elements/NodeRenderer.vue'
import NodePlaceholder from '../../elements/NodePlaceholder.vue'
import { createNode } from '@/composable/editor_v2/createNode'
import { meta as baseMeta } from './meta.js'

export default {
  name: 'MyContainer',
  components: { NodeRenderer, NodePlaceholder },
  mixins: [nodeContainer, draggableNode],
}
export const meta = { ...baseMeta, factory: (o = {}) => createNode({ type: 'my-container', isCanvas: true, style: o.style || {} }) }
</script>
```

### 3.2. Inline contenteditable (Heading/Text/Button)

```js
// meta.js
rules: { isRootOnly: false, isContentEditable: true, edgeOverlay: { padding: false } },
defaults: {
  specials: { text: 'Heading' },
  config: { textGlobalStyle: 'heading-1' },
}
```

```vue
<template>
  <h2 ref="root"
      v-bind="{ ...nodeAttrs, ...editableAttrs }"
      :class="nodeClassMap"
      :style="commonStyleData"
      v-on="{ ...nodeListenersBase, ...dragListeners, ...editableListeners }">
    {{ mergedSpecials.text }}
  </h2>
</template>
```

`nodeLeaf` đã gắn sẵn `editableText` (folded vào nodeBase) — nhưng chỉ active khi `rules.isContentEditable` true. User dblclick → contenteditable, blur → commit qua `changeSpecials(id, { text })`.

### 3.3. Stateful (Button hover/active)

```js
// meta.js — chỉ khai base + variants. KHÔNG còn `states.groups`.
states: {
  base: 'default',
  variants: [
    { value: 'default', label: 'Default' },
    { value: 'hover',   label: 'Hover',  selector: ':hover'  },
    { value: 'active',  label: 'Active', selector: ':active' },
  ],
},
// group nào cho phép override per-state → gắn `stateful: true` lên group đó trong `traits`,
// và thêm 1 group variant-picker `{ key: 'state', state: true }`.
traits: {
  general: [
    { key: 'state', state: true },
    { key: 'background', label: 'Background', stateful: true, attributes: [TRAIT.BG_COLOR] },
    { key: 'shape',      label: 'Shape',      stateful: true, attributes: [TRAIT.BORDER, TRAIT.CORNER] },
    { key: 'typography', label: 'Typography', stateful: true, attributes: [TRAIT.TEXT_COLOR] },
  ],
},
```

State override ghi vào `data.states[state] = { style, config }` (base) + `data.responsive[bp].states[state]`
(per-bp), KHÔNG vào `config`. `collectStatefulWriteKeys(meta)` gom writeKey từ group `stateful: true` →
`def.statefulKeys` (store dùng để divert).

```vue
<template>
  <button ref="root" v-bind="nodeAttrs" :class="nodeClassMap" :style="commonStyleData"
          v-on="{ ...nodeListenersBase, ...dragListeners }">
    <component :is="'style'" v-if="stateCss">{{ stateCss }}</component>
    {{ mergedSpecials.text }}
  </button>
</template>

<script>
import { nodeLeaf, draggableNode } from '@/composable/editor_v2/mixins'
import { statefulNode } from '@/composable/editor_v2/mixins/statefulNode'
import { createNode } from '@/composable/editor_v2/createNode'
import { meta as baseMeta } from './meta.js'

export default {
  name: 'MyButton',
  mixins: [nodeLeaf, draggableNode, statefulNode],
}
export const meta = { ...baseMeta, factory: (o = {}) => createNode({ type: 'my-button', style: o.style || {} }) }
</script>
```

Toolbar tự hiện WkSegmented variant picker. User chọn "Hover" + edit `bg_color` → `_routeState` divert vào `states.hover.style.backgroundColor` → `stateCss` compose CSS `[data-node-id="..."]:hover { background: ... !important }`.

### 3.4. Satellite (Tab ↔ TabContent / List ↔ ListItem)

Owner declares `satellite`:

```js
// nodes/tab/meta.js
satellite: { type: 'tab-content', configKey: 'satelliteId' },
```

Owner mounts `satelliteOwner` mixin:

```vue
<script>
import { nodeContainer, draggableNode } from '@/composable/editor_v2/mixins'
import { satelliteOwner } from '@/composable/editor_v2/mixins/satelliteOwner'

export default {
  mixins: [nodeContainer, draggableNode, satelliteOwner],
  // satelliteId + satelliteNode được expose qua mixin
}
</script>

<template>
  <div ref="root" ...>
    <!-- tab items vẫn trong data.nodes -->
    <NodeRenderer v-for="id in node.data.nodes" :key="id" :node-id="id" />
    <!-- satellite render qua satelliteId -->
    <NodeRenderer v-if="satelliteId" :node-id="satelliteId" />
  </div>
</template>
```

Satellite element thường có `rules.locked: true` + `rules.hideInLayer: true`:

```js
// nodes/tab_content/meta.js
rules: { locked: true, hideInLayer: true, edgeOverlay: { padding: false } },
```

`ensureSatellite()` chạy `$nextTick(mounted)` → nếu chưa có, gọi `factoryFor('tab-content')` → `addDetachedNode(node, ownerId)` → ghi `satelliteId` vào `config`.

Satellite KHÔNG xuất hiện trong Layers, KHÔNG drag tách rời, KHÔNG delete riêng. Bị xoá khi owner xoá (cascade qua `remove`).

### 3.5. Locked (Page / Header / Footer / system)

```js
rules: { locked: true, hideInLayer: true }
```

- `remove(id)` refuse
- `duplicate(id)` refuse
- `onMoveDragStart` early-return (e.preventDefault)
- LayerItem ẩn (theo `hideInLayer`)
- ElementToolbar disable trash + duplicate

## 4. Element catalog hiện tại (16 type)

| Type | Label | Folder | Category | Container | Mixins (+opt-in) | Notes |
|---|---|---|---|---|---|---|
| `root` | Page | `root_canvas` | system | yes | (custom) | locked + hideInLayer |
| `flex-section` | Section | `flex_section` | layout | yes | nodeContainer + draggableNode | isRootOnly |
| `flex-block` | Block | `flex_block` | layout | yes | nodeContainer + draggableNode | — |
| `heading` | Heading | `heading` | basic | no | nodeLeaf + draggableNode | isContentEditable |
| `text` | Text body | `text` | basic | no | nodeLeaf + draggableNode | isContentEditable |
| `button` | Button | `button` | basic | no | nodeLeaf + draggableNode + statefulNode | states: default/hover/active |
| `image` | Image | `image` | basic | no | nodeLeaf + draggableNode | asset-picker |
| `image-comparison` | Image Comparison | `image-comparison` | basic | no | nodeLeaf + draggableNode | dual asset |
| `icon` | Icon | `icon` | basic | no | nodeLeaf + draggableNode | Lucide picker |
| `list` | List | `list` | basic | yes | nodeContainer + draggableNode + satelliteOwner | items = list-item children |
| `list-item` | List item | `list_item` | basic | yes | nodeContainer + draggableNode | bị `ListItemsTrait` quản lý |
| `tab` | Tab | `tab` | basic | yes | nodeContainer + draggableNode + satelliteOwner | satellite: tab-item |
| `tab-content` | Tab content | `tab_content` | basic | yes | nodeContainer + draggableNode | child của tab |
| `tab-item` | Tab item | `tab_item` | basic | no | nodeLeaf | satellite — locked |
| `breadcrumb` | Breadcrumb | `breadcrumb` | basic | no | nodeLeaf + draggableNode | separator + crumbs |
| `text-marquee` | Text marquee | `text-marquee` | basic | yes | nodeContainer + draggableNode | `nodeChildAllows: ['text']` — only Text children |

> Tham khảo `composable/editor_v2/templates/hero.js` cho composite page template — drop nhiều element qua `buildTemplate(id)`.

## 5. Common conventions

| Việc | Quy ước |
|---|---|
| Folder element | `nodes/<snake_case>/` |
| File trong folder | `index.vue` (component), `meta.js` (data), `ai.js` (optional hints) |
| Type string | kebab-case (`flex-section`, `image-comparison`) |
| CSS class | prefix `wk-`, BEM modifier `--`, element `__` |
| Mixin compose | `[nodeLeaf\|nodeContainer, draggableNode, ...opt-in]` |
| Default render container | `<NodeRenderer v-for>` cho children |
| Read data | `mergedStyle`, `mergedConfig`, `mergedSpecials` (mixin) |
| Write data | `changeStyle / changeConfig / changeSpecials` qua mixin shortcut hoặc `useNodeStore()` |
| Hardcoded type string trong code | TRÁNH — lookup `getDef(type)` hoặc `meta.rules` |
| Component nội bộ | Đặt cạnh file element (vd `./SeparatorIcon.vue`), KHÔNG trong `nodes/` cấp 1 |
| API call trong element | Watch `mergedSpecials.xxxId`, async fetch, cleanup ở `beforeUnmount` |
| Trait default per-bp | Dùng `default: { base, mobile, ... }` (object có key bp/reserved) hoặc `defaults.responsive.<bp>` |
| Trait default complex value (key trùng bp name) | Wrap qua `{ base: {...} }` |

## 6. Wk* components reusable (webcake-ui-kit)

Trait widget nên ưu tiên Wk* components thay vì raw HTML/Tailwind:

| Wk component | Dùng cho |
|---|---|
| `WkInput` | Text input, number input |
| `WkSelect` + `WkSelectOption` | Dropdown |
| `WkTabs` | Tab group (vd width-mode fill/fit/fixed) |
| `WkSegmented` | Toggle group (vd state picker) |
| `WkToggle` | Boolean switch |
| `WkSlider` | Numeric slider |
| `WkButton` | Generic button |
| `WkDivider` | Section divider |
| `WkiXxx` (icons) | Icon SVG từ `webcake-ui-kit/icons` |

Skill `builderx_spa-figma-to-ui-kit` có flow đầy đủ để translate Figma → Wk* widget.

## 7. Roadmap

### Tier 1 (ngắn hạn)

- [x] Folder-per-type registry
- [x] meta.defaults seed via factory wrap
- [x] Trait panel schema-driven (TraitField + applyTrait)
- [x] LayerItem đọc registry label/icon
- [x] Sidebar picker per category
- [x] Stateful pattern (Button hover/active)
- [x] Satellite pattern (Tab ↔ TabContent, List ↔ ListItem)
- [x] InlineContentEditable (Heading/Text/Button)
- [x] Element catalog: 16 user-facing types
- [ ] Spacer + Divider primitive
- [ ] Reset-to-default per trait field button

### Tier 2 (trung hạn)

- [ ] Multi-select (shift-click) → events.selected > 1
- [x] Undo/Redo qua PatchRecorder (xem [`10-history.md`](./10-history.md))
- [ ] Copy / Cut / Paste qua clipboard (chỉ duplicate trong canvas)
- [ ] Lock/hide UI toggle trong Layers (rule đã có, UX chưa)
- [ ] Reorder satellites (drag tab-item theo display order)
- [x] AI Generate page Phase 1 (xem [`09-ai-page-generation.md`](./09-ai-page-generation.md))

### Tier 3 (dài hạn)

- [ ] Linked nodes (ProductSlider Pattern B)
- [x] Save/Load page state qua `useEditorPageStore`
- [x] Multi-page navigation (`usePageListStore`)
- [ ] AI inline-edit selected (Phase 2)
- [ ] Keyboard nav (arrow chọn sibling, Esc deselect)
- [ ] Custom elements ecosystem (3rd-party register meta)

## 8. AI-ready metadata (recommended)

Khi build element mới + có lộ trình tích hợp AI gen, fill thêm `ai.js` đầy đủ:

```js
export const ai = {
  description: '1-2 câu mô tả semantic role',
  hints: {
    useWhen:     ['scenario 1', 'scenario 2'],
    avoidWhen:   ['use Heading for SEO instead'],
    contentTips: ['short label, max 30 chars'],
  },
  expectedChildren: {                         // container only
    typical: ['heading', 'text', 'button'],
    patterns: ['heading + text + button (CTA)'],
  },
  layoutHints: {                              // container only
    whenChildren: {
      1:     { flexDirection: 'column' },
      '2-3': { flexDirection: 'row', gap: '24px' },
      '4+':  { flexDirection: 'row', gap: '16px' },
    },
  },
  examples: [
    { description: 'CTA button', def: { type: 'button', specials: { text: 'Get started' } } },
  ],
  semantics: ['cta', 'above-fold-ok'],
}
```

Container element: `expectedChildren` + `layoutHints`.
Storefront element (commerce): `dataBindings` + `pageContext`.

Skill `builderx_spa-editor-v2-ai-gen` có template đầy đủ.
