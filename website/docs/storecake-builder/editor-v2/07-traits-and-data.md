---
sidebar_position: 8
title: 07 — Traits & Schema
---

# 07 — Trait Panel, Data Model & Schema System

Deep dive vào: data model 3 namespace, cascade desktop-first, trait registry (Vue-free `definitions.js` + composition `registry.js`), style renderers co-located với definitions, `buildElementSchema` (mirror per-bp), `meta.defaults` với factory wrap, helpers JSON Schema, store-level guard. Đây là **superset** thay phần "data model" trong `01-architecture.md` (đã outdate) và phần "trait panel" trong `05-extending.md`.

---

## 1. Folder layout

```
src/components/editor_v2/
├── nodes/                          # ELEMENT folder-per-type
│   ├── flex_block/
│   │   ├── index.vue               # Vue component + factory composition
│   │   ├── meta.js                 # runtime: type, label, traits, rules, defaults
│   │   └── ai.js                   # AI-only: description, hints, examples
│   ├── flex_section/
│   │   ├── index.vue
│   │   ├── meta.js
│   │   └── ai.js
│   ├── heading/
│   │   ├── index.vue
│   │   ├── meta.js
│   │   └── ai.js
│   └── root_canvas/
│       ├── index.vue
│       └── meta.js                 # system node, không có AI hints
└── components/trait/
    ├── components/                 # widget Vue (rendered trong trait panel)
    │   ├── TraitField.vue          # dispatcher render đúng widget cho attribute
    │   ├── TraitItemWrapper.vue
    │   ├── TraitAssetInput.vue
    │   └── fields/                 # widget per trait key
    │       ├── WidthSelectTrait.vue
    │       ├── HeightSelectTrait.vue
    │       ├── PaddingTrait.vue
    │       ├── ShadowTrait.vue
    │       ├── CornerTrait.vue
    │       ├── BackgroundColorTrait.vue
    │       ├── BackgroundImageTrait.vue
    │       ├── BackgroundVideoTrait.vue
    │       └── ...
    └── fields/                     # PURE DATA (Vue-free)
        ├── definitions.js          # DEFINITIONS_DATA, buildElementSchema, normalizeResponsiveSlot
        ├── styleRenderers.js       # (node) → CSS object — co-located với definitions
        ├── registry.js             # gắn Vue widget vào data
        └── schema_helpers.js       # helpers build JSON Schema
```

Convention 4 file/element folder:
- `index.vue` — Vue component + factory (cần `createNode` qua Vite alias)
- `meta.js` — **Vue-free** pure data, CI scripts import được trong plain Node
- `ai.js` (optional) — sidecar AI hints, chỉ AI-page-gen feature load lazy
- Folder name = snake_case của element type

---

## 2. Data model — 3 namespace + responsive

```js
node = {
  id: 'fs_abc12345',
  data: {
    type: 'flex-section',
    parent: 'ROOT',
    nodes: ['fb_xxx', 'fb_yyy'],
    isCanvas: true,
    hidden: false,
    custom: {},

    style:    { /* CSS responsive */         padding: '32px 0px', '--node-width': 'fill' },
    config:   { /* DATA per-bp (hiếm)  */    contentWidth: 'fill_container' },
    specials: { /* base-only metadata  */    htmlTag: 'h2' },
    events:   [ /* base-only behaviors */ ],
    bindings: [ /* base-only data refs */ ],

    responsive: {
      mobile: {
        style:  { '--layout-direction': 'vertical' },
        config: {},
      },
      // tablet/laptop/desktop có thể không có slot → cascade từ base
    },
  },
  dom: null,
  events: {},
}
```

### Phân loại field theo namespace

| Câu hỏi | → Namespace |
|---|---|
| Field có meaningful khác giữa desktop và mobile? YES + CSS | `style` |
| YES + DATA (vd image src crop khác bp) | `config` |
| NO | `specials` |

| Field | Namespace | Lý do |
|---|---|---|
| `padding`, `margin`, `gap`, `background`, `boxShadow`, `borderRadius`, `--node-width`, `--layout-direction` | `style` | CSS / CSS var, hay đổi theo bp |
| `contentWidth`, `backgroundType`, `isPaddingLinked`, `backgroundVideoUrl`, `animation` | `config` | Data quyết định render-mode hoặc per-bp behavior |
| `htmlTag`, `text` Heading, `htmlId`, `className`, `ariaLabel`, `productId` | `specials` | Content / DOM metadata không đổi theo bp |

### CSS custom properties

Trait `width_select`, `height_select`, `direction`, `vertical`, `horizontal`, `content_width` ghi vào **CSS variable** trên element (`--node-width`, `--layout-direction`, `--layout-vertical`, …). Element CSS scoped đọc qua `var(--node-width)` để áp dụng layout rule tương ứng. Tại sao CSS var:

1. **Tách config khỏi computed CSS** — `--node-width: fill` là enum value, không phải `width: 100%` final. Renderer SFC convert qua selector `[style*="--node-width:fill"]` hoặc tự logic style.
2. **Inspector dễ đọc** — devtools hiển thị `--node-width: fill` thay vì `width: 100%; flex-grow: 1; …`.
3. **Reset / inherit** — bỏ key trong style slot → CSS var fallback về default declared trong SFC scoped style.

---

## 3. Cascade desktop-first

