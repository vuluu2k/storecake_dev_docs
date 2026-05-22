---
sidebar_position: 9
title: 08 — Glossary
---

# 08 — Glossary

Tham chiếu nhanh: variable abbreviations, function purposes, file mapping. Mỗi entry có ý nghĩa + nơi xuất hiện + ví dụ.

---

## New terms (post-refactor)

### `definitions.js` — **Trait definition data file**

File chứa `DEFINITIONS_DATA` — pure data map của reusable trait definitions. Mỗi definition có `writes` map (multi-target dispatch). Không import Vue.

**Nơi:** `src/components/editor_v2/components/trait/fields/definitions.js`

**Dùng để:** Reuse trait config across elements. Vd `width_select` definition dùng cho cả FlexBlock, Grid, etc. Thay vì định nghĩa lại trong mỗi element.

---

### `registry.js` (trong `trait/fields/`) — **Trait registry với Vue**

Attach Vue component field vào definitions data. Import `DEFINITIONS_DATA` từ `definitions.js`, gắn `.component` field, export `COMPONENT_DEFINITIONS`.

**Khác** `composable/editor_v2/registry.js` (element registry).

---

### `writes` — **Multi-target dispatch map**

Object trong definition: `{ key: { target, schema } }`. Khi 1 attribute thay đổi, có thể update nhiều node data keys cùng lúc.

```js
{ padding: { target: 'style', schema: {...} },
  isPaddingLinked: { target: 'specials', schema: {...} } }
```

→ 1 PaddingTrait emit `padding` + `isPaddingLinked`.

---

### `schema_helpers.js` — **JSON Schema builder utilities**

File chứa helpers như `cssLength`, `cssColor`, `responsive`, `enumOf`, etc. Build JSON Schema objects (Ajv-compatible).

---

### `ai.js` (element sidecar) — **AI-generation metadata**

Optional file `nodes/<name>/ai.js`. Lazy-loaded, contains: description, useWhen/avoidWhen, examples, semantics. Dùng khi building LLM tool schema (Phase 1 của AI gen).

---

### `buildElementSchema(meta)` — **Pure function**

Walk element `meta.traits` → resolve definitions → return JSON Schema object matching `{ type: 'object', properties: { style?, config?, specials? } }` shape. Output matches `createNodeTree` contract.

---

### `allowedKeys` — **Guard against typos**

Set tất cả valid keys từ traits của element. Store `_writeNamespace` action guard:
- Check incoming key có trong `allowedKeys`
- Nếu không → `console.warn('unknown key dropped')`
- Drop từ patch, write rest

Catch hallucination từ typo / AI misfire.

---

### `index.vue` (element convention) — **Component + factory home**

Element structure: `nodes/<name>/index.vue` chứa Vue component + factory function. Import `meta` từ `./meta.js`, spread + override với factory.

```js
import { meta as baseMeta } from './meta.js'
export const meta = { ...baseMeta, factory: (overrides) => ... }
```

---

### `meta.js` (element convention) — **Runtime metadata file**

Pure data file: type, label, traits, rules. NO Vue imports, NO `@/` aliases (tránh cycle). Được import bởi `index.vue` sau.

---

## Variable abbreviations

### `ns` — **n**ame**s**pace
Loại data trong node: `'style'`, `'config'`, hoặc `'specials'`. Quyết định nơi đọc/ghi.

```js
const ns = SEED_NS.includes(field.target) ? field.target : 'style'
// ns sẽ là 'style', 'config', hoặc 'specials'
```

Xuất hiện: `mergeNamespace`, `_writeNamespace`, `seedField`, `writeDefault`.

---

### `bp` — **b**reak**p**oint
1 viewport definition `{key, label, width, isMobile}` HOẶC chỉ là key string `'desktop'/'laptop'/'tablet'/'mobile'`.

```js
for (const bp of BREAKPOINTS) {        // bp = { key, label, width, isMobile }
  if (bp.width < curBpDef.width) continue
}

const bp = useUIStore().breakpointActive  // bp = 'tablet' (chỉ key string)
```

Phân biệt: full object vs key string xem qua context. Khi loop `BREAKPOINTS` là object; khi đọc `breakpointActive` là string.

