# 07 — Trait Panel, Data Model & Schema System

Deep dive vào: data model (5 base namespace + `states` override namespace + responsive), cascade desktop-first (`mergeNamespace`) + state cascade (`mergeStateNs` / `mergeStateNode` / `mergeStateMap`), trait registry chia domain (`defs/*`), 37 widget vue, events catalog, `buildElementSchema` + `applyStateSchema` (mirror per-bp + `states` overrides), `meta.defaults` với factory wrap, helpers JSON Schema, store-level guard, statefulKeys.

---

## 1. Folder layout

```
src/components/editor_v2/
├── nodes/                          # ELEMENT folder-per-type
│   ├── flex_block/
│   │   ├── index.vue               # Vue component + factory
│   │   ├── meta.js                 # type, label, traits, rules, defaults, satellite?, states?, events?
│   │   └── ai.js                   # AI-only: description, hints, examples
│   └── ...
└── components/trait/
    ├── ClassTrait.vue              # Custom class field
    ├── components/                 # Widget Vue (rendered trong panel)
    │   ├── TraitField.vue          # dispatcher render widget cho attribute
    │   ├── TraitWrapper.vue        # Group label shell
    │   ├── TraitItemWrapper.vue    # Field label shell
    │   ├── TraitAssetInput.vue     # Asset (image/video) picker trigger
    │   ├── MediaUploader.vue
    │   ├── SelectCustomOption.vue
    │   └── fields/                 # 37 widget per trait key
    │       ├── WidthSelectTrait.vue / HeightSelectTrait.vue
    │       ├── PaddingTrait.vue / PaddingMarginTrait.vue / ContentWidthTrait.vue
    │       ├── DirectionTrait.vue / VerticalTrait.vue / HorizontalTrait.vue
    │       ├── GapTrait.vue / DisplayTrait.vue
    │       ├── BackgroundColorTrait.vue / BackgroundImageTrait.vue / BackgroundVideoTrait.vue
    │       ├── BorderTrait.vue / CornerTrait.vue / ShadowTrait.vue / AnimationTrait.vue
    │       ├── FontSizeTrait.vue / LineHeightTrait.vue / FontFamilyTrait.vue
    │       ├── TextStyleTrait.vue / TextTransformTrait.vue / TextAlignTrait.vue
    │       ├── TextSpacingTrait.vue / TextColorTrait.vue / TextGlobalStyleTrait.vue
    │       ├── IconPickerTrait.vue / IconSizeTrait.vue / IconColorTrait.vue
    │       ├── IconGapTrait.vue / IconPositionTrait.vue
    │       ├── ImageTrait.vue / ImageComparisonTrait.vue
    │       ├── ListItemsTrait.vue / TabLayoutTrait.vue
    │       ├── HtmlTagTrait.vue / ActionTrait.vue
    │       ├── iconCatalog.js / iconManifest.json     # Lucide icons cho IconPicker
    │       └── events/             # Vue editor cho event action payload
    │           ├── UrlEvent.vue / PageEvent.vue / PopupEvent.vue
    │           └── index.js
    └── fields/                     # PURE DATA (Vue-free) — `node` scripts import được
        ├── definitions.js          # Re-export DEFINITIONS_DATA + builders (buildElementSchema, ...)
        ├── enum.js                 # TRAIT / TARGET / TRIGGER / ACTION / PAGE_TYPE enums
        ├── schema_helpers.js       # JSON Schema builders
        ├── styleRenderers.js       # (node) → CSS object map
        ├── registry.js             # VUE_COMPONENTS: defKey → Vue widget
        ├── eventDefinitions.js     # EVENT_DEFINITIONS_DATA + validateEvents + EVENTS_AI
        ├── defs/                   # DEFINITIONS_DATA chia DOMAIN
        │   ├── index.js            # Barrel merge
        │   ├── size.js             # width_select / height_select
        │   ├── layout.js           # padding / margin / content_width / direction / vertical / horizontal / gap / padding_margin
        │   ├── background.js       # bg_color / bg_image / bg_video
        │   ├── shape.js            # border / corner / shadow
        │   ├── typography.js       # font_size / font_family / text_color / text_style / text_align / line_height / text_spacing / text_transform / text_global_style / html_tag
        │   ├── icon.js             # icon_picker / icon_size / icon_color / icon_gap / icon_position
        │   ├── media.js            # image / asset
        │   ├── behavior.js         # animation / display / content_width / action
        │   └── image_comparison.js
        └── events/
            ├── engine.js           # createEventApi(actions, triggerLabels)
            └── actions/
                ├── goToUrl.js      # Navigate to external URL
                ├── openPage.js     # Navigate to internal page (PAGE_TYPES enum)
                └── openPopup.js    # Open popup overlay
```

---

## 2. Data model — 5 base namespace + `states` + responsive

```js
node = {
  id: 'flex-section-abc12345',          // genId(type)
  data: {
    type: 'flex-section',
    name: 'Section',
    parent: 'ROOT',
    nodes: ['fb_xxx', 'fb_yyy'],
    isCanvas: true,
    hidden: false,
    custom: {},

    style:    { padding: '32px 0px', '--node-width': 'fill' },   // CSS responsive (cascade)
    config:   { contentWidth: 'fill_container' },                 // data per-bp opt-in
    specials: { htmlTag: 'h2', text: 'Hello' },                   // base-only metadata + content
    events:   [{ id, name, action, target, payload? }],           // base-only behaviors
    bindings: [{ id, source, field, target, transform? }],        // base-only data refs

    // State overrides (hover/active…) — namespace RIÊNG, tách style/config.
    // KHÔNG nằm trong config. Mỗi state là 1 cluster { style, config }.
    states: {
      hover: { style: { backgroundColor: '#0d6efd' }, config: {} },
    },

    responsive: {
      mobile: {
        style:  { '--layout-direction': 'vertical', padding: '15px' },
        config: {},
        // state override cũng per-bp — qua responsive[bp].states[state]
        states: { hover: { style: { backgroundColor: '#0a58ca' }, config: {} } },
      },
    },
  },
  dom: null,
  events: {},   // runtime DOM-listener bag (Positioner/DnD), KHÁC data.events
}
```

