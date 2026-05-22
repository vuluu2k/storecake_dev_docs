---
sidebar_position: 8
title: Traits, Data Model & Schema System
---

# 07 — Trait Panel, Data Model & Schema System

Deep dive vào: data model 3 namespace, cascade desktop-first, trait registry (Vue-free `definitions.js` + composition `registry.js`), `buildElementSchema`, helpers JSON Schema, CI validate / build pipeline, store-level guard. Đây là **superset** thay phần "data model" trong `01-architecture.md` (đã outdate) và phần "trait panel" trong `05-extending.md`.

---

## 1. Folder layout

```
src/components/editor_v2/
├── nodes/                          # ELEMENT folder-per-type
│   ├── flex_block/
│   │   ├── index.vue               # Vue component + factory composition
│   │   ├── meta.js                 # runtime: type, label, traits, rules
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
    │   └── fields/
    │       ├── WidthSelectTrait.vue
    │       ├── HeightSelectTrait.vue
    │       └── PaddingTrait.vue
    └── fields/                     # PURE DATA (Vue-free)
        ├── definitions.js          # COMPONENT_DEFINITIONS_DATA, buildElementSchema
        ├── registry.js             # gắn Vue widget vào data
        └── schema_helpers.js       # helpers build JSON Schema
```

Convention 4 file/element folder:
- `index.vue` — Vue component + factory (cần `createNode` qua Vite alias)
- `meta.js` — **Vue-free** pure data, CI scripts import được trong plain Node
- `ai.js` (optional) — sidecar AI hints, chỉ AI-page-gen feature load lazy
- Folder name = snake_case của element type

---