Biến liên quan:
- `bpKey` = key string (`'mobile'`)
- `bpDef` = full breakpoint definition object
- `curBpDef` = current breakpoint definition
- `currentBpKey` = current breakpoint key string

---

### `def` — element **def**inition
`reg[type]` = object đã register = `{ ...meta, factory: wrapped, defaults, component }`.

```js
const def = getDef('flex-section')
// def = {
//   type: 'flex-section', label: 'Section', icon: ...,
//   isContainer: true, rules: {...},
//   factory: (overrides) => {...},       // wrapped factory (seed defaults)
//   defaults: { style:{...}, ... },       // extracted từ traits
//   component: FlexSectionV2,             // Vue SFC
//   traits: {...},                        // schema gốc
// }
```

Khác với `meta` (raw export từ file element). `def = meta + component + defaults + wrapped factory`.

---

### `meta` — element **meta**data
Object raw `export const meta = {...}` trong file element. Chưa qua registry.

```js
// nodes/HeadingV2.vue
export const meta = {
  type: 'heading',
  label: 'Heading',
  factory: (overrides) => createNode({...}),
  traits: {...},
}
```

Sau khi `registerElement(meta, component)` thì meta được biến thành `def` trong registry.

---

### `ctx` — **c**onte**x**t (trong dialog)
Binding info pass qua ui store khi user click TraitAssetInput.

```js
ctx = { field, nodeId }
// field = trait schema entry (vd { key:'padding', target:'style', type:'spacing', ... })
// nodeId = ID của node đang được edit (vd 'fs_abc12345')
```

Dialog đọc ctx để biết "tôi đang edit field gì của node nào".

---

### `raw` — **raw** (unprocessed) value
Giá trị thô trước khi formatter hoặc fallback.

```js
// Trong TraitField.value:
const raw = mergeNamespace(node, 'style', bp)[key]   // chưa format
// raw có thể là '20px 24px 20px 24px' (4-side expanded)

// Sau formatter:
const value = formatter(raw)                          // '20px 24px' (collapsed)
```

Cũng dùng cho event handler:
```js
handleChange(key, val) {
  const raw = val && val.target !== undefined ? val.target.value : val
  // raw = string giá trị input thô
  const n = Number(raw)
}
```

---

### `merged` — accumulator object trong cascade
Result của `mergeNamespace`. Bắt đầu bằng base, accumulate per-bp slots.

```js
let merged = { ...base }
for (const bp of BREAKPOINTS) {
  if (bp.width < curBpDef.width) continue
  if (slot) merged = { ...merged, ...slot[ns] }
}
return merged
```

---

### `out` — **out**put accumulator
Pattern phổ biến trong `extractTraitDefaults` và utility functions:

```js
const extractTraitDefaults = (traits) => {
  const out = { style: {}, config: {}, specials: {}, responsive: {} }
  // ... loop và fill out
  return out
}
```

`out` thường là object kết quả mà function đang build dần.

---

### `fmt` — **f**or**m**a**t**ter
Function transform value thành display string/object.

```js
const FORMATTERS_BY_TYPE = {
  spacing: (v) => formatSides(parseSides(v)),
}
const fmt = FORMATTERS_BY_TYPE[this.schema.type]
return fmt ? fmt(effective) : effective
```

---

### `s` — **s**ides (parsed)
Object `{top, right, bottom, left}` từ `parseSides`.

```js
const s = parseSides('20px 24px')
// s = { top: 20, right: 24, bottom: 20, left: 24 }
```

Cũng có thể là viết tắt cho `style` trong element template:

```js
sectionStyle() {
  const s = this.mergedStyle    // s = mergedStyle (đỡ phải gõ this.mergedStyle)
  return { padding: s.padding }
}
```

---

### `n` — **n**umber (sau Number())
Coercion result, có thể NaN.

```js
const n = Number(raw)
const next = Number.isFinite(n) ? n : 0
```

---

### `f` — **f**ield (trong loop)
Trait field schema entry — short form trong inner loops:

```js
for (const f of fields) seedField(out, f)
// f = { key, type, target, default, ... }
```

---

### `cur` / `curBpDef` — **cur**rent breakpoint
Đang hover/edit ở bp nào.

```js
const cur = BREAKPOINTS.find((b) => b.key === currentBpKey)
if (!cur) return result
```