Source: `composable/editor_v2/mergeNode.js`.

```
mergedStyle ở 'mobile' = data.style                              ← base
                       ⊕ data.responsive.desktop.style          ← cascade xuống
                       ⊕ data.responsive.laptop.style
                       ⊕ data.responsive.tablet.style
                       ⊕ data.responsive.mobile.style           ← current wins last

# Phase 2 fallback (key vẫn chưa có): điền từ bp NHỎ hơn current
                       ⊕ key chưa có ← data.responsive.<bp width < current>.style
```

Loop walk `BREAKPOINTS` (desktop → mobile in `constants.js`):
- **Phase 1**: slot width ≥ current → APPLY (gần current trước). Sau current → BREAK.
- **Phase 2**: slot width < current → chỉ điền key CHƯA có trong merged (fallback lên).

```js
export const mergeNamespace = (node, ns, currentBpKey) => {
  const data = node?.data
  if (!data) return {}
  const base = data[ns] || {}
  const responsive = data.responsive || {}
  const curBpDef = BREAKPOINTS.find((b) => b.key === currentBpKey)
  if (!curBpDef) return { ...base }

  let merged = { ...base }
  // Phase 1: cascade xuống
  for (const bp of BREAKPOINTS) {
    if (bp.width < curBpDef.width) continue
    const slot = responsive[bp.key]
    if (slot && slot[ns]) merged = { ...merged, ...slot[ns] }
    if (bp.key === currentBpKey) break
  }
  // Phase 2: fallback lên — chỉ điền key chưa có
  for (const bp of BREAKPOINTS) {
    if (bp.width >= curBpDef.width) continue
    const slot = responsive[bp.key]
    if (!slot || !slot[ns]) continue
    for (const k in slot[ns]) {
      if (k in merged) continue
      merged[k] = slot[ns][k]
    }
  }
  return merged
}
```

`specials` cố ý KHÔNG cascade — luôn base only.

### Why fallback up?

Phase 2 xử lý case AI / hydrate trả slot CHỈ trong `mobile` (vd user thiết kế mobile-first chưa set base/desktop). Ở viewport desktop, không có slot `desktop`, nhưng `mobile.--layout-direction='vertical'` không nên leak. Nhưng nếu **base hoàn toàn rỗng** + chỉ mobile có giá trị, cần ít nhất render được gì đó → fallback. Edge case: nếu user thực sự muốn key chỉ hiện ở mobile, phải set explicit `undefined` ở base hoặc dùng `defaults.responsive.desktop.<key> = '...'`.

---

## 4. Trait registry — 3 file pure data

### 4.1. `schema_helpers.js` — JSON Schema builders

Output đúng JSON Schema chuẩn → Ajv ăn trực tiếp, AI tool schema pass-through (không cần translate layer).

```js
// Primitives
string({ default, pattern, minLength, maxLength, format })
number({ min, max, default, integer })
integer({ min, max, default })
boolean({ default })

// Enums
enumOf('row', 'column')                        // { enum: ['row', 'column'] }
oneOfEnum({                                    // { oneOf: [{const, description}, ...] }
  fill_container: 'Stretch to parent',
  fit_content:    'Shrink to content',
})

// Composite
object({ key: schema }, { required, additionalProperties })
array(itemSchema, { minItems, maxItems })
anyOf(s1, s2)
oneOf(s1, s2)
nullable(schema)                               // { anyOf: [schema, { type: 'null' }] }

// Modifiers
withDescription(schema, desc)
withDefault(schema, value)

// CSS-specific
cssLength()                                    // pattern: 10px / 1.5rem / 50%
cssSides()                                     // pattern: 1-4 CSS lengths
cssColor()                                     // loose string (parser check upstream)
htmlId()                                       // pattern: valid HTML id
cssClass()                                     // pattern: space-separated class list
url()                                          // format: uri

// Responsive
responsive(schema, breakpoints)                // accept primitive OR { base, sm, md, ... }
```

### 4.2. `definitions.js` — `DEFINITIONS_DATA` + builders

Pure data, không import Vue. Mỗi entry mô tả 1 trait widget bằng `{ writes }` map:

```js
export const DEFINITIONS_DATA = {
  width_select: {
    writes: {
      '--node-width': {                         // key sẽ ghi vào target (CSS var)
        target: 'style',                        // 'style' | 'config' | 'specials'
        schema: oneOfEnum({
          fill:  'Stretch to the parent width (default)',
          fit:   'Shrink to the content width',
          fixed: 'Fixed width for element',
        }),
      },
      '--node-width-custom': {                  // pair với fixed mode
        target: 'style',
        schema: number(),
      },
    },
  },
  padding: {
    writes: {
      padding:         { target: 'style',  schema: cssSides({ default: '0px' }) },
      isPaddingLinked: { target: 'config', schema: boolean({ default: false }) },
    },
  },
  html_tag: {
    writes: {
      htmlTag: {
        target: 'specials',
        schema: withDescription(
          withDefault(
            oneOfEnum({
              h1: 'H1 — page hero, only one per page for SEO',
              h2: 'H2 — major section title',
              p:  'P — paragraph / body copy',
              // ...
            }),
            'h2'
          ),
          'HTML tag — affects SEO and accessibility outline.'
        ),
      },
    },
  },
}
```