## 2. Data model — 3 namespace

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

    style:    { /* CSS responsive */         padding: '20px 24px' },
    config:   { /* DATA per-bp (hiếm)  */ },
    specials: { /* base-only metadata  */    text: 'Hello' },
    events:   [ /* base-only behaviors */ ],
    bindings: [ /* base-only data refs */ ],

    responsive: {
      mobile: {
        style:  { padding: '20px 15px' },
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
| `color`, `fontSize`, `padding`, `gap`, `flexDirection`, `background` | `style` | CSS, hay đổi theo bp |
| `productId`, `href`, `text` Heading, `label` Button | `specials` | Content/data không đổi theo bp |
| `htmlId`, `className`, `ariaLabel` | `specials` | DOM metadata |
| `src` Image (art-direction crop) | `config` | Data CẦN per-bp |
| `slidesPerView` Slider | `config` | Behavior khác bp |

---

## 3. Cascade desktop-first

Source: `composable/editor_v2/mergeNode.js`.

```
mergedStyle ở 'mobile' = data.style                              ← base
                       ⊕ data.responsive.desktop.style          ← cascade
                       ⊕ data.responsive.laptop.style
                       ⊕ data.responsive.tablet.style
                       ⊕ data.responsive.mobile.style           ← current wins last
```

Loop walk `BREAKPOINTS` (desktop → mobile in `constants.js`):
- Slot width < current → SKIP (smaller bp không leak ngược)
- Slot width ≥ current → APPLY
- Sau khi áp slot current → BREAK

```js
export const mergeNamespace = (node, ns, currentBpKey) => {
  const data = node && node.data
  if (!data) return {}
  const base = data[ns] || {}
  const responsive = data.responsive || {}
  const curBpDef = BREAKPOINTS.find((b) => b.key === currentBpKey)
  if (!curBpDef) return { ...base }

  let merged = { ...base }
  for (const bp of BREAKPOINTS) {
    if (bp.width < curBpDef.width) continue
    const slot = responsive[bp.key]
    if (slot && slot[ns]) merged = { ...merged, ...slot[ns] }
    if (bp.key === currentBpKey) break
  }
  return merged
}
```

`specials` cố ý KHÔNG cascade — luôn base only.

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

### 4.2. `definitions.js` — `COMPONENT_DEFINITIONS_DATA` + `buildElementSchema`

Pure data, không import Vue. Mỗi entry mô tả 1 trait widget bằng `{ writes }` map:

```js
export const DEFINITIONS_DATA = {
  width_select: {
    writes: {
      width: {                                  // key sẽ ghi vào target
        target: 'style',                        // 'style' | 'config' | 'specials'
        schema: oneOfEnum({                     // JSON Schema cho value
          fill_container: 'Stretch to parent width',
          fit_content:    'Shrink to content',
        }),
      },
    },
  },
  height_select: { writes: { height: { target: 'style', schema: oneOfEnum({...}) } } },
  padding: {
    writes: {
      padding:         { target: 'style',  schema: cssSides({ default: '0px' }) },
      isPaddingLinked: { target: 'config', schema: boolean({ default: false }) },
    },
  },
}
```

Một definition **CÓ THỂ ghi nhiều key vào nhiều target** (vd `padding` ghi `padding` vào `style` + `isPaddingLinked` vào `config`). Đây là điểm khác chính với schema cũ (1 attribute = 1 key/target).

`getDefinitionData(keyOrAttribute)` — accept cả string (`'width_select'`) lẫn object (`{key: 'width_select', label: '...'}`).

`buildElementSchema(meta)` — walk `meta.traits` → resolve attribute → gom keys theo target → output JSON Schema:

```js
{
  type: 'object',
  properties: {
    style:    { type: 'object', properties: { width: {...}, height: {...}, padding: {...} },
                additionalProperties: false },
    config:   { type: 'object', properties: { isPaddingLinked: {...} },
                additionalProperties: false },
    // specials: empty bucket → bị drop
  },
  additionalProperties: false,
}
```

### 4.3. `registry.js` — composition layer

Mỏng. Gắn Vue widget vào data:

```js
import WidthSelectTrait from '../components/fields/WidthSelectTrait.vue'
import HeightSelectTrait from '../components/fields/HeightSelectTrait.vue'
import PaddingTrait from '../components/fields/PaddingTrait.vue'
import { DEFINITIONS_DATA } from './definitions.js'

const VUE_COMPONENTS = {
  width_select: WidthSelectTrait,
  height_select: HeightSelectTrait,
  padding: PaddingTrait,
}

export const COMPONENT_DEFINITIONS = Object.fromEntries(
  Object.entries(DEFINITIONS_DATA).map(([k, def]) => [k, { ...def, component: VUE_COMPONENTS[k] || null }])
)

export const getComponentDefinition = (keyOrAttribute) => {
  const key = typeof keyOrAttribute === 'object' && keyOrAttribute !== null ? keyOrAttribute.key : keyOrAttribute
  return COMPONENT_DEFINITIONS[key] || null
}
```

Lý do tách 2 file: `definitions.js` không có Vue import → CI scripts load được trong plain Node (vite-node 0.34 có vấn đề với Node 20 + Vue SFC transitive). `registry.js` runtime mới gắn widget vào.

---

## 5. Element meta — runtime vs AI sidecar

### 5.1. `meta.js` — runtime data

Chỉ chứa thứ editor cần lúc chạy:

```js
// nodes/flex_block/meta.js
export const meta = {
  type: 'flex-block',                          // unique key
  label: 'Block',                              // sidebar / layers display
  category: 'layout',                          // sidebar group
  showInSidebar: false,                        // hidden trong sidebar picker
  isContainer: true,                           // accept children drop
  rules: { isRootOnly: false },                // drop-rule
  traits: {
    general: [
      {
        key: 'layout',
        label: 'Layout',
        attributes: ['width_select', 'height_select', 'padding'],
      },
    ],
    advanced: [],
  },
}
```

**Không có** `factory` (sống trong `index.vue` vì cần `createNode` qua Vite alias).
**Không có** `description / aiHints / examples` (sống trong `ai.js`).

### 5.2. `ai.js` — AI-page-generation hints

```js
// nodes/flex_block/ai.js
export const ai = {
  description: '...',
  hints: { useWhen, avoidWhen, contentTips },
  expectedChildren: { typical, patterns },
  layoutHints: { whenChildren },
  examples: [
    {
      description: 'Vertical CTA stack',
      def: { type: 'flex-block', style: {...}, children: [...] },
    },
  ],
  semantics: ['layout', 'container', 'inner-layout'],
}
```

**Không runtime code import `ai.js`** — chỉ AI-page-gen feature `import('./<element>/ai.js')` lazy. Production bundle không kéo.

### 5.3. `index.vue` — Vue + factory composition

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

// Compose runtime meta — spread base + thêm factory
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

### 5.4. Auto-registration

`composable/editor_v2/registerElements.js` glob `nodes/*/index.vue` 1 lần lúc PageWrapper mount. Mỗi index.vue export `default` (Vue component) + `meta` (composed) → `registerElement(meta, component)`.

Thêm element mới: chỉ tạo folder + 2-3 file, **không sửa registry**.

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

Không qua COMPONENT_DEFINITIONS. TraitField cũ sẽ resolve `type → component` trực tiếp. `buildElementSchema` **SKIP** inline-spec (không có definition tương ứng) — element schema sẽ không có key đó cho đến khi migrate.

Hiện chỉ `heading/meta.js` còn dùng inline-spec (text, color, fontSize, fontWeight, textAlign, htmlId, className). Migrate bằng cách thêm definition tương ứng vào `definitions.js`.

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
    <span v-else>[unsupported field: ...]</span>
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
- Đọc value từ node (qua `mergeNamespace(node, target, breakpointActive)`)
- Render UI (input/select/dialog)
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

## 8. JSON Schema output — `buildElementSchema` + CI

### 8.1. Pure function

```js
import { buildElementSchema } from '@/components/editor_v2/components/trait/fields/definitions'
import { meta } from '@/components/editor_v2/nodes/flex_block/meta.js'

const schema = buildElementSchema(meta)
// → { type: 'object', properties: { style: {...}, config: {...} } }
```

Walk `meta.traits.general` + `meta.traits.advanced`, resolve attribute via `getDefinitionData`, group writes theo target. Output match contract `{ type, style?, config?, specials?, children? }` của `createNodeTree`.

### 8.2. Use cases

| Consumer | Format dùng |
|---|---|
| **AI page generation** | LLM tool input — schema feed vào `tools` param. LLM trả `{ style:{width:'fill_container'}, config:{...} }` đúng shape |
| **Runtime patch validate** | Ajv compile schema → check user paste / undo redo / dev console không tạo key xấu |
| **Doc generator** | "Heading có thể set những gì" bảng tự động |
| **External validator** | Backend Elixir verify page def hợp lệ trước khi save |

### 8.3. CI scripts

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

### 8.4. GitHub Action

`.github/workflows/validate-trait-schemas.yml` — chạy `npm run validate:schemas` trên mọi PR vào master. Fail build nếu schema lỗi syntax / target sai / element registry conflict.

---

## 9. Store-level guard — `allowedKeys`

`stores/editor_v2/node.js._writeNamespace` là chokepoint duy nhất cho cả 3 hàm `changeStyle/Config/Specials` + reset variants. Tại đây thêm whitelist check:

```js
_writeNamespace(id, ns, patch, slot) {
  const node = this.nodes[id]
  if (!node || !patch) return
  const allowed = getAllowedKeys(node.data.type, ns)
  if (allowed && allowed.size) {
    for (const key in patch) {
      if (!allowed.has(key)) {
        console.warn(`[editor_v2] ${node.data.type}.${ns}: unknown key '${key}' — dropped`)
        delete patch[key]
      }
    }
  }
  // ... actual write
}
```

`getAllowedKeys(type, ns)` (exported từ `composable/editor_v2/registry.js`) trả Set của allowed keys, cached 1 lần lúc `registerElement`. Build từ `extractAllowedKeys(meta.traits)` — union 2 nguồn:
- **Definition ref** → expand `def.writes`, add từng writeKey vào set theo target
- **Legacy inline-spec** → add `attr.key` vào set theo `attr.target`

Empty Set = "no rules declared" → skip check (system nodes / type chưa register).

### Guard layers

| Layer | Khi nào fire | Hành vi key lạ |
|---|---|---|
| `TraitField.onChange` | UI thao tác trên trait panel | `console.error` + return |
| `store._writeNamespace` | Chokepoint mọi change* + reset* | `console.warn` + drop key, write rest |
| `validate:schemas` CI | Mỗi PR vào master | Fail build |

---

## 10. Adding a new trait field type

### 10.1. Định nghĩa

Thêm vào `definitions.js`:

```js
import { oneOfEnum, number, withDescription } from './schema_helpers.js'

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
// đọc value qua mergeNamespace + emit 'change' event với key/value
</script>
```

### 10.3. Register

Thêm vào `registry.js` `VUE_COMPONENTS`:

```js
const VUE_COMPONENTS = {
  width_select: WidthSelectTrait,
  height_select: HeightSelectTrait,
  padding: PaddingTrait,
  font_size: FontSizeTrait,                    // ← new
}
```

### 10.4. Dùng

Trong meta của element:

```js
attributes: ['font_size']
// hoặc với override:
attributes: [{ key: 'font_size', label: 'Heading size' }]
```

### 10.5. CI tự cover

`npm run validate:schemas` sẽ check schema mới Ajv-compilable. `npm run build:schemas` sinh thêm vào output.

---

## 11. Adding a new element

```bash
mkdir src/components/editor_v2/nodes/my_widget
```

### 11.1. `meta.js` (runtime data)

```js
export const meta = {
  type: 'my-widget',
  label: 'My Widget',
  category: 'basic',
  showInSidebar: true,
  isContainer: false,
  rules: { isRootOnly: false },
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
  <div class="wk-my-widget" :style="mergedStyle" v-bind="nodeAttrs">
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
  hints: {
    useWhen: ['...'],
    avoidWhen: ['...'],
  },
  examples: [
    { description: 'Default', def: { type: 'my-widget', specials: { text: 'Hi' } } },
  ],
  semantics: ['custom'],
}
```

### 11.4. Auto-discovery

`registerElements.js` glob `nodes/*/index.vue` → element tự xuất hiện. Không sửa file khác.

### 11.5. Verify

```bash
npm run validate:schemas    # check element schema valid
npm run dev                 # test trong editor
```

---

## 12. Glossary

| Term | Đầy đủ | Ý nghĩa |
|---|---|---|
| `ns` | namespace | `'style' \| 'config' \| 'specials'` |
| `bp` | breakpoint | 1 viewport `{key, label, width, isMobile}` |
| `def` | definition data | entry trong `COMPONENT_DEFINITIONS` (writes + schema + Vue component) |
| `definition` | trait widget definition | unit reusable trong trait panel (vd `width_select`) |
| `writes` | write map | `{ writeKey: { target, schema } }` per definition |
| `attribute` | trait attribute | item trong `meta.traits.<tab>[].attributes` |
| `target` | write target namespace | `'style' \| 'config' \| 'specials'` |
| `meta` | element metadata | runtime data export từ `meta.js` |
| `ai` | element AI metadata | sidecar export từ `ai.js` |
| `factory` | node factory | function tạo Node mới (composed trong index.vue) |
| `cascade` | desktop-first cascade | merge base + per-bp slots theo width ≥ current |
| `allowedKeys` | runtime guard set | `{ style: Set, config: Set, specials: Set }` per element type |
| `buildElementSchema` | schema builder | pure function `meta → JSON Schema` |
| `schema_helpers` | JSON Schema builders | `oneOfEnum`, `cssSides`, `number`, `boolean`, etc. |
| `oneOfEnum` | enum-with-description | emit `oneOf: [{const, description}]` (LLM-honored shape) |

---

## 13. Common pitfalls

### "Element không xuất hiện trong sidebar / không render"
- Kiểm tra folder name + có `index.vue` + `meta.js`
- Kiểm tra `meta.type` unique, không trùng element khác
- `registerElements.js` glob là `*/index.vue` — file phải đúng tên đó (không phải `flex_block.vue`)

### "Schema build skip attribute"
- Attribute đang dùng inline-spec (`{key, type, target}`) không có trong `COMPONENT_DEFINITIONS`
- Tạo definition tương ứng trong `definitions.js`, đổi attribute sang ref key

### "Store warn 'unknown key — dropped'"
- Key bạn ghi không có trong `meta.traits` của element type đó
- Hoặc thêm vào traits, hoặc check lại key có đúng namespace không

### "CI fail 'invalid JSON Schema'"
- Helper trả schema sai → check `schema_helpers.js`
- Common: pattern regex thiếu escape, `enum` không phải array

### "AI sinh out key không tồn tại"
- LLM bịa key — `buildElementSchema` output có `additionalProperties: false` để Ajv reject
- Validate AI output trước khi dispatch vào store: `ajv.compile(schema)(aiOutput)`

### "Vite-node 0.34 ERR_UNKNOWN_FILE_EXTENSION .vue trong CI"
- Đã giải: `definitions.js` + `meta.js` đều Vue-free, scripts chạy plain Node, không qua vite-node
- Đừng import `registry.js` từ tooling — luôn import `definitions.js` trực tiếp

### "Object default bị split nhầm thành per-bp"
- `isBreakpointMap` (mergeNode.js) chỉ split khi object có ít nhất 1 key thuộc `{base, _, desktop, laptop, tablet, mobile}`
- Complex value (vd shadow `{x, y, blur, color}`) không có key bp → giữ nguyên

---

## 14. Migration notes

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
   font_size: {
     writes: { fontSize: { target: 'style', schema: number({ min: 8, max: 96, default: 24 }) } },
   }
   ```
2. Tạo widget `FontSizeTrait.vue` (đọc + emit `'fontSize'`)
3. Register vào `VUE_COMPONENTS` map
4. Đổi element meta:
   ```js
   attributes: ['font_size']
   ```

### Từ flat `nodes/*.vue` sang folder

Trước: `nodes/FlexBlockV2.vue` (component + meta inline)

Sau:
1. `mkdir nodes/flex_block`
2. Tách meta data (Vue-free) ra `nodes/flex_block/meta.js`
3. Tách AI hints (nếu có) ra `nodes/flex_block/ai.js`
4. Đổi `FlexBlockV2.vue` thành `nodes/flex_block/index.vue` — bỏ inline `meta`, thêm `import { meta as baseMeta } from './meta.js'` + compose factory
5. `registerElements.js` glob đã là `*/index.vue` — không cần sửa

---

## 15. File hash (lookup helpers)

| Tìm gì | Đọc file |
|---|---|
| Data shape 3 namespace | `composable/editor_v2/createNode.js` (top comment) |
| Cascade logic | `composable/editor_v2/mergeNode.js` |
| Trait widget definitions | `components/editor_v2/components/trait/fields/definitions.js` |
| Vue widgets cho trait | `components/editor_v2/components/trait/components/fields/*.vue` |
| JSON Schema helpers | `components/editor_v2/components/trait/fields/schema_helpers.js` |
| Element auto-register | `composable/editor_v2/registerElements.js` |
| Element registry lookup | `composable/editor_v2/registry.js` (`getDef`, `factoryFor`, `getAllowedKeys`) |
| Store write actions | `stores/editor_v2/node.js` (`changeStyle/Config/Specials`, `_writeNamespace`) |
| Store-level guard | `stores/editor_v2/node.js._writeNamespace` (allowedKeys check) |
| CI validator | `scripts/validate-trait-schemas.mjs` |
| CI builder | `scripts/build-trait-schemas.mjs` |
| Output JSON | `schemas/trait-definitions.json`, `schemas/elements/<type>.json`, `schemas/elements.json` |