---

### `_lastCommitted` — instance field, **không reactive**
Track giá trị vừa được commit để skip self-echo loop.

```js
data() { return { paddings: {...} } }   // không khai _lastCommitted ở đây
// → assign trực tiếp this._lastCommitted = ... → plain instance field
methods: {
  commit() {
    const value = formatSides(this.paddings)
    this._lastCommitted = value           // non-reactive
    applyTrait(...)
  }
}
watch: {
  currentValue(val) {
    if (val === this._lastCommitted) return  // skip echo
    this.syncFromValue(val)
  }
}
```

Prefix `_` ở Vue convention = "internal, non-reactive".

---

## Key functions

### `mergeNamespace(node, ns, currentBpKey) → object`
**File**: `composable/editor_v2/mergeNode.js`

Merge base + per-bp slots cho 1 namespace, theo cascade desktop-first.

```js
mergeNamespace(node, 'style', 'mobile')
// → { color: '#333', padding: '20px 15px', ... }
```

Dùng ở:
- `mixins/nodeBase.mergedStyle`, `mergedConfig`
- `EdgeOverlays.mergedStyle`
- `TraitField.value`
- `PaddingDialog.currentValue`

---

### `isBreakpointMap(value) → boolean`
**File**: `composable/editor_v2/mergeNode.js`

Check object có phải responsive map (có key `base`/`_`/bp name) hay không.

```js
isBreakpointMap({ base: '20px', mobile: '15px' })   // true
isBreakpointMap({ x: 0, y: 4 })                     // false (complex value)
isBreakpointMap('20px')                              // false (primitive)
```

Dùng ở:
- `registry.seedField` — split per-bp hay ghi vào base
- `mergeNode.resolveDefaultForBp` — cascade hay return as-is

---

### `resolveDefaultForBp(def, currentBpKey) → value`
**File**: `composable/editor_v2/mergeNode.js`

Resolve schema default value cho bp hiện tại, dùng cascade logic giống mergeNamespace.

```js
resolveDefaultForBp({ base: '20px 24px', mobile: '20px 15px' }, 'mobile')
// → '20px 15px'

resolveDefaultForBp({ base: '20px 24px', mobile: '20px 15px' }, 'tablet')
// → '20px 24px' (cascade từ base)

resolveDefaultForBp('20px', 'mobile')                  // → '20px' (primitive)
resolveDefaultForBp({ x:0, y:4 }, 'mobile')           // → { x:0, y:4 } (complex)
```

Dùng ở: `TraitField.value` (display fallback).

---

### `applyTrait(nodeId, field, value, opts?)`
**File**: `stores/editor_v2/node.js` (action)

Generic dispatcher — route value vào đúng `changeStyle` / `changeConfig` / `changeSpecials` theo `field.target`.

```js
nodeStore.applyTrait('fs_xxx', paddingField, '20px 24px')
// → changeStyle('fs_xxx', { padding: '20px 24px' })

nodeStore.applyTrait('h_yyy', textField, 'Hello')
// → changeSpecials('h_yyy', { text: 'Hello' })

nodeStore.applyTrait('fs_xxx', paddingField, '0', { breakpoint: 'base' })
// → changeStyle('fs_xxx', { padding: '0' }, { breakpoint: 'base' })
```

Dùng ở: dialogs (PaddingDialog), trait panel custom widgets.

---

### `changeStyle(id, patch, opts?)` / `changeConfig` / `changeSpecials`
**File**: `stores/editor_v2/node.js` (action)

Per-namespace writer.

| Action | Default target | Hỗ trợ per-bp? |
|---|---|---|
| `changeStyle` | current bp (`responsive[bp].style`) | Yes |
| `changeConfig` | base (`data.config`) | Yes (opt-in qua `{breakpoint:'current'}`) |
| `changeSpecials` | base (`data.specials`) | No (luôn base) |

`opts.breakpoint`:
- `'current'` (default cho style) → current bp slot
- `'base'` (default cho config) → base slot
- `'mobile'` / `'tablet'` / etc. → explicit slot
- omit → dùng default của action

Patch key với `value === undefined` → REMOVE key khỏi target slot.

---