Một definition **CÓ THỂ ghi nhiều key vào nhiều target** (vd `bg_image` ghi 5 style key + 1 config key `backgroundType`).

**Định nghĩa được ship hiện tại** (snapshot):

| Definition key | writeKeys → target | Mục đích |
|---|---|---|
| `width_select` | `--node-width`, `--node-width-custom` → style | Width mode (fill/fit/fixed) |
| `height_select` | `--node-height`, `--node-height-custom` → style | Height mode |
| `padding` | `padding` → style, `isPaddingLinked` → config | Padding shorthand + lock UI |
| `margin` | `margin` → style | Margin shorthand |
| `padding_margin` | `padding`, `margin` → style, `isLinkedPaddingMargin` → config | Combined advanced spacing |
| `content_width` | `contentWidth`, `contentWidthCustom` → config | Section/block content max-width |
| `direction` | `--layout-direction` → style | flex direction (vertical/horizontal) |
| `gap` | `gap` → style | Flex gap |
| `vertical` | `--layout-vertical` → style | Cross-axis align |
| `horizontal` | `--layout-horizontal` → style | Main-axis align |
| `bg_color` | `background` → style, `backgroundType` → config | Color background |
| `bg_image` | 5× background-* → style, `backgroundType` → config | Image background |
| `bg_video` | `backgroundVideoUrl`, `backgroundVideoSize`, `backgroundType` → config | Video background |
| `border` | `borderColor/Width/Style`, 4× side widths → style, `isSeparateBorderWidth` → config | Border |
| `corner` | `borderRadius`, 4× corner radii → style, `isSeparateBorderRadius` → config | Border radius |
| `shadow` | `boxShadow` → style | Box shadow (composed string) |
| `animation` | `animation` → config | Animation config object |
| `display` | `hidden` → config | Visibility toggle |
| `html_tag` | `htmlTag` → specials | Heading semantic tag |

`getDefinitionData(keyOrAttribute)` — accept cả string (`'width_select'`) lẫn object (`{key: 'width_select', label: '...'}`).

#### `normalizeResponsiveSlot(slot)`

Accept 2 shape khi user / AI / migration cũ trả responsive slot:

```js
// Canonical
{ style: { padding: '10px' }, config: { contentWidth: 'fill_container' } }

// Flat (writeKey trực tiếp ở slot level) — phải route theo WRITE_KEY_TARGETS
{ padding: '10px', contentWidth: 'fill_container' }
// → { style: { padding: '10px' }, config: { contentWidth: 'fill_container' } }
```

`WRITE_KEY_TARGETS` build từ `DEFINITIONS_DATA` (`writeKey → target`) — lookup mỗi key, drop key không định danh. Dùng để chuẩn hóa `meta.defaults.responsive[bp]` (user thường viết flat) và payload từ AI gen.

### 4.3. `styleRenderers.js` — `(node) → CSS object`, co-located

Mỗi trait có CSS phức hợp tự viết renderer trong cùng file. Pure function, đọc qua `getStyle(node, key, fallback)` / `getConfig(node, key, fallback)` — 2 helper tự đọc namespace tại active breakpoint từ UI store.

```js
export const STYLE_RENDERERS = {
  shadow(node) {
    const v = getStyle(node, 'boxShadow')
    return v ? { boxShadow: v } : {}
  },

  border(node) {
    const color = getStyle(node, 'borderColor', '#000000')
    const style = getStyle(node, 'borderStyle', 'solid')
    if (!getConfig(node, 'isSeparateBorderWidth', false)) {
      const w = getStyle(node, 'borderWidth', 0)
      return { border: `${w}px ${style} ${color}` }
    }
    const out = {}
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      const w = getStyle(node, `border${side}Width`, 1)
      out[`border${side}`] = `${w}px ${style} ${color}`
    }
    return out
  },

  bg_image(node) {
    if (getConfig(node, 'backgroundType') !== 'image') return {}
    const url = getStyle(node, 'backgroundImage')
    if (!url) return {}
    return {
      background: `url(${url}) ${getStyle(node, 'backgroundPosition', 'top left')} `
                + `/ ${getStyle(node, 'backgroundSize', 'cover')} `
                + `${getStyle(node, 'backgroundRepeat', 'no-repeat')} `
                + `${getStyle(node, 'backgroundAttachment', 'scroll')}`,
    }
  },

  // ... corner, gap, bg_color, padding_margin, flexCanvas, canvasNodeWrapper
}
```

**Renderer key trùng với definition key.** Khi `registerElement` chạy:
- Walk `meta.traits` → tìm renderer cho mỗi attribute → push vào array
- Lưu trong `def.renderers` (precomputed)
- `nodeBase.commonStyleData` lặp `def.renderers` → merge output

Lợi:
- Tách CSS composition khỏi trait widget (widget chỉ emit raw value)
- Không re-walk traits mỗi render — renderer list cached
- 1 trait key = 1 nguồn cho schema + widget + CSS — đổi tên trait đổi cùng chỗ

Element-specific style (layout vars, gap, padding mặc định) **spread sau** `commonStyleData` để element có final word:

```vue
<template>
  <div :style="{ ...commonStyleData, ...layoutVars }">
```

---

## 5. Element meta — runtime data với defaults

### 5.1. `meta.js` — shape