> **states là namespace thứ 6 (override).** Trước đây state map sống trong `config[state]`
> (vd `config.hover`). Sau refactor, override mỗi state nằm trong `data.states[state] = { style, config }`
> (base) và `data.responsive[bp].states[state]` (per-bp). `config` giờ KHÔNG còn chứa state map.

### Phân loại field theo namespace

| Câu hỏi | → Namespace |
|---|---|
| Field có meaningful khác giữa desktop và mobile? YES + CSS | `style` |
| YES + DATA (vd image src crop khác bp, slidesPerView) | `config` |
| NO + metadata HTML/content | `specials` |
| NO + behavior (click handler) | `events` |
| NO + data-binding | `bindings` |
| Override cho variant (hover/active) | `states[state].{style,config}` |

| Field | Namespace | Lý do |
|---|---|---|
| `padding`, `margin`, `gap`, `background`, `boxShadow`, `borderRadius`, `--node-width`, `--layout-direction` | `style` | CSS hay đổi theo bp |
| `contentWidth`, `backgroundType`, `isPaddingLinked`, `backgroundVideoUrl`, `animation`, `hidden`, `textGlobalStyle` | `config` | Data/render-mode/per-bp behavior |
| `htmlTag`, `text` (Heading), `htmlId`, `className`, `ariaLabel`, `productId`, `label` (Button) | `specials` | Content / DOM metadata không đổi theo bp |
| `hover` / `active` overrides | `states[state]` = `{ style, config }` | Variant overrides (qua `_routeState` → `states[state][ns]`) |

### CSS custom properties

Trait `width_select`, `height_select`, `direction`, `vertical`, `horizontal`, `content_width`, `text_align`, `text_font_size`, `text_color`, … ghi vào **CSS variable** (`--node-width`, `--layout-direction`, `--text-align`, …). Element CSS scoped đọc qua `var(--node-width)`. Lý do:

1. **Tách config khỏi computed CSS** — `--node-width: fill` là enum value, không phải `width: 100%` final.
2. **Inspector dễ đọc** — devtools hiển thị `--node-width: fill` thay vì `width: 100%; flex-grow: 1; …`.
3. **Reset / inherit** — bỏ key trong style slot → CSS var fallback về default declared trong SFC scoped.

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

Loop walk `BREAKPOINTS` (desktop → mobile, descending width):
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
    if (slot && slot[ns]) {
      const isCurrent = bp.key === currentBpKey
      for (const k in slot[ns]) {
        if (!isCurrent && isNonCascading(ns, k)) continue
        merged[k] = slot[ns][k]
      }
    }
    if (bp.key === currentBpKey) break
  }
  // Phase 2: fallback lên — chỉ điền key chưa có
  for (const bp of BREAKPOINTS) {
    if (bp.width >= curBpDef.width) continue
    const slot = responsive[bp.key]
    if (!slot || !slot[ns]) continue
    for (const k in slot[ns]) {
      if (k in merged) continue
      if (isNonCascading(ns, k)) continue
      merged[k] = slot[ns][k]
    }
  }
  return merged
}
```

`specials/events/bindings` cố ý KHÔNG cascade — luôn base only.

### NON_CASCADING keys

Một số key KHÔNG được kế thừa qua breakpoint — chỉ lấy từ slot bp hiện tại (hoặc base).

```js
const NON_CASCADING = {
  config: new Set(['hidden']),
}
```

Vd ẩn node ở desktop KHÔNG nên ẩn lây sang mobile — user phải explicit set per-bp.

### State cascade — `states` namespace có 3 reader

State override (`states.hover`, `states.active`) cũng cần cascade per-bp. Override sống trong
`data.states[state] = { style, config }` (base) + `data.responsive[bp].states[state]` (per-bp),
nên cascade đi sâu thêm 1 level so với `mergeNamespace`. `mergeNode.js` export 3 helper:

```js
// 1) Cascade 1 namespace của 1 state qua các bp (giống mergeNamespace, 1 level sâu hơn).
mergeStateNs(node, 'hover', 'style', 'mobile')
// → { backgroundColor: '#0a58ca', ... }  // states base ⊕ desktop ⊕ ... ⊕ mobile (chỉ slot.states)

// 2) Flat union style+config của 1 state tại bp — style/config writeKey global-unique nên union an toàn.
mergeStateMap(node, 'hover', 'mobile')
// → { ...mergeStateNs(style), ...mergeStateNs(config) }

// 3) Fold state vào CHÍNH style/config của node (base + mọi responsive slot) → synthetic node
//    render/cascade y như state là look mặc định. PURE (không cần bp arg).
mergeStateNode(node, 'hover')
// → { ...node, data: { ...data, style: base⊕states.hover.style, responsive: per-bp folded, states: {} } }
```

- `mergeStateMap` — dùng bởi `statefulNode.stateCss` để biết state đổi key nào → emit CSS tối thiểu.
- `mergeStateNode` — dùng bởi `TraitField.renderNode`: khi panel ở state ≠ base, fold override vào
  node để widget đọc value qua `getStyle/getConfig` bình thường (xem §7).

`specials/events/bindings` vẫn KHÔNG cascade — base only.

---

## 4. Trait registry — pure data chia domain

### 4.1. `schema_helpers.js` — JSON Schema builders

```js
// Primitives
string({ default, pattern, minLength, maxLength, format })
number({ min, max, default, integer })
integer({ min, max, default })
boolean({ default })

// Enums
enumOf('row', 'column')                                  // { enum: ['row', 'column'] }
oneOfEnum({                                              // { oneOf: [{const, description}, ...] }
  fill_container: 'Stretch to parent',
  fit_content:    'Shrink to content',
})

// Composite
object({ key: schema }, { required, additionalProperties })
array(itemSchema, { minItems, maxItems })
anyOf(s1, s2) / oneOf(s1, s2)
nullable(schema)

// Modifiers
withDescription(schema, desc)
withDefault(schema, value)

// CSS-specific
cssLength()    // pattern: 10px / 1.5rem / 50%
cssSides()     // pattern: 1-4 CSS lengths
cssColor()     // loose string
htmlId() / cssClass() / url()