### `getFieldComponent(field) → Vue component | null`
**File**: `components/editor_v2/components/trait/fields/registry.js`

2-layer resolve:
1. `field.component` (string) → `FIELD_COMPONENTS[name]`
2. `field.type` → `COMPONENT_BY_TYPE[type]`

---

### `getFieldIcon(field) → Vue component | null`
**File**: như trên

Resolve icon cho slot `#icon` của TraitAssetInput.
1. `field.icon` (string) → `ICON_COMPONENTS[name]`
2. `field.props.dialogType` → `DIALOG_ICON_BY_TYPE[dialogType]` → `ICON_COMPONENTS`

---

### `getDef(type) → def | null`
**File**: `composable/editor_v2/registry.js`

Lookup element definition theo type string.

```js
const def = getDef('flex-section')
// def.component, def.factory, def.label, def.defaults, def.traits, ...
```

---

### `factoryFor(type, overrides) → Node | null`
**File**: như trên

Create node mới qua wrapped factory (đã seed defaults).

```js
const node = factoryFor('heading', { style: { color: 'red' } })
// node.data.style = { color: 'red', /* + defaults */ }
```

---

### `getDefaultsFor(type) → { style, config, specials, responsive } | null`
**File**: như trên

Expose defaults map cho trait panel "Reset to default" UI sau này.

```js
const defaults = getDefaultsFor('flex-section')
nodeStore.applyTrait(id, paddingField, defaults.style.padding)
```

---

### `parseSides(value) → { top, right, bottom, left }`
**File**: `composable/editor_v2/cssShorthand.js`

Parse CSS shorthand thành 4 numeric sides (px).

```js
parseSides('20px 24px')         // { top:20, right:24, bottom:20, left:24 }
parseSides('10px 20px 30px')    // { top:10, right:20, bottom:30, left:20 }
parseSides('5px')               // { top:5, right:5, bottom:5, left:5 }
parseSides(null)                // { top:0, right:0, bottom:0, left:0 }
```

---

### `formatSides({top, right, bottom, left}) → string`
**File**: như trên

Compose 4 sides thành CSS shorthand ngắn nhất.

```js
formatSides({top:20, right:20, bottom:20, left:20})    // '20px'
formatSides({top:20, right:24, bottom:20, left:24})    // '20px 24px'
formatSides({top:10, right:20, bottom:30, left:20})    // '10px 20px 30px'
formatSides({top:10, right:20, bottom:30, left:40})    // '10px 20px 30px 40px'
```

---

### `isBreakpointMap(value) → boolean`
Đã giải thích ở trên.

---

### `getBreakpoint(key)`, `getBreakpointWidth(key)`, `isMobileBreakpoint(key)`
**File**: `composable/editor_v2/constants.js`

Helpers tra cứu breakpoint metadata.

```js
getBreakpoint('mobile')            // { key:'mobile', label:'Mobile', width:360, isMobile:true }
getBreakpointWidth('tablet')       // 768
isMobileBreakpoint('mobile')       // true
isMobileBreakpoint('tablet')       // false
```

---

### `resolveBreakpointSlot(target, currentBp) → bpKey | null`
**File**: `composable/editor_v2/createNode.js`

Convert sentinel/key thành slot key cho `_writeNamespace`.

```js
resolveBreakpointSlot('current', 'tablet')   // 'tablet'
resolveBreakpointSlot('base', 'tablet')      // null  (→ base slot)
resolveBreakpointSlot('mobile', 'tablet')    // 'mobile'  (explicit)
resolveBreakpointSlot(null, ...)             // null
```

---

## File mapping cheat sheet