```js
// nodes/flex_block/meta.js
export const meta = {
  type: 'flex-block',                          // unique key
  label: 'Block',                              // sidebar / layers display
  category: 'layout',                          // sidebar group
  showInSidebar: false,                        // hidden trong sidebar picker
  isContainer: true,                           // accept children drop
  rules: {
    isRootOnly: false,                         // drop-rule
    edgeOverlay: { marginSides: { left: false, right: false } },  // optional UI rule
  },

  // Defaults — fill-missing semantics khi factory chạy
  defaults: {
    style: {
      '--node-height': 'fill',
      '--node-width': 'fill',
      '--layout-direction': 'horizontal',
      '--layout-vertical': 'top',
      '--layout-horizontal': 'left',
      padding: '0px',
      margin: '0px',
    },
    config: {
      contentWidth: 'fill_container',
    },
    responsive: {
      desktop: { '--layout-direction': 'horizontal' },
      tablet:  { '--layout-direction': 'horizontal' },
      mobile:  { '--layout-direction': 'vertical' },
      // flat shape OK — normalizeResponsiveSlot tự route
    },
  },

  traits: {
    general: [
      { key: 'size',       label: 'Size',       attributes: [{ key: 'width_select' }, 'height_select'] },
      { key: 'layout',     label: 'Layout',
        attributes: ['direction', 'gap', 'padding', 'vertical', 'horizontal',
                     { key: 'margin', visible: false }] },
      { key: 'background', label: 'Background', attributes: ['bg_color', 'bg_image', 'bg_video'] },
      { key: 'shape',      label: 'Shape',      attributes: ['border', 'corner', 'shadow'] },
    ],
    advanced: [
      { key: 'spacing',   label: 'Spacing',   attributes: ['padding_margin'] },
      { key: 'display',   label: 'Display',   attributes: ['display'] },
      { key: 'animation', label: 'Animation', attributes: ['animation'] },
    ],
  },
}
```

**Không có** `factory` (sống trong `index.vue` vì cần `createNode` qua Vite alias).
**Không có** `description / aiHints / examples` (sống trong `ai.js`).

### 5.2. Defaults — keys = writeKey thực, không phải definition slug

`defaults.style.padding` — writeKey trong target `style` (vì `padding` definition ghi `padding` key). KHÔNG ghi `defaults.style.padding_widget` hoặc `defaults.style.spacing` — đó là tên definition / group, không phải writeKey.

Cùng quy ước với CSS var: `defaults.style['--node-width'] = 'fill'`.

### 5.3. Factory wrap trong `registerElement`

Source: `composable/editor_v2/registry.js`.

```js
export const registerElement = (meta, component) => {
  const defaults = normalizeDefaults(meta.defaults)        // ensure { style, config, specials, responsive }
  const origFactory = meta.factory
  const factory = origFactory
    ? (overrides) => {
        const node = origFactory(overrides)
        if (!node || !node.data) return node
        // Fill-missing semantics — factory / overrides win over defaults.
        node.data.style    = { ...defaults.style,    ...(node.data.style    || {}) }
        node.data.config   = { ...defaults.config,   ...(node.data.config   || {}) }
        node.data.specials = { ...defaults.specials, ...(node.data.specials || {}) }
        if (Object.keys(defaults.responsive).length) {
          node.data.responsive = node.data.responsive || {}
          for (const bpKey in defaults.responsive) {
            const defSlot = normalizeResponsiveSlot(defaults.responsive[bpKey])
            const existing = node.data.responsive[bpKey] || {}
            node.data.responsive[bpKey] = {
              style:  { ...defSlot.style,  ...(existing.style  || {}) },
              config: { ...defSlot.config, ...(existing.config || {}) },
            }
          }
        }
        return node
      }
    : null
  const allowedKeys = extractAllowedKeys(meta.traits)
  const renderers = collectRenderers(meta.traits)
  reg[meta.type] = { ...meta, factory, defaults, allowedKeys, renderers, component }
}
```

Lợi:
- `meta.js` chỉ liệt kê value mới, không cần spread defaults trong từng `createNode` call
- AI gen output `{ type, style: {} }` minimal — factory tự fill defaults vào
- Đổi default trong `meta.js` apply cho mọi instance mới (không touch index.vue)

### 5.4. `index.vue` — Vue + factory composition

```vue
<script>
import { Plus } from '@lucide/vue'
import { nodeContainer, draggableNode } from '@/composable/editor_v2/mixins'
import { createNode } from '@/composable/editor_v2/createNode'
import { meta as baseMeta } from './meta.js'
import NodeRenderer from '../../elements/NodeRenderer.vue'

export default {
  name: 'FlexBlockV2',
  components: { NodeRenderer, Plus },
  mixins: [nodeContainer, draggableNode],
  computed: { /* ... */ },
}

// Compose runtime meta — spread base + thêm factory.
// Factory chỉ trả minimal node — registry sẽ wrap để fill defaults.
export const meta = {
  ...baseMeta,
  factory: (overrides = {}) =>
    createNode({
      type: 'flex-block',
      isCanvas: true,
      style: overrides.style || overrides,
      config: overrides.config || {},
    }),
}
</script>
```

### 5.5. `ai.js` — AI-page-generation hints

```js
// nodes/flex_block/ai.js
export const ai = {
  description: '...',
  hints: { useWhen, avoidWhen, contentTips },
  expectedChildren: { typical, patterns },
  layoutHints: { whenChildren },
  examples: [
    { description: 'Vertical CTA stack', def: { type: 'flex-block', style: {...}, children: [...] } },
  ],
  semantics: ['layout', 'container', 'inner-layout'],
}
```

