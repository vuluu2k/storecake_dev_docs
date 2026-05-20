# 07 — Trait Panel & Data System

Deep dive vào trait panel + data model split (style / config / specials) + cascade + defaults + commit pipeline. Đây là **superset** thay thế phần "data model" trong `01-architecture.md` (đã outdate).

---

## 1. Data model mới — 3 namespace

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

    // ─── 3 namespace ────────────────────────────────────────────
    style:    { /* CSS visual, per-bp được */ padding: '20px 24px' },
    config:   { /* DATA cần variation per-bp, hiếm — vd image src */ },
    specials: { /* BASE-ONLY: text, htmlId, className, productId */ text: 'Hello' },

    responsive: {
      mobile: {
        style:  { padding: '20px 15px' },   // override mobile only
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

| Câu hỏi quyết định | → Namespace |
|---|---|
| Field này có meaningful **khác giữa desktop và mobile** không? | YES + CSS → `style` |
| | YES + DATA (vd Image src crop khác cho mobile) → `config` |
| | NO → `specials` |

| Field | Namespace | Lý do |
|---|---|---|
| `color`, `fontSize`, `padding`, `gap`, `flexDirection`, `background` | `style` | CSS, hay đổi theo bp |
| `productId` (1 sản phẩm cố định) | `specials` | Data không đổi theo bp |
| `text` Heading, `label` Button, `href` | `specials` | Content không đổi theo bp |
| `htmlId`, `className`, `ariaLabel` | `specials` | DOM metadata |
| `hiddenOn: ['mobile']` (visibility flag) | `specials` | Bản thân value đã encode bp |
| `src` Image (art-direction crop khác bp) | `config` | Data CẦN per-bp |
| `slidesPerView` Slider (3 desktop, 1 mobile) | `config` | Behavior khác theo bp |

---

## 2. Cascade desktop-first

Source: `composable/editor_v2/mergeNode.js`.

```js
mergedStyle ở 'mobile' = data.style                              // 1. base
                       ⊕ data.responsive.desktop.style          // 2. apply nếu width ≥ current
                       ⊕ data.responsive.laptop.style
                       ⊕ data.responsive.tablet.style
                       ⊕ data.responsive.mobile.style           // 3. current bp wins last
```

Loop walk `BREAKPOINTS` (declared desktop → mobile in `constants.js`):
- Slot có `bp.width < currentBp.width` → SKIP (smaller bp không leak ngược lên)
- Slot có `bp.width >= currentBp.width` → APPLY (cascade xuống)
- Sau khi áp slot của currentBp → BREAK

### `mergeNamespace(node, ns, currentBpKey)` line-by-line

```js
export const mergeNamespace = (node, ns, currentBpKey) => {
  const data = node && node.data                       // safe access node có thể null
  if (!data) return {}                                  // node không hợp lệ → object rỗng
  const base = data[ns] || {}                           // base namespace, vd data.style
  const responsive = data.responsive || {}              // map { bpKey: { style, config } }
  const curBpDef = BREAKPOINTS.find((b) => b.key === currentBpKey)
                                                         // tìm định nghĩa bp current để biết width
  if (!curBpDef) return { ...base }                     // bp unknown → trả về base copy (safety)

  let merged = { ...base }                              // start với base — clone để không mutate
  for (const bp of BREAKPOINTS) {                       // walk desktop → mobile
    if (bp.width < curBpDef.width) continue             // skip slot nhỏ hơn current
    const slot = responsive[bp.key]                     // vd responsive.tablet
    if (slot && slot[ns]) merged = { ...merged, ...slot[ns] }
                                                         // apply override → later wins
    if (bp.key === currentBpKey) break                  // dừng tại current — không apply slot nhỏ hơn
  }
  return merged
}
```

Biến viết tắt:
- `ns` = **namespace** (`'style' | 'config' | 'specials'`)
- `bp` = **breakpoint** (`{ key, label, width, isMobile }`)
- `curBpDef` = current breakpoint definition
- `merged` = accumulator object

---

## 3. Trait panel kiến trúc

```
┌─────────────────────────────────────────────────────────────┐
│ Trait.vue                                                   │
│  - Đọc selectedNode từ nodeStore.events.selected[0]         │
│  - Lookup meta qua getDef(selectedNode.data.type)           │
│  - Render tab → group → field (qua TraitField generic)      │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ TraitField.vue                                              │
│  - Resolve component qua getFieldComponent(schema)          │
│  - Read value qua mergeNamespace + fallback default         │
│  - Render component + slot icon nếu cần                     │
│  - Listen 4 event variants → onInput → applyTrait           │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ FIELD_COMPONENTS + COMPONENT_BY_TYPE (registry.js)          │
│  - FIELD_COMPONENTS: name string → Vue component            │
│  - COMPONENT_BY_TYPE: data type → default component          │
└─────────────────────────────────────────────────────────────┘
```

### Schema shape (object form)

```js
// meta.traits — object với 2 tab cố định
{
  general: [
    {                                  // 1 group
      key: 'size',
      label: 'Size',
      attributes: [                    // mảng FIELD
        {
          key: 'width',                // prop name in namespace
          type: 'select',              // data type → default component
          target: 'style',             // namespace ('style' | 'config' | 'specials')
          label: 'Width',              // hiển thị trong TraitItemWrapper
          default: 'fill_container',   // value gốc — primitive | per-bp map | complex value
          disabled: true,              // boolean | (data) => boolean
          props: {                     // pass-through vào component
            options: [
              { label: 'Fill', value: 'fill_container' },
              { label: 'Fit', value: 'fit_content' },
            ],
          },
        },
        // … field khác
      ],
    },
    // … group khác trong tab general
  ],
  advanced: [/* same shape */],
}
```

### Field properties chi tiết

| Property | Type | Default | Ý nghĩa |
|---|---|---|---|
| `key` | string | required | Prop name trong namespace (vd `padding` → `data.style.padding`) |
| `type` | string | required | Data type — drives default UI component qua `COMPONENT_BY_TYPE` |
| `target` | `'style' \| 'config' \| 'specials'` | `'style'` | Namespace để read/write |
| `label` | string | – | Label hiển thị field |
| `default` | primitive \| bp map \| object | – | Default value (xem section 5) |
| `disabled` | boolean \| function | `false` | Disable input. Function nhận `node.data` → boolean |
| `visible` | boolean \| function | `true` | Hiện/ẩn field. Function nhận `node.data` |
| `component` | string | – | Override default component qua `FIELD_COMPONENTS[name]` |
| `icon` | string | – | Override default icon (qua `ICON_COMPONENTS`) |
| `props` | object | `{}` | Pass-through props vào component (`options`, `min`, `max`, `dialogType`, …) |
| `writeOpts` | object | – | Override write target — vd `{ breakpoint: 'base' }` |

---

## 4. `TraitField.vue` — line-by-line

### Template

```vue
<TraitItemWrapper v-if="visible" :label="schema.label">
  <component
    :is="resolvedComponent"               <!-- dynamic component -->
    v-if="resolvedComponent"              <!-- guard nếu chưa register -->
    v-bind="resolvedProps"                <!-- spread props từ schema -->
    :field="schema"                       <!-- forward cho TraitAssetInput -->
    :node-id="node.id"                    <!-- để dialog biết target -->
    :value="value"                        <!-- value đã merge cascade + formatter -->
    :model-value="value"                  <!-- fallback cho v-model pattern -->
    :disabled="resolvedDisabled"
    @input="onInput"                      <!-- live keystroke -->
    @change="onInput"                     <!-- blur / Enter -->
    @update:value="onInput"               <!-- Vue 3 v-model -->
    @update:modelValue="onInput"          <!-- v-model variant -->
  >
    <template v-if="iconComponent" #icon>  <!-- slot icon cho TraitAssetInput type=custom -->
      <component :is="iconComponent" />
    </template>
  </component>
  <span v-else>[unsupported field: …]</span>  <!-- fallback nếu không có component -->
</TraitItemWrapper>
```

### Computed `value` — read pipeline

```js
value() {
  // 1. Đọc raw value từ store
  //    - specials: base only, không cascade
  //    - style/config: cascade qua mergeNamespace
  const raw = this.target === 'specials'
    ? (this.node.data.specials || {})[this.schema.key]
    : mergeNamespace(this.node, this.target, this.breakpointActive)[this.schema.key]

  // 2. Display fallback — khi store chưa có value (node cũ, schema mới)
  //    Resolve default theo cascade rule giống mergeNamespace
  let effective = raw
  if (effective === undefined) {
    effective = resolveDefaultForBp(this.schema.default, this.breakpointActive)
  }

  // 3. Type-specific formatter — vd 'spacing' → collapse shorthand
  //    '20px 24px 20px 24px' → '20px 24px'
  const fmt = FORMATTERS_BY_TYPE[this.schema.type]
  return fmt ? fmt(effective) : effective
}
```

Biến viết tắt:
- `raw` = giá trị thô đọc từ store (chưa format)
- `effective` = giá trị thực tế sau fallback default
- `fmt` = formatter function

### Method `onInput` — write pipeline

```js
onInput(v) {
  const store = useNodeStore()
  const patch = { [this.schema.key]: v }     // build patch object {key: value}
  const opts = this.schema.writeOpts || undefined
                                             // schema có thể override write target
  if (this.target === 'style')
    store.changeStyle(this.node.id, patch, opts)         // default → current bp
  else if (this.target === 'config')
    store.changeConfig(this.node.id, patch, opts)        // default → base
  else if (this.target === 'specials')
    store.changeSpecials(this.node.id, patch)            // luôn base
}
```

---

## 5. Defaults — 3 dạng

`field.default` chấp nhận 3 shape:

### Dạng 1: Primitive

```js
{ key: 'fontSize', default: 24 }
{ key: 'color',    default: '#1a1a1a' }
{ key: 'text',     default: 'Hello' }
```

→ Seed vào `data[ns][key]` (base).

### Dạng 2: Responsive map

```js
{ key: 'padding', default: {
    base:    '20px 24px',   // → data.style.padding
    mobile:  '20px 15px',   // → data.responsive.mobile.style.padding
    laptop:  '20px 32px',   // → data.responsive.laptop.style.padding
  }
}
```

Reserved keys: `base` (hoặc `_`) → base slot. Còn lại = bp key (`desktop/laptop/tablet/mobile`).

**Phát hiện**: object có ít nhất 1 key thuộc `{base, _, desktop, laptop, tablet, mobile}`.

### Dạng 3: Complex value (object literal)

```js
{ key: 'shadow', default: { x: 0, y: 4, blur: 8, color: '#000' } }
{ key: 'badge',  default: { type: 'success', text: 'New' } }
```

→ Ghi NGUYÊN object vào `data[ns][key]` (như primitive).

**Phát hiện**: object không có key bp/reserved.

### Function check shape

```js
import { isBreakpointMap } from '@/composable/editor_v2/mergeNode'

isBreakpointMap('20px')                                  // false (primitive)
isBreakpointMap({ base: '20px', mobile: '15px' })        // true
isBreakpointMap({ mobile: '15px' })                      // true
isBreakpointMap({ x: 0, y: 4 })                          // false (complex value)
isBreakpointMap([1, 2, 3])                               // false (array)
isBreakpointMap(null)                                    // false
```

### `isBreakpointMap` line-by-line

```js
// Sets được build 1 lần khi module load
const RESERVED_KEYS = new Set(['base', '_'])
const BP_KEYS = new Set(BREAKPOINTS.map((b) => b.key))
                                          // ['desktop','laptop','tablet','mobile']

const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v)
                                          // loại null, undefined, array

export const isBreakpointMap = (v) => {
  if (!isPlainObject(v)) return false     // primitive/array → false
  for (const k in v) {
    if (RESERVED_KEYS.has(k) || BP_KEYS.has(k)) return true
                                          // có 1 key match → là responsive map
  }
  return false                            // toàn key lạ → complex value
}
```

### `resolveDefaultForBp` cascade default theo bp

```js
export const resolveDefaultForBp = (def, currentBpKey) => {
  if (def === undefined) return undefined         // no default → undefined
  if (!isBreakpointMap(def)) return def           // primitive/complex → as-is

  // Responsive map → cascade
  let result = def.base !== undefined ? def.base : def._   // start với base
  const cur = BREAKPOINTS.find((b) => b.key === currentBpKey)
  if (!cur) return result                                   // bp unknown → base only

  for (const bp of BREAKPOINTS) {                 // walk desktop → mobile
    if (bp.width < cur.width) continue            // skip smaller
    if (def[bp.key] !== undefined) result = def[bp.key]    // apply slot
    if (bp.key === currentBpKey) break            // dừng tại current
  }
  return result
}
```

---

## 6. Factory seeding — `registerElement` wrap

Source: `composable/editor_v2/registry.js`.

```js
export const registerElement = (meta, component) => {
  if (!meta || !meta.type) { console.warn(...); return }

  const defaults = extractTraitDefaults(meta.traits)     // walk schema → defaults map
  const origFactory = meta.factory

  const factory = origFactory
    ? (overrides) => {
        const node = origFactory(overrides)              // factory gốc của element
        if (!node || !node.data) return node

        // Merge defaults — fill missing, KHÔNG overwrite
        node.data.style    = { ...defaults.style,    ...(node.data.style    || {}) }
        node.data.config   = { ...defaults.config,   ...(node.data.config   || {}) }
        node.data.specials = { ...defaults.specials, ...(node.data.specials || {}) }

        // Per-bp defaults (từ responsive map form)
        if (defaults.responsive && Object.keys(defaults.responsive).length) {
          node.data.responsive = node.data.responsive || {}
          for (const bpKey in defaults.responsive) {
            const defSlot = defaults.responsive[bpKey]
            const existing = node.data.responsive[bpKey] || {}
            node.data.responsive[bpKey] = {
              style:  { ...(defSlot.style  || {}), ...(existing.style  || {}) },
              config: { ...(defSlot.config || {}), ...(existing.config || {}) },
            }
          }
        }
        return node
      }
    : null

  reg[meta.type] = { ...meta, factory, defaults, component }
}
```

### `extractTraitDefaults(traits)` — walk schema

```js
const SEED_NS = ['style', 'config', 'specials']

const extractTraitDefaults = (traits) => {
  const out = { style: {}, config: {}, specials: {}, responsive: {} }
  if (!traits || typeof traits !== 'object') return out

  // Hỗ trợ cả 2 shape: { general:[...], advanced:[...] } HOẶC [{...},{...}]
  const tabs = Array.isArray(traits) ? traits : Object.values(traits)

  for (const tab of tabs) {
    const groups = Array.isArray(tab) ? tab : tab && tab.groups
    if (!Array.isArray(groups)) continue
    for (const group of groups) {
      // Mỗi group có `attributes` (convention hiện tại) hoặc `fields`
      const fields = (group && (group.attributes || group.fields)) || []
      for (const f of fields) seedField(out, f)
    }
  }
  return out
}

const seedField = (out, field) => {
  if (!field || field.default === undefined) return
  const ns = SEED_NS.includes(field.target) ? field.target : 'style'

  if (isBreakpointMap(field.default)) {
    // Dạng 2: responsive map
    for (const bpKey in field.default) {
      const value = field.default[bpKey]
      if (bpKey === 'base' || bpKey === '_') {
        writeDefault(out, ns, field.key, value)
      } else {
        writeResponsiveDefault(out, bpKey, ns, field.key, value)
      }
    }
    return
  }
  // Dạng 1 + 3: primitive hoặc complex value → base
  writeDefault(out, ns, field.key, field.default)
}
```

Biến viết tắt:
- `SEED_NS` = list namespace được seed (`style/config/specials`)
- `out` = accumulator return
- `ns` = namespace của field
- `f`, `field` = trait field schema
- `defSlot` = default slot tại 1 bp

---

## 7. Write actions trong store

Source: `stores/editor_v2/node.js`.

```js
// Generic dispatcher — pick writer theo field.target
applyTrait(nodeId, field, value, opts) {
  if (!nodeId || !field || !field.key) return
  const target = field.target || 'style'
  const patch = { [field.key]: value }
  const writeOpts = opts || field.writeOpts
  if (target === 'style')    this.changeStyle(nodeId, patch, writeOpts)
  else if (target === 'config')   this.changeConfig(nodeId, patch, writeOpts)
  else if (target === 'specials') this.changeSpecials(nodeId, patch)
}

// CSS-related — default ghi vào CURRENT BP
changeStyle(id, patch, opts = {}) {
  const bp = useUIStore().breakpointActive
  const slot = resolveBreakpointSlot(opts.breakpoint ?? 'current', bp)
  this._writeNamespace(id, 'style', patch, slot)
}

// Data — default ghi vào BASE
changeConfig(id, patch, opts = {}) {
  const bp = useUIStore().breakpointActive
  const slot = resolveBreakpointSlot(opts.breakpoint ?? 'base', bp)
  this._writeNamespace(id, 'config', patch, slot)
}

// Metadata — LUÔN base
changeSpecials(id, patch) {
  this._writeNamespace(id, 'specials', patch, null)
}

// Reset helpers — delete key khỏi target slot
resetStyle(id, keys, opts)     { ... patch[k] = undefined; changeStyle(...) }
resetConfig(id, keys, opts)    { ... }
resetSpecials(id, keys)        { ... }
```

### `_writeNamespace` core helper

```js
_writeNamespace(id, ns, patch, slot) {
  const node = this.nodes[id]
  if (!node || !patch) return

  // slot === null → base. Số/string → responsive[slot]
  const target =
    slot === null
      ? (node.data[ns] = node.data[ns] || {})
      : ((node.data.responsive[slot] = node.data.responsive[slot] || { style: {}, config: {} })[ns]
          = node.data.responsive[slot][ns] || {})

  const next = { ...target }
  for (const key in patch) {
    if (patch[key] === undefined) delete next[key]   // undefined → reset
    else next[key] = patch[key]
  }

  if (slot === null) node.data[ns] = next
  else node.data.responsive[slot][ns] = next
}
```

### `resolveBreakpointSlot` (leaf util trong `createNode.js`)

```js
//   'current' → current bp key
//   'base' / null / undefined → null (= base slot)
//   any other → pass through (explicit bp key)
export const resolveBreakpointSlot = (target, currentBp) => {
  if (target === 'base' || target === null || target === undefined) return null
  if (target === 'current') return currentBp
  return target
}
```

---

## 8. Dialog pattern — commit via `applyTrait`

Khi field cần UI phức tạp (vd padding 4 input, color picker, image dialog), TraitAssetInput chỉ là TRIGGER. Dialog mới chứa input thật.

### Flow

```
1. User click TraitAssetInput trong Trait panel
   ↓
2. TraitAssetInput.toggleSettingDialog(e, dialogType):
   - Compose data: { field, nodeId } (từ props mới)
   - ui.toggleDialogVis(e, dialogType, data)
   ↓
3. UI store push:
   ui.settingDialogs.push({ type, position, data: { field, nodeId } })
   ↓
4. Dialog component (vd PaddingDialog) detect visible qua SettingDialog wrapper
   ↓
5. Dialog đọc context:
   computed.ctx = ui.settingDialogs.find(s => s.type === dialogType)?.data
   ↓
6. Dialog đọc currentValue qua mergeNamespace → fill inputs
   ↓
7. User edit → dialog commit:
   useNodeStore().applyTrait(ctx.nodeId, ctx.field, value)
   ↓
8. Store update → mergeNamespace re-compute → TraitField value updates
   → TraitAssetInput display sync theo
```

### `PaddingDialog` line-by-line

```js
computed: {
  // 1. ID dialog type — từ $attrs (parent SettingDialogs.vue truyền)
  dialogType() { return this.$attrs.type },

  // 2. Entry trong ui store nếu dialog đang mở
  dialogEntry() {
    return this.settingDialogs.find((s) => s.type === this.dialogType) || null
  },

  // 3. Trait-binding context: { field, nodeId } — TraitAssetInput truyền
  ctx() { return this.dialogEntry && this.dialogEntry.data },

  // 4. Node hiện tại trong store
  node() { return this.ctx ? this.nodes[this.ctx.nodeId] : null },

  // 5. Current value qua mergeNamespace (cascade ở current bp)
  currentValue() {
    if (!this.ctx || !this.node) return null
    const merged = mergeNamespace(this.node, this.ctx.field.target || 'style', this.breakpointActive)
    return merged[this.ctx.field.key]
  },
},

watch: {
  currentValue: {
    immediate: true,
    handler(val) {
      // Skip resync nếu update này là echo của commit chính ta
      // (tránh loop: commit → store change → currentValue change → sync → ghi lại)
      if (val === this._lastCommitted) return
      this.syncFromValue(val)
    },
  },
},

methods: {
  // Đọc value → parse → fill 4 input
  syncFromValue(value) {
    const v = value !== undefined ? value : this.currentValue
    const s = parseSides(v)            // '20px 24px' → { top:20, right:24, bottom:20, left:24 }
    this.paddings = { top: s.top, right: s.right, bottom: s.bottom, left: s.left }
  },

  // 4 input @input/@change/@update:* fire → handler
  handleChange(key, val) {
    // Defensive parse: WkInput có thể emit string, Event object, hoặc number
    const raw = val && val.target !== undefined ? val.target.value : val
    const n = Number(raw)
    const next = Number.isFinite(n) ? n : 0

    // Dedupe — 4 event variant có thể fire cùng giá trị nhiều lần
    if (this.paddings[key] === next && !this.isConstraint) return

    if (this.isConstraint) {
      // Constraint mode: 4 cạnh sync
      this.paddings = { top: next, right: next, bottom: next, left: next }
    } else {
      this.paddings = { ...this.paddings, [key]: next }
    }
    this.commit()
  },

  // Format → applyTrait
  commit() {
    if (!this.ctx) return
    const value = formatSides(this.paddings)   // {20,24,20,24} → '20px 24px'
    this._lastCommitted = value                 // mark để skip resync
    useNodeStore().applyTrait(this.ctx.nodeId, this.ctx.field, value)
  },
}
```

Biến viết tắt:
- `ctx` = context (binding info pass qua ui store)
- `s` = parsed sides `{top, right, bottom, left}`
- `raw` = raw value từ event (chưa parse)
- `next` = giá trị mới sau parse
- `n` = Number conversion result
- `_lastCommitted` = instance field (không reactive) — track giá trị vừa commit

---

## 9. Component registry (FIELD_COMPONENTS)

Source: `components/editor_v2/components/trait/fields/registry.js`.

```js
// Vue component addressable by string — extension point cho plugin
export const FIELD_COMPONENTS = {
  WkInput, WkSelect, WkSwitch, WkTabs,
  TraitAssetInput,
}

// Data type → default component (drives `type:` field shorthand)
export const COMPONENT_BY_TYPE = {
  text:    WkInput,
  number:  WkInput,        // + field.props = { type: 'number', min, max }
  select:  WkSelect,       // + field.props = { options: [{label,value}] }
  tabs:    WkTabs,         // + field.props = { tabs: [{label,value,icon}] }
  switch:  WkSwitch,
  color:   TraitAssetInput,   // → type='color' (color swatch preview)
  spacing: TraitAssetInput,   // → type='custom' + icon slot
  image:   TraitAssetInput,   // → type='image' (thumbnail)
  video:   TraitAssetInput,   // → type='video'
}

// TraitAssetInput's `type` prop (render mode) ≠ field's `type` (data type)
// Auto-fill khi resolvedComponent === TraitAssetInput
export const ASSET_INPUT_TYPE_BY_DATA_TYPE = {
  color:   'color',
  image:   'image',
  video:   'video',
  spacing: 'custom',
  border:  'custom',
  corner:  'custom',
  shadow:  'custom',
}

// Icon component cho slot #icon của TraitAssetInput
export const ICON_COMPONENTS = {
  WkiPadding,
}

// Map dialogType → icon mặc định
export const DIALOG_ICON_BY_TYPE = {
  padding: 'WkiPadding',
  margin:  'WkiPadding',     // reuse cho tới khi có WkiMargin
}

// 2-layer resolve: component
export const getFieldComponent = (field) => {
  if (field.component && FIELD_COMPONENTS[field.component])
    return FIELD_COMPONENTS[field.component]               // explicit override
  return COMPONENT_BY_TYPE[field.type] || null             // default by type
}

// Resolve icon (cho TraitAssetInput slot)
export const getFieldIcon = (field) => {
  if (field.icon && ICON_COMPONENTS[field.icon]) return ICON_COMPONENTS[field.icon]
  const dialogType = field.props && field.props.dialogType
  if (dialogType && DIALOG_ICON_BY_TYPE[dialogType]) {
    return ICON_COMPONENTS[DIALOG_ICON_BY_TYPE[dialogType]] || null
  }
  return null
}
```

---

## 10. Breakpoint system

Source: `composable/editor_v2/constants.js`.

```js
export const BREAKPOINTS = [
  { key: 'desktop', label: 'Desktop', width: 1920, isMobile: false },
  { key: 'laptop',  label: 'Laptop',  width: 1440, isMobile: false },
  { key: 'tablet',  label: 'Tablet',  width: 768,  isMobile: false },
  { key: 'mobile',  label: 'Mobile',  width: 360,  isMobile: true  },
]
export const DEFAULT_BREAKPOINT = 'tablet'

export const getBreakpoint       = (key) => BREAKPOINTS.find((b) => b.key === key) || null
export const getBreakpointWidth  = (key) => { const bp = getBreakpoint(key); return bp ? bp.width : 0 }
export const isMobileBreakpoint  = (key) => { const bp = getBreakpoint(key); return !!(bp && bp.isMobile) }
```

User UI:
- Header `WkTabs` show 4 tabs với label
- Click → `uiStore.setStateField('breakpointActive', key)` → reactivity cascade

---

## 11. Layered defaults — đầy đủ data flow

```
Schema declare:
  meta.traits.general[0].attributes[0].default = { base: '20px 24px', mobile: '20px 15px' }
                                                  ↓
                                          (registerElement runs ONCE)
                                                  ↓
                            extractTraitDefaults walk → defaults map
                                                  ↓
                                      Store on reg[type].defaults
                                                  ↓
                                Wrap meta.factory → wrappedFactory

User drag element:
  buildBlankSection() → createNodeTree({ type:'flex-section' })
                            ↓
                    buildFromDef → factoryFor('flex-section')
                            ↓
                    Wrapped factory:
                      origFactory() → bare node
                      MERGE defaults.style/config/specials → node.data
                      MERGE defaults.responsive → node.data.responsive
                            ↓
                    Node enriched với defaults

Store insert → render:
  mergeNamespace(node, 'style', currentBp) → cascade base + responsive
                            ↓
                    Element template :style="mergedStyle"

Trait panel display:
  TraitField.value → raw từ mergeNamespace
  Nếu raw undefined → resolveDefaultForBp(schema.default, currentBp)
  Apply formatter (vd spacing collapse) → display

User edit field:
  TraitField onInput(v) → applyTrait → changeStyle (current bp default)
  → store.responsive[currentBp].style[key] = v
  → mergeNamespace re-compute → element + AssetInput sync
```

---

## 12. Glossary tóm tắt

| Term | Đầy đủ | Ý nghĩa |
|---|---|---|
| `bp` | breakpoint | 1 viewport: `{key, label, width, isMobile}` |
| `ns` | namespace | `'style' \| 'config' \| 'specials'` |
| `def` | element definition | `reg[type]` = `{ ...meta, factory, defaults, component }` |
| `meta` | element metadata | object raw export từ element file |
| `ctx` | context | binding pass qua ui store (`{field, nodeId}`) |
| `raw` | raw value | giá trị thô từ store/event (chưa format) |
| `merged` | merged value | sau cascade |
| `formatter` / `fmt` | display formatter | type-specific transform value cho UI |
| `factory` | node factory | function tạo Node mới (sau wrap thì seed defaults) |
| `seed` | seed defaults | inject schema default vào node lúc tạo |
| `cascade` | desktop-first cascade | merge base + per-bp slots theo width ≥ current |
| `applyTrait` | dispatcher | route value vào đúng changeStyle/Config/Specials |
| `isBreakpointMap` | shape check | object có key bp/reserved → responsive map |

---

## 13. Common pitfalls

### "Default không apply cho element có sẵn"
Defaults chỉ seed lúc factory chạy. Element tạo trước khi add default vào schema → không retroactive. Solution: drag element mới hoặc viết action migrate.

### "Object default bị split nhầm thành per-bp"
Trước fix `isBreakpointMap`: `default: { x:0, y:4 }` ghi vào `responsive.x...`. Sau fix: chỉ split khi có key match bp/reserved.

### "Dialog hiển thị 0 cho mọi cạnh"
Element được tạo qua `createNodeTree(literal)` (không qua `factoryFor`) → defaults không seed → `mergedStyle.padding === undefined` → `parseSides(undefined)` → `{0,0,0,0}`. Fix: `createNodeTree` giờ route qua `factoryFor`.

### "Input không trigger commit"
WkInput emit event không match `@change`. Solution: listen 4 variant `@input @change @update:value @update:modelValue`.

### "Loop sync giữa dialog ↔ store"
Dialog commit → store change → currentValue change → watch fire → sync inputs → bind value → user gõ tiếp → vòng. Fix: `_lastCommitted` field track giá trị vừa commit, skip resync khi match.