// Responsive
responsive(schema, breakpoints)   // accept primitive OR { base, sm, md, ... }
```

### 4.2. `defs/*.js` — `DEFINITIONS_DATA` chia domain

Mỗi file domain export 1 default object. `defs/index.js` merge tất cả thành `DEFINITIONS_DATA`. Mỗi entry mô tả 1 widget bằng `{ writes }` map:

```js
// defs/layout.js
import { oneOfEnum, cssSides, boolean, withDescription, number } from '../schema_helpers.js'
import { TARGET, TRAIT } from '../enum.js'

export default {
  [TRAIT.PADDING]: {
    writes: {
      padding: {
        target: TARGET.STYLE,
        schema: withDescription(cssSides({ default: '0px' }), 'CSS padding shorthand, 1–4 lengths in px'),
      },
      isPaddingLinked: {
        target: TARGET.CONFIG,
        schema: withDescription(boolean({ default: false }), 'Lock all 4 sides to the same value in the UI'),
      },
    },
  },
  [TRAIT.MARGIN]: { writes: { margin: { target: TARGET.STYLE, schema: ... } } },
  [TRAIT.CONTENT_WIDTH]: {
    writes: {
      contentWidth: { target: TARGET.CONFIG, schema: ... },
      contentWidthCustom: { target: TARGET.CONFIG, schema: number(...) },
    },
  },
  [TRAIT.DIRECTION]: { writes: { '--layout-direction': { target: TARGET.STYLE, schema: oneOfEnum({...}) } } },
  // ...
}
```

**`enum.js` — single source of truth**:

```js
export const TARGET = { STYLE: 'style', CONFIG: 'config', SPECIALS: 'specials' }
export const TRAIT  = {
  WIDTH_SELECT: 'width_select', HEIGHT_SELECT: 'height_select',
  PADDING: 'padding', MARGIN: 'margin', PADDING_MARGIN: 'padding_margin', CONTENT_WIDTH: 'content_width',
  DIRECTION: 'direction', VERTICAL: 'vertical', HORIZONTAL: 'horizontal', GAP: 'gap',
  BG_COLOR: 'bg_color', BG_IMAGE: 'bg_image', BG_VIDEO: 'bg_video',
  BORDER: 'border', CORNER: 'corner', SHADOW: 'shadow', ANIMATION: 'animation', DISPLAY: 'display',
  HTML_TAG: 'html_tag', ACTION: 'action',
  FONT_SIZE: 'font_size', FONT_FAMILY: 'font_family', TEXT_COLOR: 'text_color',
  TEXT_STYLE: 'text_style', TEXT_ALIGN: 'text_align', TEXT_GLOBAL_STYLE: 'text_global_style',
  LINE_HEIGHT: 'line_height', TEXT_SPACING: 'text_spacing', TEXT_TRANSFORM: 'text_transform',
  ICON_PICKER: 'icon_picker', ICON_SIZE: 'icon_size', ICON_COLOR: 'icon_color',
  ICON_GAP: 'icon_gap', ICON_POSITION: 'icon_position',
  IMAGE: 'image', IMAGE_COMPARISON: 'image_comparison',
  LIST_ITEMS: 'list_items', TAB_LAYOUT: 'tab_layout',
}
export const TRIGGER = { CLICK: 'click', HOVER: 'hover', DBLCLICK: 'dblclick' }
export const ACTION  = { GO_TO_URL: 'goToUrl', OPEN_PAGE: 'openPage', OPEN_POPUP: 'openPopup' }
```

### 4.3. `definitions.js` — builders + normalizers

```js
export { DEFINITIONS_DATA } from './defs/index.js'

export const getDefinitionData = (keyOrAttribute) => {
  // accept 'width_select' (string) hoặc { key: 'width_select', label: '...' }
  const k = typeof keyOrAttribute === 'string' ? keyOrAttribute : keyOrAttribute?.key
  return k ? DEFINITIONS_DATA[k] || null : null
}

const WRITE_KEY_TARGETS = (() => {
  // build từ DEFINITIONS_DATA: { writeKey: target } reverse index
  const map = {}
  for (const defKey in DEFINITIONS_DATA) {
    for (const wk in DEFINITIONS_DATA[defKey].writes || {}) {
      map[wk] = DEFINITIONS_DATA[defKey].writes[wk].target
    }
  }
  return map
})()

export const normalizeResponsiveSlot = (slot) => {
  // accept canonical { style, config } HOẶC flat { writeKey: value } → route theo WRITE_KEY_TARGETS
}

export const buildElementSchema = (meta) => { /* xem section 8 */ }
export const buildSatelliteSchema = (satMeta) => { /* slim schema cho satellite (loại bỏ events/state) */ }
export const collectStatefulWriteKeys = (meta) => { /* Set writeKey eligible per-state */ }
export const applyStateSchema = (schema, meta) => { /* augment per-state overrides */ }
export const buildStateOverrideSchema = (meta) => { /* override schema cho variant */ }
```

### 4.4. `styleRenderers.js` — `(node) → CSS object`, co-located

Mỗi trait có CSS phức hợp tự viết renderer. Pure function, đọc qua `getStyle(node, key, fallback)` / `getConfig(node, key, fallback)` — 2 helper tự đọc namespace tại active breakpoint từ UI store.

```js
export const STYLE_RENDERERS = {
  flexCanvas(node) {
    // base: display flex + direction + align (luôn precompose seed cho element)
  },
  canvasNodeWrapper(node) {
    // width/height từ --node-width / --node-height
  },

  [TRAIT.SHADOW](node) {
    const v = getStyle(node, 'boxShadow')
    return v ? { boxShadow: v } : {}
  },

  [TRAIT.BORDER](node) {
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

  [TRAIT.BG_IMAGE](node) {
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

  // ... corner, gap, bg_color, padding_margin, animation
}
```

**Renderer key trùng với definition key.** Khi `registerElement` chạy:
- Walk `meta.traits` → tìm renderer cho mỗi attribute → push vào array
- Seed `[flexCanvas, canvasNodeWrapper]` đầu array (mọi node dùng chung)
- Lưu trong `def.renderers` (precomputed)
- `nodeBase.commonStyleData` lặp `def.renderers` → merge output

Lợi:
- Tách CSS composition khỏi widget (widget chỉ emit raw value)
- Không re-walk traits mỗi render
- 1 trait key = 1 nguồn cho schema + widget + CSS

Element-specific style (layout vars, gap, padding mặc định) **spread sau** `commonStyleData`:

```vue
<template>
  <div :style="{ ...commonStyleData, ...layoutVars }">
```

### 4.5. `registry.js` (trait fields) — VUE_COMPONENTS

Attach Vue widget vào definition key:

```js
import WidthSelectTrait from '../components/fields/WidthSelectTrait.vue'
// ...37 imports

export const VUE_COMPONENTS = {
  [TRAIT.WIDTH_SELECT]: WidthSelectTrait,
  [TRAIT.HEIGHT_SELECT]: HeightSelectTrait,
  [TRAIT.PADDING]: PaddingTrait,
  [TRAIT.PADDING_MARGIN]: PaddingMarginTrait,
  [TRAIT.CONTENT_WIDTH]: ContentWidthTrait,
  [TRAIT.DIRECTION]: DirectionTrait,
  [TRAIT.GAP]: GapTrait,
  [TRAIT.VERTICAL]: VerticalTrait,
  [TRAIT.HORIZONTAL]: HorizontalTrait,
  [TRAIT.DISPLAY]: DisplayTrait,
  [TRAIT.BG_COLOR]: BackgroundColorTrait,
  [TRAIT.BG_IMAGE]: BackgroundImageTrait,
  [TRAIT.BG_VIDEO]: BackgroundVideoTrait,
  [TRAIT.BORDER]: BorderTrait,
  [TRAIT.CORNER]: CornerTrait,
  [TRAIT.SHADOW]: ShadowTrait,
  [TRAIT.ANIMATION]: AnimationTrait,
  [TRAIT.HTML_TAG]: HtmlTagTrait,
  [TRAIT.ACTION]: ActionTrait,
  // ... typography, icon, image, list_items, tab_layout, image_comparison
}

export const COMPONENT_DEFINITIONS = (() => {
  // gắn .component vào mỗi entry DEFINITIONS_DATA
  const out = {}
  for (const k in DEFINITIONS_DATA) out[k] = { ...DEFINITIONS_DATA[k], component: VUE_COMPONENTS[k] || null }
  return out
})()

export const getComponentDefinition = (key) => COMPONENT_DEFINITIONS[key] || null
```

---

## 5. Element meta — runtime data với defaults

### 5.1. `meta.js` — shape

```js
// nodes/flex_block/meta.js
import { TRAIT } from '../../components/trait/fields/enum.js'

export const meta = {
  type: 'flex-block',
  label: 'Block',
  category: 'layout',
  showInSidebar: false,
  isContainer: true,
  rules: {
    isRootOnly: false,
    locked: false,
    hideInLayer: false,
    isContentEditable: false,
    edgeOverlay: { padding: true, marginSides: { left: false, right: false } },
  },

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
    config: { contentWidth: 'fill_container' },
    responsive: {
      desktop: { '--layout-direction': 'horizontal' },
      tablet:  { '--layout-direction': 'horizontal' },
      mobile:  { '--layout-direction': 'vertical'   },
      // flat shape OK — normalizeResponsiveSlot tự route
    },
  },

  // Optional — stateful variants (Button uses this). CHỈ khai base + variants;
  // group nào cho phép override per-state thì gắn `stateful: true` lên group đó
  // trong `traits` (KHÔNG còn `states.groups`).
  states: {
    base: 'default',
    variants: [
      { value: 'default', label: 'Default' },
      { value: 'hover',   label: 'Hover',  selector: ':hover'  },
      { value: 'active',  label: 'Active', selector: ':active' },
    ],
  },

  // Optional — satellite (Tab uses this)
  satellite: { type: 'tab-item', configKey: 'tabItemId' },

  // Optional — event slots (Button uses this)
  events: {
    on: ['click'],
    actions: ['goToUrl', 'openPage', 'openPopup'],
  },

  traits: {
    general: [
      { key: 'size',       label: 'Size',       attributes: [TRAIT.WIDTH_SELECT, TRAIT.HEIGHT_SELECT] },
      { key: 'layout',     label: 'Layout',
        attributes: [TRAIT.DIRECTION, TRAIT.GAP, TRAIT.PADDING, TRAIT.VERTICAL, TRAIT.HORIZONTAL,
                     { key: TRAIT.MARGIN, visible: false }] },
      // `state: true` → group này render WkSegmented variant-picker (Default/Hover/…),
      // không phải field thường. Chỉ thêm khi element có meta.states.
      { key: 'state', state: true },
      // `stateful: true` → group cho phép override per-state (writeKey của nó vào statefulKeys).
      // `keepInState: true` → group vẫn hiện khi đang ở state ≠ base (vd Size/Layout).
      { key: 'background', label: 'Background', stateful: true,
        attributes: [TRAIT.BG_COLOR, TRAIT.BG_IMAGE, TRAIT.BG_VIDEO] },
      { key: 'shape',      label: 'Shape',      stateful: true,
        attributes: [TRAIT.BORDER, TRAIT.CORNER, TRAIT.SHADOW] },
    ],
    advanced: [
      { key: 'spacing',   label: 'Spacing',   stateful: true, attributes: [TRAIT.PADDING_MARGIN] },
      { key: 'display',   label: 'Display',   stateful: true, attributes: [TRAIT.DISPLAY] },
      { key: 'animation', label: 'Animation', stateful: true, attributes: [TRAIT.ANIMATION] },
    ],
  },
}
```

**`stateful: true` là cờ trên GROUP** (không phải `states.groups`). `buildStateOverrideSchema` walk
group có `stateful` → gom writeKey → `collectStatefulWriteKeys` → `def.statefulKeys`. Attribute
muốn opt-out riêng dùng `{ key, stateful: false }`.

**Không có** `factory` (sống trong `index.vue`).
**Không có** Vue import. Relative imports cho `node` thuần.

### 5.2. Defaults — keys = writeKey thực, không phải definition slug

`defaults.style.padding` — writeKey trong target `style` (vì `padding` definition ghi `padding` key). KHÔNG ghi `defaults.style.padding_widget`. CSS var giữ nguyên: `defaults.style['--node-width'] = 'fill'`.

### 5.3. Factory wrap trong `registerElement`

Source: `composable/editor_v2/registry.js` (xem [`01-architecture.md`](./01-architecture.md) §4).

```js
const factory = origFactory
  ? (overrides) => {
      const node = origFactory(overrides)
      if (!node || !node.data) return node
      node.data.style    = { ...defaults.style,    ...(node.data.style    || {}) }
      node.data.config   = { ...defaults.config,   ...(node.data.config   || {}) }
      node.data.specials = { ...defaults.specials, ...(node.data.specials || {}) }
      if (!node.data.name) node.data.name = meta.label || meta.type
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
      // Seed default state overrides (hover/active…) — fill-missing per state/ns.
      if (Object.keys(defaults.states).length) {
        node.data.states = node.data.states || {}
        for (const st in defaults.states) {
          const defSt = defaults.states[st] || {}
          const existing = node.data.states[st] || {}
          node.data.states[st] = {
            style:  { ...(defSt.style  || {}), ...(existing.style  || {}) },
            config: { ...(defSt.config || {}), ...(existing.config || {}) },
          }
        }
      }
      return node
    }
  : null
```

Defaults fill-missing semantics — factory / overrides win over defaults. `normalizeDefaults` chuẩn
hóa `meta.defaults` thành `{ style, config, specials, states, responsive }` (slot thiếu → `{}`), nên
element khai default state qua `meta.defaults.states.hover = { style, config }`.

### 5.4. `index.vue` — Vue + factory composition

```vue
<script>
import { Plus } from '@lucide/vue'
import { nodeContainer, draggableNode } from '@/composable/editor_v2/mixins'
import { createNode } from '@/composable/editor_v2/createNode'
import { meta as baseMeta } from './meta.js'
import NodeRenderer from '../../elements/NodeRenderer.vue'

export default {
  name: 'FlexBlock',
  components: { NodeRenderer, Plus },
  mixins: [nodeContainer, draggableNode],
  computed: { /* ... */ },
}

export const meta = {
  ...baseMeta,
  icon: Plus,
  factory: (overrides = {}) =>
    createNode({
      type: 'flex-block',
      isCanvas: true,
      style: overrides.style || {},
      config: overrides.config || {},
    }),
}
</script>
```

### 5.5. `ai.js` — sidecar

```js
export const ai = {
  description: '...',
  hints: { useWhen, avoidWhen, contentTips },
  expectedChildren: { typical, patterns },
  layoutHints: { whenChildren: { 1: {...}, '2-3': {...}, '4+': {...} } },
  examples: [
    { description: 'CTA stack', def: { type: 'flex-block', style: {...}, children: [...] } },
  ],
  semantics: ['layout', 'container'],
}
```

Lazy-load chỉ bởi AI gen pipeline.

### 5.6. Auto-registration

`registerElements.js` glob `nodes/*/index.vue` 1 lần lúc PageWrapper mount. Thêm element mới: tạo folder + 2-3 file, **không sửa registry**.

---

## 6. Attribute shapes — 3 dạng

### 6.1. Definition ref (string)

```js
attributes: [TRAIT.WIDTH_SELECT, TRAIT.HEIGHT_SELECT]
```

### 6.2. Definition ref với override

```js
attributes: [
  { key: TRAIT.WIDTH_SELECT, disabled: true },
  { key: TRAIT.PADDING, label: 'Inner spacing' },
  { key: TRAIT.MARGIN, visible: false },           // ẩn UI nhưng vẫn allowedKeys cover
]
```

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

Không qua DEFINITIONS_DATA. `extractAllowedKeys` vẫn add vào set theo `attr.target` để store guard không drop. `buildElementSchema` skip inline-spec (không có definition).

Migrate bằng cách thêm definition tương ứng vào `defs/<group>.js`.

---

## 7. TraitField runtime

`components/trait/components/TraitField.vue` — dispatcher:

```vue
<template>
  <template v-if="visible">
    <component
      :is="componentDefinition.component"
      v-if="componentDefinition && componentDefinition.component"
      :attribute="attribute"
      :node="renderNode"
      :node-id="node.id"
      :disabled="resolvedDisabled"
      @change="onChange"
    />
    <span v-else>[unsupported field]</span>
  </template>
</template>

<script>
props: {
  attribute: { type: [Object, String], required: true },
  node: { type: Object, required: true },
  // Stateful editing ctx { current, base }; null = node thường.
  stateCtx: { type: Object, default: null },
},
computed: {
  // Base state → node thật; state ≠ base → fold override vào style/config qua
  // mergeStateNode để widget đọc value (getStyle/getConfig) cascade bình thường.
  renderNode() {
    if (!this.stateCtx || this.stateCtx.current === this.stateCtx.base) return this.node
    return mergeStateNode(this.node, this.stateCtx.current)
  },
},
methods: {
  onChange(key, value, patch, opts) {
    const writes = this.componentDefinition.writes
    if (!Object.keys(writes).includes(key)) {
      console.error('[editor_v2] invalid key:', key)
      return
    }
    const target = writes[key].target
    // specials LUÔN base-only → không bao giờ stateful.
    const o = (this.stateCtx && target !== 'specials') ? { ...opts, stateful: true } : opts
    if (target === 'style')         this.store.changeStyle(this.node.id, { [key]: value }, o)
    else if (target === 'config')   this.store.changeConfig(this.node.id, { [key]: value }, o)
    else if (target === 'specials') this.store.changeSpecials(this.node.id, { [key]: value }, o)
  },
},
</script>
```

Widget tự lo:
- Đọc value qua `mergeNamespace(node, target, breakpointActive)` hoặc helper `getStyle/getConfig`.
  Khi panel ở state ≠ base, `node` widget nhận là `renderNode` (đã fold override) nên đọc đúng value.
- Render UI (input/select/dialog/picker)
- Emit `change(key, value, patch?, opts?)` khi user edit
- Có thể emit nhiều key khác nhau

TraitField làm 3 việc: fold state vào `renderNode` → resolve definition → dispatch theo target.
Khi `stateCtx` (đang ở state ≠ base) và target ≠ specials, pass `stateful: true` để store `_routeState`
divert key vào `states[state][ns]`.

### Multi-write widget

Vd `PaddingTrait`:
```js
$emit('change', 'padding', '20px 24px')           // → changeStyle({padding: '20px 24px'})
$emit('change', 'isPaddingLinked', true)          // → changeConfig({isPaddingLinked: true})
```

---

## 8. `buildElementSchema` + `applyStateSchema` — JSON Schema với responsive + `states`

### 8.1. Output shape

`buildElementSchema(meta)` walk `meta.traits.general` + `meta.traits.advanced`, resolve attribute via
`getDefinitionData`, gom keys theo target → JSON Schema base + `responsive` (mirror full base style/config
cho mọi breakpoint). `buildElementSchema` **không** tự thêm state — state-override do `applyStateSchema(schema, meta)`
bồi vào: thêm 1 property top-level `states` (base) + `responsive[bp].states` (per-bp), mỗi non-base
variant map sang cluster `{ style, config }` (từ `buildStateOverrideSchema`). AI dump gọi `applyStateSchema(buildElementSchema(meta), meta)`.

```js
{
  type: 'object',
  properties: {
    style:    { type: 'object', properties: { '--node-width': {...}, padding: {...} }, additionalProperties: false },
    config:   { type: 'object', properties: { contentWidth: {...}, isPaddingLinked: {...} },
                additionalProperties: false },
    specials: { type: 'object', properties: { htmlTag: {...}, text: {...} },
                additionalProperties: false },
    // states — namespace RIÊNG (do applyStateSchema thêm). KHÔNG nằm trong config.
    states: {
      type: 'object', additionalProperties: false,
      properties: {
        hover:  { type: 'object', additionalProperties: false,
                  properties: { style: { properties: <stateful style keys> },
                                config: { properties: <stateful config keys> } } },
        active: { ... },
      },
    },
    responsive: {
      type: 'object',
      properties: {
        desktop: { type: 'object', properties: { style: {...}, config: {...},
                                                  states: { ...mirror per-bp... } }, additionalProperties: false },
        laptop:  { ... },
        tablet:  { ... },
        mobile:  { ... },
      },
      additionalProperties: false,
    },
    events:   { type: 'array', items: { properties: { name, action, target, payload } } },
    bindings: { type: 'array', items: { ... } },
  },
  additionalProperties: false,
}
```

### 8.2. Default propagation

- Schema base: `properties.style.properties[k].default = meta.defaults.style[k]`
- Schema responsive: per-bp slot từ `meta.defaults.responsive[bp]` (sau normalize)
- Helper-level default (vd `boolean({ default: false })`) bị STRIP trước khi gán element default — element default thắng tuyệt đối.

### 8.3. `collectStatefulWriteKeys(meta)` — Set per-element

```js
export const collectStatefulWriteKeys = (meta) => {
  const p = buildStateOverrideSchema(meta).properties
  // gom writeKey từ group có `stateful: true` (trừ attr opt-out `stateful: false`)
  return new Set([...Object.keys(p.style.properties || {}), ...Object.keys(p.config.properties || {})])
}
```

Lưu vào `def.statefulKeys` lúc `registerElement`. Consumer: `_routeState` — khi `opts.stateful` +
có active state ≠ base, divert key nằm trong `statefulKeys` vào `states[state][ns]` (per-bp theo policy);
key còn lại (non-stateful) ghi flat như thường.

### 8.4. `buildSatelliteSchema(satMeta)`

Schema cho satellite giữ `style` + `config` + `states` cluster (qua `applyStateSchema`), bỏ
`responsive`/`events` top-level (satellite styling thường cố định base). Owner schema có field
`satellite: <satellite schema>` để LLM style satellite mà không cần emit nó như node riêng.

### 8.5. Use cases

| Consumer | Format dùng |
|---|---|
| **AI page generation** | `dumpRegistryForLLM` → LLM tool input — feed vào `tools` param |
| **Runtime patch validate** | Ajv compile schema → check user paste / undo / dev console |
| **Doc generator** | "Element X có thể set gì" bảng tự động |
| **External validator** | Backend Elixir verify page def hợp lệ trước khi save |
| **CI** | `npm run validate:schemas` mỗi PR (planned) |

---

## 9. Store-level guard — `allowedKeys`

`stores/editor_v2/node.js#writeNamespaceWithRec` là chokepoint duy nhất cho `changeStyle/Config/Specials` + reset + `_writeByPolicy`. Check whitelist:

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

`getAllowedKeys(type, ns)` precomputed lúc `registerElement`. Build từ `extractAllowedKeys(meta.traits)`:
- **Definition ref** → expand `def.writes`, add từng writeKey vào set theo target
- **Legacy inline-spec** → add `attr.key` vào set theo `attr.target`

Empty Set = "no rules declared" → skip check.

> **State write KHÔNG đi qua guard này.** `changeStyle/Config` với `opts.stateful` route key vào
> `states[state][ns]` qua một hàm RIÊNG — `writeStateWithRec` — không chạy `allowedKeys`. Whitelist
> per-state đã được lọc sớm hơn ở `_routeState` bằng `def.statefulKeys` (chỉ key thuộc group
> `stateful: true` mới được divert; còn lại rơi về flat write và mới qua `writeNamespaceWithRec`).

### Guard layers

| Layer | Khi nào fire | Hành vi key lạ |
|---|---|---|
| `TraitField.onChange` | UI thao tác trên trait panel | `console.error` + return |
| `writeNamespaceWithRec` | Chokepoint mọi change* + reset* + writeByPolicy | `console.warn` + drop key |
| AI gen `validateDef` | Trước commit AI output | Throw error → BE re-prompt |
| `validate:schemas` CI | Mỗi PR (planned) | Fail build |

---

## 10. Events catalog

`components/trait/fields/eventDefinitions.js` — BARREL:

```js
import { createEventApi } from './events/engine.js'
import goToUrl from './events/actions/goToUrl.js'
import openPage, { PAGE_TYPES } from './events/actions/openPage.js'
import openPopup from './events/actions/openPopup.js'

const TRIGGER_LABELS = { [TRIGGER.CLICK]: 'Click' }
const ACTIONS = [goToUrl, openPage, openPopup]   // append-only
const api = createEventApi(ACTIONS, TRIGGER_LABELS)

export const {
  EVENT_DEFINITIONS_DATA,
  EVENT_TRIGGERS,
  triggersFor,
  actionOptionsFor,
  defaultEventFor,
  buildEventsSchema,
  validateEvents,
} = api

export const EVENTS_AI = api.buildEventsAi()
```

### Action shape (vd `goToUrl.js`)

```js
import { TRIGGER, ACTION } from '../../enum.js'
import UrlEvent from '../../../components/fields/events/UrlEvent.vue'

export default {
  name: ACTION.GO_TO_URL,
  label: 'Go to URL',
  triggers: [TRIGGER.CLICK],
  payload: {
    schema: { url: string({ format: 'uri' }), target: enumOf('_blank', '_self', '_parent', '_top') },
    defaults: { url: '', target: '_self' },
  },
  component: UrlEvent,                                 // Vue editor cho payload
  runtime: (node, event, e) => { window.open(event.payload.url, event.payload.target) },
  ai: { description: 'Navigate to an external URL' },
}
```

### Engine pipeline

```
User edit → ActionTrait widget → emit event row
  → nodeStore.addEvent(id, partial) hoặc updateEvent(id, eventId, patch)
  → _validateEventsWrite → validateEvents qua getDef(type).events constraint
  → _commit → record history
  → Runtime (preview / publish): events/engine.js dispatcher
       on element 'click' → walk node.data.events → run action.runtime(node, event, e)
```

### LLM-friendly

`EVENTS_AI` là phẳng `{ actionName: { label, schema, defaults, ai.description } }` — feed vào prompt để LLM biết action available + payload shape.

Thêm action:
1. Tạo `events/actions/<name>.js` (action def + runtime)
2. Tạo `components/fields/events/<Name>Event.vue` (Vue editor payload)
3. Append vào `ACTIONS` array trong `eventDefinitions.js`
4. (Optional) Thêm vào element `meta.events.actions` whitelist

---

## 11. Adding a new trait field type

### 11.1. Định nghĩa

Thêm vào `defs/<group>.js` (hoặc tạo file mới + import vào `defs/index.js`):

```js
// defs/typography.js
[TRAIT.FONT_SIZE]: {
  writes: {
    fontSize: {
      target: TARGET.STYLE,
      schema: withDescription(number({ min: 8, max: 200, default: 16 }), 'Font size in px'),
    },
  },
},
```

### 11.2. Build widget

`components/trait/components/fields/FontSizeTrait.vue`:

```vue
<template>
  <TraitItemWrapper :label="attribute.label || 'Font size'">
    <WkInput type="number" :value="fontSize" :disabled="disabled" :min="8" :max="200"
             @change="$emit('change', 'fontSize', Number($event))" />
  </TraitItemWrapper>
</template>

<script>
// đọc value qua getStyle(node, 'fontSize', 16) + emit 'change' với writeKey/value
</script>
```

### 11.3. (Optional) Style renderer

Nếu CSS phức hợp:

```js
[TRAIT.FONT_SIZE](node) {
  const v = getStyle(node, 'fontSize')
  return v ? { fontSize: `${v}px` } : {}
},
```

Nếu 1-to-1 raw assignment, không cần renderer — element template binding `:style="mergedStyle"` đã đủ.

### 11.4. Register

Thêm vào `registry.js` `VUE_COMPONENTS`:

```js
import FontSizeTrait from '../components/fields/FontSizeTrait.vue'

export const VUE_COMPONENTS = {
  // ...
  [TRAIT.FONT_SIZE]: FontSizeTrait,
}
```

### 11.5. Dùng

```js
attributes: [TRAIT.FONT_SIZE]
// hoặc với override:
attributes: [{ key: TRAIT.FONT_SIZE, label: 'Heading size' }]
```

---

## 12. Glossary

| Term | Đầy đủ | Ý nghĩa |
|---|---|---|
| `ns` | namespace | `'style' \| 'config' \| 'specials'` |
| `bp` | breakpoint | 1 viewport `{key, label, width, isMobile}` |
| `def` | definition data | entry trong `DEFINITIONS_DATA` (writes + schema) HOẶC registry record |
| `definition` | trait widget definition | unit reusable trong trait panel (vd `width_select`) |
| `writes` | write map | `{ writeKey: { target, schema } }` per definition |
| `writeKey` | key thực ghi vào node | vd `padding`, `--node-width`, `htmlTag` |
| `attribute` | trait attribute | item trong `meta.traits.<tab>[].attributes` |
| `target` | write target namespace | `'style' \| 'config' \| 'specials'` |
| `meta` | element metadata | runtime data export từ `meta.js` |
| `defaults` | element defaults | `{ style, config, specials, states, responsive }` fill khi factory chạy |
| `states` (namespace) | state override namespace | `data.states[state] = { style, config }` (base) + `data.responsive[bp].states[state]` (per-bp) |
| `ai` | element AI metadata | sidecar export từ `ai.js` |
| `factory` | node factory | function tạo Node mới (composed trong index.vue, wrap bởi registry) |
| `cascade` | desktop-first cascade | merge base + per-bp slots theo width ≥ current |
| `non-cascading` | NON_CASCADING set | key không cascade qua bp (vd `config.hidden`) |
| `state / variant` | meta.states.variants[].value | `'default' \| 'hover' \| 'active' \| ...` |
| `statefulKeys` | Set writeKey eligible per-state | precomputed `collectStatefulWriteKeys(meta)` |
| `allowedKeys` | runtime guard set | `{ style: Set, config: Set, specials: Set }` per element type |
| `renderers` | precomputed renderer list | ordered `(node) → CSS` cho element |
| `commonStyleData` | computed CSS từ renderers | `Object.assign({}, ...renderers.map(r => r(node)))` |
| `buildElementSchema` | schema builder | pure `meta → JSON Schema` (mirror per-bp + state-overrides) |
| `buildSatelliteSchema` | slim schema cho satellite | giữ style/config/states, bỏ responsive/events |
| `applyStateSchema` | bồi `states` vào schema | thêm property `states` (base + per-bp) qua `buildStateOverrideSchema` |
| `schema_helpers` | JSON Schema builders | `oneOfEnum`, `cssSides`, `number`, `boolean`, etc. |
| `oneOfEnum` | enum-with-description | emit `oneOf: [{const, description}]` (LLM-honored) |
| `normalizeResponsiveSlot` | shape normalizer | accept canonical `{style, config}` HOẶC flat → canonical |
| `WRITE_KEY_TARGETS` | reverse index | `writeKey → target` lookup, build từ DEFINITIONS_DATA |
| `STYLE_ASYNC` / `CONFIG_ASYNC` | per-key policy | Set định nghĩa key nào default per-bp slot (`responsivePolicy.js`) |
| `mergeStateNs` | cascade 1 ns của 1 state | `data.states[state][ns]` + `responsive[bp].states[state][ns]` qua bp |
| `mergeStateMap` | flat union state | `{ ...mergeStateNs(style), ...mergeStateNs(config) }` tại 1 bp (dùng bởi `stateCss`) |
| `mergeStateNode` | fold state vào node | synthetic node với override gập vào style/config (base + per-bp); dùng bởi `TraitField.renderNode` |

---

## 13. Common pitfalls

### "Element không xuất hiện / không render"
- Folder name khớp glob `nodes/*/index.vue`
- `meta.type` unique
- `index.vue` re-export `export const meta = { ...baseMeta, factory }`

### "Defaults không apply"
- `meta.defaults` ở **meta.js**, không phải ở `index.vue` post-spread
- writeKey thực, không phải definition slug
- `responsive` flat shape → writeKey phải nằm trong `WRITE_KEY_TARGETS`
- Specials KHÔNG cascade → đặt default vào `defaults.specials`

### "Schema build skip attribute"
- Attribute đang dùng inline-spec không có trong DEFINITIONS_DATA
- Tạo definition tương ứng vào `defs/*`, đổi attribute sang ref key

### "Store warn 'unknown key — dropped'"
- Key không nằm trong `meta.traits` → `extractAllowedKeys` không cover (chỉ áp dụng cho flat write)
- State write KHÔNG qua guard này — nếu state override mất key, xem `def.statefulKeys` (group có `stateful: true` chưa)

### "CSS không apply dù value đã set"
- Kiểm tra renderer trong `styleRenderers.js` cho trait đó
- Element template có spread `commonStyleData` vào `:style` không
- Renderer dùng `getStyle/getConfig` cần `useUIStore` đã init

### "Stateful override không apply"
- Group chứa trait có gắn `stateful: true` (writeKey mới vào `def.statefulKeys`)
- Template có `<component :is="'style'" v-if="stateCss">`
- Mixin `statefulNode` include
- `_routeState` chỉ active khi `opts.stateful: true` — TraitField tự pass khi `stateCtx` (state ≠ base) và target ≠ specials
- Override đang ghi vào `data.states[state][ns]`, KHÔNG phải `config[state]` (model cũ)

### "Responsive default override không apply"
- `meta.defaults.responsive[bp]` flat shape phải có writeKey nằm trong `WRITE_KEY_TARGETS`
- Specials KHÔNG cascade → đặt vào `defaults.specials`

### "Event action không xuất hiện trong picker"
- Append `ACTIONS` array trong `eventDefinitions.js`
- Element `meta.events.actions` whitelist (nếu có)

---

## 14. File hash (lookup helpers)

| Tìm gì | Đọc file |
|---|---|
| Data shape (namespace + states) | `composable/editor_v2/createNode.js` (top comment) |
| Cascade logic (2-phase) | `composable/editor_v2/mergeNode.js#mergeNamespace` |
| State cascade (3 reader) | `composable/editor_v2/mergeNode.js#mergeStateNs / mergeStateMap / mergeStateNode` |
| State write path | `stores/editor_v2/node.js#writeStateWithRec` + `_writeState` + `_routeState` |
| Stateful CSS injection | `composable/editor_v2/mixins/statefulNode.js` + `components/trait/fields/stateCss.js` |
| Trait widget definitions | `components/trait/fields/defs/*.js` (group split) |
| Trait widget barrel | `components/trait/fields/defs/index.js` |
| Builders + normalizers | `components/trait/fields/definitions.js` |
| Style renderers (CSS composition) | `components/trait/fields/styleRenderers.js` |
| Vue widgets cho trait | `components/trait/components/fields/*.vue` |
| JSON Schema helpers | `components/trait/fields/schema_helpers.js` |
| Trait enum constants | `components/trait/fields/enum.js` |
| Trait widget registry | `components/trait/fields/registry.js` (`VUE_COMPONENTS`) |
| Events catalog | `components/trait/fields/eventDefinitions.js` |
| Event action defs | `components/trait/fields/events/actions/*.js` |
| Event runtime engine | `components/trait/fields/events/engine.js` |
| Event Vue editors | `components/trait/components/fields/events/*.vue` |
| Element auto-register | `composable/editor_v2/registerElements.js` |
| Element registry | `composable/editor_v2/registry.js` |
| Store write actions | `stores/editor_v2/node.js` (`changeStyle/Config/Specials`, `_writeNs`, `_writeByPolicy`, `_resetNs`, `_routeState`) |
| Store-level guard | `stores/editor_v2/node.js#writeNamespaceWithRec` |
| `commonStyleData` consumer | `composable/editor_v2/mixins/nodeBase.js` |
| Style/config getter helper | `composable/editor_v2/get.js` (`getStyle`, `getConfig`) |
| Responsive slot policy | `composable/editor_v2/responsivePolicy.js` (`STYLE_ASYNC` / `CONFIG_ASYNC`) |
| Stateful mixin | `composable/editor_v2/mixins/statefulNode.js` |
| Satellite mixin | `composable/editor_v2/mixins/satelliteOwner.js` |
| Inline edit mixin | `composable/editor_v2/mixins/editableText.js` |
| Undo/Redo + history | [`10-history.md`](./10-history.md) |