**Không runtime code import `ai.js`** — chỉ AI-page-gen feature `import('./<element>/ai.js')` lazy. Production bundle không kéo.

### 5.6. Auto-registration

`composable/editor_v2/registerElements.js` glob `nodes/*/index.vue` 1 lần lúc PageWrapper mount. Mỗi index.vue export `default` (Vue component) + `meta` (composed) → `registerElement(meta, component)`.

Thêm element mới: tạo folder + 2-3 file, **không sửa registry**.

---

## 6. Attribute shapes — 3 dạng

Trait panel hỗ trợ 3 shape attribute (mix-and-match được):

### 6.1. Definition ref (string)

```js
attributes: ['width_select', 'height_select']
```

TraitField resolve qua `getComponentDefinition('width_select')` → render widget tương ứng.

### 6.2. Definition ref với override

```js
attributes: [
  { key: 'width_select', disabled: true },
  { key: 'padding', label: 'Inner spacing' },
  { key: 'margin', visible: false },           // ẩn UI nhưng vẫn declare → allowedKeys vẫn cover
]
```

Cùng resolve qua definition key, kèm thêm `label`/`disabled`/`visible` per-instance.

### 6.3. Legacy inline-spec (đang migrate dần)

```js
{
  key: 'fontSize',
  type: 'number',
  target: 'style',
  label: 'Font size',
  default: 24,
  props: { min: 10, max: 96, suffix: 'px' },
}
```

Không qua DEFINITIONS_DATA. TraitField cũ resolve `type → component` trực tiếp. `buildElementSchema` **SKIP** inline-spec (không có definition tương ứng). `extractAllowedKeys` thì vẫn add `attr.key` vào set theo `attr.target` để store guard không drop nhầm.

Migrate bằng cách thêm definition tương ứng vào `definitions.js`.

---

## 7. TraitField runtime

`components/trait/components/TraitField.vue` — dispatcher đơn giản:

```vue
<template>
  <template v-if="visible">
    <component
      :is="componentDefinition.component"
      v-if="componentDefinition && componentDefinition.component"
      :attribute="attribute"
      :node="node"
      :node-id="node.id"
      :disabled="resolvedDisabled"
      @change="onChange"
    />
    <span v-else>[unsupported field]</span>
  </template>
</template>

<script>
methods: {
  onChange(key, value, patch, opts) {
    const writes = this.componentDefinition.writes
    if (!writes[key]) {
      console.error('[editor_v2] invalid key:', key)
      return
    }
    const target = writes[key].target
    if (target === 'style')         this.store.changeStyle(this.node.id, { [key]: value }, opts)
    else if (target === 'config')   this.store.changeConfig(this.node.id, { [key]: value }, opts)
    else if (target === 'specials') this.store.changeSpecials(this.node.id, { [key]: value })
  },
},
</script>
```

Widget tự lo:
- Đọc value từ node (qua `mergeNamespace(node, target, breakpointActive)` hoặc helper `getStyle/getConfig`)
- Render UI (input/select/dialog/picker)
- Emit `change(key, value, patch?, opts?)` khi user edit
- Có thể emit nhiều key khác nhau (vd PaddingTrait emit `padding` hoặc `isPaddingLinked`)

TraitField chỉ làm 2 việc: resolve definition → dispatch theo target.

### Multi-write widget

Widget có nhiều key trong `writes` (vd `padding`) emit từng key riêng — TraitField route mỗi key vào đúng target. Không cần widget biết về store namespace.

```js
// PaddingTrait emits:
$emit('change', 'padding', '20px 24px')           // → changeStyle({padding: '20px 24px'})
$emit('change', 'isPaddingLinked', true)          // → changeConfig({isPaddingLinked: true})
```

---

## 8. `buildElementSchema` — JSON Schema với responsive mirror

### 8.1. Output shape

Walk `meta.traits.general` + `meta.traits.advanced`, resolve attribute via `getDefinitionData`, gom keys theo target → output JSON Schema. Phần `responsive` **mirror full** base style/config cho mọi breakpoint (LLM có thể override bất kỳ key nào ở bất kỳ bp nào):

```js
{
  type: 'object',
  properties: {
    style:    { type: 'object', properties: { '--node-width': {...}, padding: {...}, ... },
                additionalProperties: false },
    config:   { type: 'object', properties: { contentWidth: {...}, isPaddingLinked: {...} },
                additionalProperties: false },
    specials: { type: 'object', properties: { htmlTag: {...} },
                additionalProperties: false },
    responsive: {
      type: 'object',
      properties: {
        desktop: { type: 'object',
                   properties: { style: {properties: { ... }}, config: {...} },
                   additionalProperties: false },
        laptop:  { ... },
        tablet:  { ... },
        mobile:  { ... },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
}
```

### 8.2. Default propagation

Khi `meta.defaults.style[k] = X`:
- Schema base: `properties.style.properties[k].default = X`
- Schema responsive: per-bp slot, nếu `meta.defaults.responsive[bp][k] = Y` (sau khi normalize) thì `responsive[bp].style[k].default = Y`. Không có override → default bị strip ở slot đó (LLM hiểu là không có giá trị riêng).