| Folder | File | Trách nhiệm | Khi nào sửa |
|---|---|---|---|
| `composable/editor_v2/` | `constants.js` | BREAKPOINTS, ROOT_NODE | Thêm bp mới, đổi default |
| | `createNode.js` | createNode, createNodeTree, wrapTree, resolveBreakpointSlot | Hiếm — chỉ shape Node thay đổi |
| | `mergeNode.js` | mergeNamespace, isBreakpointMap, resolveDefaultForBp | Hiếm — cascade logic |
| | `registry.js` | registerElement, getDef, factoryFor, defaults extraction | Khi thêm field schema property mới |
| | `registerElements.js` | Eager glob nodes/*.vue | Không sửa |
| | `nodeFactory.js` | Composite tree builders | Thêm composite shortcut |
| | `Positioner.js` | Drop indicator engine | Drag-drop logic |
| | `cssShorthand.js` | parseSides, formatSides | Hiếm |
| | `mixins/nodeBase.js` | props, isSelected, mergedStyle/Config/Specials | Thêm mixin computed chung |
| | `mixins/nodeContainer.js` | + isEmpty, isDropTarget, onDragOver | |
| | `mixins/draggableNode.js` | onMoveDragStart, onMoveDragEnd | |
| `stores/editor_v2/` | `node.js` | Tree state + actions (add/move/remove/duplicate/changeX/applyTrait) | Thêm action store |
| | `dnd.js` | Drag session + Positioner lifecycle | |
| | `editor.js` | UI state (breakpoint, sidebar, dialogs) | |
| `components/editor_v2/nodes/` | `XxxV2.vue` | Element SFC + meta export | Thêm element |
| `components/editor_v2/elements/` | `NodeRenderer.vue` | Switcher đọc registry | Hiếm |
| | `EdgeOverlays.vue` | Padding/margin SVG overlay | Hover UX |
| | `ElementToolbar.vue` | Floating toolbar | |
| | `ElementDragV2.vue` | Sidebar drag wrapper | |
| | `IndicatorOverlay.vue` | Drop indicator UI | |
| `components/editor_v2/components/trait/` | `fields/registry.js` | FIELD_COMPONENTS, COMPONENT_BY_TYPE | Thêm field widget type |
| | `components/TraitField.vue` | Generic field renderer | Hiếm |
| | `components/TraitWrapper.vue` | Group label wrapper | |
| | `components/TraitItemWrapper.vue` | Field label wrapper | |
| | `components/TraitAssetInput.vue` | Dialog trigger | |
| `components/editor_v2/components/dialog/` | `PaddingDialog.vue` | 4-input padding editor | Tham khảo cho dialog mới |
| `components/editor_v2/` | `Trait.vue` | Trait panel container | Layout tab/sidebar |
| | `Header.vue` | Top bar với bp tabs | |
| | `PageWrapper.vue` | Editor entry + canvas | |
| | `SettingDialogs.vue` | Mount tất cả dialog components | Thêm dialog mới |

---

## Naming conventions

| Pattern | Ví dụ | Ý nghĩa |
|---|---|---|
| `useXxxStore()` | `useNodeStore()` | Pinia store factory |
| `XxxV2.vue` | `HeadingV2.vue` | Element SFC (suffix V2 phân biệt với v1) |
| `WkXxx` | `WkInput`, `WkSelect` | webcake-ui-kit components |
| `wk-xxx` | `wk-flex-block` | CSS class prefix |
| `wk-xxx--state` | `wk-flex-block--drop-active` | BEM modifier |
| `wk-xxx__part` | `wk-node-placeholder__text` | BEM element |
| `data-node-id` | `:data-node-id="nodeId"` | DOM data attr cho Positioner query |
| `data-node-type` | `data-node-type="flex-section"` | DOM data attr |
| `meta`, `def`, `field`, `attr` | – | Trait schema vocabulary |
| `ctx`, `_lastCommitted` | – | Internal/dialog state |

---

## Anti-patterns — DON'T

- ❌ `<element :is>` import trực tiếp element con — phá registry. Luôn qua `<NodeRenderer>`.
- ❌ Hardcoded type string trong logic (vd `if (type === 'flex-section')`). Dùng `getDef(type).rules.isRootOnly` hoặc tương tự.
- ❌ Mutate `node.data.style[key] = v` trực tiếp. Dùng `changeStyle` / `applyTrait`.
- ❌ Index assignment vào mảng reactive (`parent.data.nodes[0] = id`). Dùng `splice`/`push`/reassign.
- ❌ Import element SFC từ `registry.js`. Phá cycle rule.
- ❌ `data.props` (đã xoá). Dùng `style`/`config`/`specials`.
- ❌ Numeric breakpoint key (`responsive[1440]`). Dùng text key (`responsive.laptop`).
- ❌ Default cho field complex value mà có key trùng bp name. Wrap qua `{ base: {...} }`.