Helper-level default (vd `boolean({ default: false })`) bị strip trước khi gán element default. Lý do: helper default là "tham khảo cho widget UI", nhưng element có thể muốn khác (vd `isPaddingLinked` mặc định `true` ở section). Element default thắng tuyệt đối.

```js
const out = cloneSchema(schema)
delete out.default                                    // strip helper default
const override = elemDefaults[target] && elemDefaults[target][writeKey]
if (override !== undefined) out.default = override
buckets[target][writeKey] = out
```

### 8.3. Use cases

| Consumer | Format dùng |
|---|---|
| **AI page generation** | LLM tool input — schema feed vào `tools` param. LLM trả `{ style:{'--node-width':'fill'}, config:{...} }` đúng shape |
| **Runtime patch validate** | Ajv compile schema → check user paste / undo redo / dev console không tạo key xấu |
| **Doc generator** | "Block có thể set những gì" bảng tự động |
| **External validator** | Backend Elixir verify page def hợp lệ trước khi save |

### 8.4. CI scripts (planned)

```
scripts/
├── validate-trait-schemas.mjs   # CI lint — per-definition + per-element check
└── build-trait-schemas.mjs      # emit JSON files vào schemas/
```

**Validator** (`npm run validate:schemas`):
- Per-definition: Ajv compile mỗi `writes[k].schema`, check target hợp lệ
- Per-element: walk `nodes/*/meta.js`, run `buildElementSchema(meta)`, check output Ajv-compilable, check không duplicate key cross-target

**Builder** (`npm run build:schemas`):
- `schemas/trait-definitions.json` — flat `{ defKey: { writes: { writeKey: { target, schema } } } }`
- `schemas/elements/<type>.json` — per-element `buildElementSchema(meta)` output
- `schemas/elements.json` — combined `{ type: schema }`

Cả 2 chạy **plain Node** (không cần vite-node) vì `definitions.js` + element `meta.js` đều Vue-free.

---

## 9. Store-level guard — `allowedKeys`

`stores/editor_v2/node.js#writeNamespaceWithRec` là chokepoint duy nhất cho cả 3 hàm `changeStyle/Config/Specials` + reset variants + `_writeByPolicy`. Tại đây check whitelist:

```js
function writeNamespaceWithRec(rec, state, id, ns, patch, slot) {
  const node = state.nodes[id]
  if (!node || !patch) return
  const allowed = getAllowedKeys(node.data.type, ns)
  if (allowed && allowed.size) {
    for (const key in patch) {
      if (!allowed.has(key)) {
        console.warn(`[editor_v2] ${node.data.type}.${ns}: unknown key '${key}' (not declared in traits) — dropped`)
        delete patch[key]
      }
    }
  }
  // ... actual write via rec.set
}
```

`getAllowedKeys(type, ns)` (exported từ `registry.js`) trả Set của allowed writeKey, **precomputed lúc `registerElement`**. Build từ `extractAllowedKeys(meta.traits)` — union 2 nguồn:
- **Definition ref** → expand `def.writes`, add từng writeKey vào set theo target
- **Legacy inline-spec** → add `attr.key` vào set theo `attr.target`

Walk both `traits.general` + `traits.advanced` (mỗi cái là tab array hoặc object → groups → fields).

Empty Set = "no rules declared" → skip check (system nodes / type chưa register).

### Guard layers

| Layer | Khi nào fire | Hành vi key lạ |
|---|---|---|
| `TraitField.onChange` | UI thao tác trên trait panel | `console.error` + return |
| `writeNamespaceWithRec` | Chokepoint mọi change* + reset* + writeByPolicy | `console.warn` + drop key, write rest |
| `validate:schemas` CI | Mỗi PR vào master | Fail build |

---

## 10. Adding a new trait field type

### 10.1. Định nghĩa

Thêm vào `definitions.js`:

```js
import { number, withDescription } from './schema_helpers.js'

export const DEFINITIONS_DATA = {
  // ... existing
  font_size: {
    writes: {
      fontSize: {
        target: 'style',
        schema: withDescription(number({ min: 8, max: 200, default: 16 }), 'Font size in px'),
      },
    },
  },
}
```

### 10.2. Build widget

Tạo `components/trait/components/fields/FontSizeTrait.vue`:

```vue
<template>
  <TraitItemWrapper :label="attribute.label || 'Font size'">
    <WkInput
      type="number"
      :value="fontSize"
      :disabled="disabled"
      :min="8"
      :max="200"
      @change="$emit('change', 'fontSize', Number($event))"
    />
  </TraitItemWrapper>
</template>

<script>
// đọc value qua getStyle(node, 'fontSize', 16) + emit 'change' event với key/value
</script>
```

### 10.3. (Optional) Style renderer

Nếu CSS output phức hợp (composed string, conditional fallback), thêm vào `styleRenderers.js`:

```js
font_size(node) {
  const v = getStyle(node, 'fontSize')
  return v ? { fontSize: `${v}px` } : {}
},
```

Nếu chỉ là 1-to-1 raw assignment (vd `fontWeight: 700` → `fontWeight: 700`), không cần renderer — element template binding `:style="mergedStyle"` đã đủ.

### 10.4. Register

Thêm vào `registry.js` `VUE_COMPONENTS`:

```js
const VUE_COMPONENTS = {
  width_select: WidthSelectTrait,
  // ...
  font_size: FontSizeTrait,                    // ← new
}
```

### 10.5. Dùng

Trong meta của element:

```js
attributes: ['font_size']
// hoặc với override:
attributes: [{ key: 'font_size', label: 'Heading size' }]
```

### 10.6. CI tự cover

`npm run validate:schemas` sẽ check schema mới Ajv-compilable. `npm run build:schemas` sinh thêm vào output.

---

## 11. Adding a new element

```bash
mkdir src/components/editor_v2/nodes/my_widget
```

### 11.1. `meta.js` (runtime data + defaults)

```js
export const meta = {
  type: 'my-widget',
  label: 'My Widget',
  category: 'basic',
  showInSidebar: true,
  isContainer: false,
  rules: { isRootOnly: false },
  defaults: {
    style:    { padding: '12px', '--node-width': 'fit' },
    config:   {},
    specials: { htmlTag: 'div' },
    responsive: {
      mobile: { padding: '8px' },                       // flat shape — normalize sẽ route 'padding' → style
    },
  },
  traits: {
    general: [
      { key: 'layout', label: 'Layout', attributes: ['width_select', 'padding'] },
    ],
    advanced: [],
  },
}
```

### 11.2. `index.vue` (Vue + factory)

```vue
<template>
  <div ref="root" v-bind="nodeAttrs" :class="nodeClassMap" v-on="nodeListenersBase"
       :style="commonStyleData">
    {{ mergedSpecials.text || 'My widget' }}
  </div>
</template>

<script>
import { nodeLeaf, draggableNode } from '@/composable/editor_v2/mixins'
import { createNode } from '@/composable/editor_v2/createNode'
import { meta as baseMeta } from './meta.js'

export default {
  name: 'MyWidget',
  mixins: [nodeLeaf, draggableNode],
}

export const meta = {
  ...baseMeta,
  factory: (overrides = {}) =>
    createNode({
      type: 'my-widget',
      isCanvas: false,
      style: overrides.style || {},
      specials: overrides.specials || (overrides.text ? { text: overrides.text } : {}),
    }),
}
</script>
```

### 11.3. `ai.js` (optional, AI gen)

```js
export const ai = {
  description: 'My widget renders X for use case Y.',
  hints: { useWhen: ['...'], avoidWhen: ['...'] },
  examples: [{ description: 'Default', def: { type: 'my-widget', specials: { text: 'Hi' } } }],
  semantics: ['custom'],
}
```

### 11.4. Auto-discovery

`registerElements.js` glob `nodes/*/index.vue` → element tự xuất hiện. Không sửa file khác. Registry tự wrap factory, defaults sẽ fill khi factory chạy.

### 11.5. Verify

```bash
npm run validate:schemas    # check element schema valid (khi CI sẵn sàng)
npm run dev                 # test trong editor
```

---

## 12. Glossary

| Term | Đầy đủ | Ý nghĩa |
|---|---|---|
| `ns` | namespace | `'style' \| 'config' \| 'specials'` |
| `bp` | breakpoint | 1 viewport `{key, label, width, isMobile}` |
| `def` | definition data | entry trong `DEFINITIONS_DATA` (writes + schema) hoặc registry record |
| `definition` | trait widget definition | unit reusable trong trait panel (vd `width_select`) |
| `writes` | write map | `{ writeKey: { target, schema } }` per definition |
| `writeKey` | key thực ghi vào node | vd `padding`, `--node-width`, `htmlTag` |
| `attribute` | trait attribute | item trong `meta.traits.<tab>[].attributes` |
| `target` | write target namespace | `'style' \| 'config' \| 'specials'` |
| `meta` | element metadata | runtime data export từ `meta.js` |
| `defaults` | element defaults | `{ style, config, specials, responsive }` fill khi factory chạy |
| `ai` | element AI metadata | sidecar export từ `ai.js` |
| `factory` | node factory | function tạo Node mới (composed trong index.vue, wrap bởi registry) |
| `cascade` | desktop-first cascade | merge base + per-bp slots theo width ≥ current |
| `allowedKeys` | runtime guard set | `{ style: Set, config: Set, specials: Set }` per element type |
| `renderers` | precomputed renderer list | ordered array của `(node) → CSS` cho element |
| `commonStyleData` | computed CSS từ renderers | `Object.assign({}, ...renderers.map(r => r(node)))` |
| `buildElementSchema` | schema builder | pure function `meta → JSON Schema` |
| `schema_helpers` | JSON Schema builders | `oneOfEnum`, `cssSides`, `number`, `boolean`, etc. |
| `oneOfEnum` | enum-with-description | emit `oneOf: [{const, description}]` (LLM-honored shape) |
| `normalizeResponsiveSlot` | shape normalizer | accept `{style, config}` hoặc flat `{writeKey: value}` → canonical |
| `WRITE_KEY_TARGETS` | reverse index | `writeKey → target` lookup, build từ DEFINITIONS_DATA |

---

## 13. Common pitfalls

### "Element không xuất hiện trong sidebar / không render"
- Kiểm tra folder name + có `index.vue` + `meta.js`
- Kiểm tra `meta.type` unique, không trùng element khác
- `registerElements.js` glob là `*/index.vue` — file phải đúng tên đó (không phải `flex_block.vue`)

### "Defaults không apply khi factory tạo node"
- Kiểm tra `meta.defaults` ở **meta.js** (Vue-free), không phải ở `index.vue` post-spread — `normalizeDefaults` đọc từ `meta.defaults` truyền vào `registerElement`
- Nhớ writeKey thực, không phải definition slug (vd `defaults.style.padding`, KHÔNG phải `defaults.style.padding_widget`)
- `responsive` slot có thể flat — `normalizeResponsiveSlot` lookup `WRITE_KEY_TARGETS` để route → key lạ sẽ bị drop ngầm

### "Schema build skip attribute"
- Attribute đang dùng inline-spec (`{key, type, target}`) không có trong DEFINITIONS_DATA
- Tạo definition tương ứng trong `definitions.js`, đổi attribute sang ref key

### "Store warn 'unknown key — dropped'"
- Key bạn ghi không có trong `meta.traits` của element type đó → `extractAllowedKeys` không cover
- Hoặc thêm vào traits, hoặc check lại key có đúng namespace không

### "CSS không apply dù value đã set"
- Kiểm tra có renderer trong `styleRenderers.js` map cho trait đó không — nếu CSS phức hợp (vd `border` cần compose `borderColor + borderWidth + borderStyle`) thì PHẢI có renderer
- Element template có spread `commonStyleData` vào `:style` không
- Renderer dùng `getStyle/getConfig` cần `useUIStore` để biết active bp → đảm bảo store đã init

### "CI fail 'invalid JSON Schema'"
- Helper trả schema sai → check `schema_helpers.js`
- Common: pattern regex thiếu escape, `enum` không phải array

### "AI sinh out key không tồn tại"
- LLM bịa key — `buildElementSchema` output có `additionalProperties: false` để Ajv reject
- Validate AI output trước khi dispatch vào store: `ajv.compile(schema)(aiOutput)`

### "Responsive default override không apply"
- `meta.defaults.responsive[bp]` flat shape phải có writeKey nằm trong `WRITE_KEY_TARGETS` (tức definition đã ghi key đó vào style/config)
- Specials KHÔNG cascade → đặt default specials vào `defaults.specials`, không vào `defaults.responsive`

---

## 14. Migration notes

### Từ `props` đơn nhất sang 3 namespace

Trước:
```js
node.data.props = { padding: '20px', text: 'Hi', productId: 1 }
```

Sau:
```js
node.data.style    = { padding: '20px' }
node.data.specials = { text: 'Hi', productId: 1 }
```

`responsive` chuyển từ `responsive.{bp}.props` sang `responsive.{bp}.style` / `responsive.{bp}.config`.

### Từ inline-spec sang definition

Trước:
```js
attributes: [
  { key: 'fontSize', type: 'number', target: 'style', default: 24, props: { min: 8, max: 96 } },
]
```

Sau:
1. Thêm vào `definitions.js`:
   ```js
   font_size: { writes: { fontSize: { target: 'style', schema: number({ min: 8, max: 96, default: 24 }) } } }
   ```
2. Tạo widget `FontSizeTrait.vue` (đọc + emit `'fontSize'`)
3. Register vào `VUE_COMPONENTS` map
4. Đổi element meta: `attributes: ['font_size']`

### Từ `defaults` rải rác trong factory sang meta.defaults

Trước: factory tự fill spread defaults inline:
```js
factory: (o) => createNode({ type: 'flex-block', style: { padding: '0px', margin: '0px', ...o.style } })
```

Sau: factory trả minimal, defaults sống ở `meta.defaults`:
```js
// meta.js
defaults: { style: { padding: '0px', margin: '0px' } }

// index.vue
factory: (o) => createNode({ type: 'flex-block', style: o.style || {} })
```

Registry wrap factory — defaults fill missing keys sau khi factory return.

---

## 15. File hash (lookup helpers)

| Tìm gì | Đọc file |
|---|---|
| Data shape 3 namespace | `composable/editor_v2/createNode.js` (top comment) |
| Cascade logic (2-phase: down + up) | `composable/editor_v2/mergeNode.js` |
| Trait widget definitions | `components/editor_v2/components/trait/fields/definitions.js` |
| Style renderers (CSS composition) | `components/editor_v2/components/trait/fields/styleRenderers.js` |
| Vue widgets cho trait | `components/editor_v2/components/trait/components/fields/*.vue` |
| JSON Schema helpers | `components/editor_v2/components/trait/fields/schema_helpers.js` |
| Element auto-register | `composable/editor_v2/registerElements.js` |
| Element registry + factory wrap | `composable/editor_v2/registry.js` (`registerElement`, `getDef`, `factoryFor`, `getAllowedKeys`, `extractAllowedKeys`, `collectRenderers`) |
| Store write actions | `stores/editor_v2/node.js` (`changeStyle/Config/Specials`, `_writeNs`, `_writeByPolicy`, `_resetNs`) |
| Store-level guard | `stores/editor_v2/node.js#writeNamespaceWithRec` (allowedKeys check) |
| `commonStyleData` consumer | `composable/editor_v2/mixins/nodeBase.js` |
| Style/config getter helper | `composable/editor_v2/get.js` (`getStyle`, `getConfig`) |
| Responsive slot policy | `composable/editor_v2/responsivePolicy.js` (`defaultStyleSlot`, `defaultConfigSlot`) |
| Undo/Redo + history | [`10-history.md`](./10-history.md) |
