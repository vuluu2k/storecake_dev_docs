# 08 — Glossary

Tham chiếu nhanh: variable abbreviations, function purposes, file mapping. Mỗi entry có ý nghĩa + nơi xuất hiện + ví dụ.

---

## A. Core concepts

### `Node` / `NodeTree`

`Node` = `{ id, data: { type, name, style, config, specials, events, bindings, states, parent, nodes, isCanvas, hidden, custom, responsive }, dom, events }`. `states` = override namespace (`states[state] = { style, config }`). `dom` markRaw, `events` (top-level) = runtime DOM-listener bag.

`NodeTree` = `{ rootNodeId, nodes }`. Output từ factory / `createNodeTree(def)` / `wrapInBlankSection`. Input cho `addNodeTree`.

### Element folder convention

`nodes/<snake_case>/{index.vue, meta.js, ai.js?}` — auto-register qua `import.meta.glob`. Type string `kebab-case`.

### `meta` vs `def`

- `meta` — raw export từ `meta.js` (pure data, Vue-free)
- `def` — registry record sau `registerElement(meta, component)`: `{ ...meta, factory: wrapped, defaults, allowedKeys, renderers, statefulKeys, component }`

```js
const def = getDef('flex-section')
// def.component (Vue SFC), def.factory (wrapped), def.allowedKeys (Set per ns), def.renderers (CSS array)
```

### `ai` (element sidecar)

Optional `nodes/<name>/ai.js`. Lazy-loaded chỉ bởi `composable/editor_v2/ai/schema.js`. Chứa `description`, `useWhen/avoidWhen`, `examples`, `semantics`, `expectedChildren?`, `layoutHints?`, `dataBindings?`.

### `state` / `variant`

`meta.states.variants[].value` — `'default' | 'hover' | 'active' | ...`. Active variant lưu trong `nodeStore.events.state`.

```js
useNodeStore().setState('hover')       // toggle UI variant
useNodeStore().changeStyle(id, { backgroundColor: '#0d6efd' }, { stateful: true })
// → divert vào data.states.hover.style.backgroundColor (namespace `states` riêng, KHÔNG vào config)
```

### `satellite`

Real node trong flat `nodes[]` map nhưng KHÔNG nằm trong `parent.data.nodes` (không xuất hiện Layers / không reorder riêng). Vd `tab` ↔ `tab-item`, `list` ↔ `list-item` shared skin.

Owner declares `meta.satellite = { type, configKey }`. `satelliteOwner` mixin auto-create child via `addDetachedNode` ở mounted.

### `locked`

`meta.rules.locked = true` → `remove` / `duplicate` / `onMoveDragStart` từ chối. Cascade theo owner. Vd ROOT, satellite, tab-item.

### `isContentEditable`

`meta.rules.isContentEditable = true` → `editableText` mixin bật dblclick → contenteditable. User edit text inline, blur commit qua `changeSpecials({text})`.

---

## B. Variable abbreviations

### `ns` — namespace
`'style' | 'config' | 'specials'`. Quyết định nơi đọc/ghi.

### `bp` — breakpoint
1 viewport `{ key, label, width, isMobile }` HOẶC chỉ key string `'desktop' | 'laptop' | 'tablet' | 'mobile'`.

```js
for (const bp of BREAKPOINTS) {        // bp = full object
  if (bp.width < curBpDef.width) continue
}
const bp = useUIStore().breakpointActive   // bp = key string
```

Phân biệt qua context. Biến liên quan: `bpKey`, `bpDef`, `curBpDef`, `currentBpKey`.

### `def` — element definition
Registry record (xem § A).

### `meta` — element metadata
Raw `meta.js` export (xem § A).

### `ctx` — context (trong dialog)
Binding info pass qua ui store khi user click TraitAssetInput.

```js
ctx = { field, nodeId }
// field = trait schema entry, nodeId = ID của node đang được edit
```

### `raw` — unprocessed value
Giá trị thô trước formatter / fallback.

```js
const raw = mergeNamespace(node, 'style', bp)[key]   // '20px 24px 20px 24px' (expanded)
const value = formatter(raw)                          // '20px 24px' (collapsed)
```

### `merged` — accumulator object trong cascade
Result của `mergeNamespace`.

### `out` — output accumulator
Pattern phổ biến trong utility functions.

### `fmt` — formatter
Function transform value thành display.

### `s` — sides parsed, hoặc viết tắt `style`

```js
const s = parseSides('20px 24px')   // { top:20, right:24, bottom:20, left:24 }

sectionStyle() {
  const s = this.mergedStyle        // s = style đỡ phải gõ this.mergedStyle
  return { padding: s.padding }
}
```

### `n` — number (sau `Number()`)
Coercion result, có thể NaN.

### `f` — field (trong loop)
Trait field schema entry.

### `cur` / `curBpDef` — current breakpoint

### `_lastCommitted` — instance field, **không reactive**
Track giá trị vừa commit để skip self-echo loop trong widget watch.

### `rec` — PatchRecorder instance
Dùng trong `_commit(label, mutateFn)` — `mutateFn(rec, state)` mutate state qua `rec.set/insert/remove`.

### `fwd` / `inv` — forward / inverse patches
Mảng patch op apply để redo / undo.

---

## C. Key functions

### `mergeNamespace(node, ns, currentBpKey) → object`
**File**: `composable/editor_v2/mergeNode.js`

Merge base + per-bp slots cho 1 namespace, cascade desktop-first 2-phase (down → up fallback). Skip key trong `NON_CASCADING`.

### `mergeStateNs / mergeStateMap / mergeStateNode`
**File**: `composable/editor_v2/mergeNode.js`

3 reader cho namespace `states` (`data.states[state] = { style, config }` + `responsive[bp].states[state]`):
- `mergeStateNs(node, state, ns, bp)` — cascade 1 ns của 1 state qua bp (1 level sâu hơn `mergeNamespace`).
- `mergeStateMap(node, state, bp)` — flat union style+config tại bp. Dùng bởi `statefulNode.stateCss`.
- `mergeStateNode(node, state)` — pure fold override vào style/config (base + per-bp). Dùng bởi `TraitField.renderNode`.

### `getStyle(node, key, fallback?)` / `getConfig(node, key, fallback?)`
**File**: `composable/editor_v2/get.js`

Đọc 1 key tại active breakpoint từ UI store, fallback nếu undefined.

### `changeStyle(id, patch, opts?)` / `changeConfig` / `changeSpecials`
**File**: `stores/editor_v2/node.js`

| Action | Default target | Hỗ trợ per-bp? | Stateful? |
|---|---|---|---|
| `changeStyle` | per-key qua `defaultStyleSlot` (STYLE_ASYNC) | Yes | Yes |
| `changeConfig` | per-key qua `defaultConfigSlot` (CONFIG_ASYNC) | Yes | Yes |
| `changeSpecials` | base (luôn) | No | No |

`opts.breakpoint`: `'current'` / `'base'` / `'mobile'` / explicit slot key. `opts.stateful: true` → `_routeState` divert stateful writeKey vào `states[state][ns]` (per-bp).

Patch key với `value === undefined` → REMOVE key khỏi target slot.

### `setSelected(id)` / `setState(value)` / `setIndicator(...)`
**File**: `stores/editor_v2/node.js`

Selection / variant / drag indicator setters. KHÔNG qua `_commit` (UI state, không cần history).

### `addNodeTree(tree, parentId, index)` / `move(...)` / `reorderChildren(...)` / `ungroup(...)` / `remove(...)` / `duplicate(...)`
**File**: `stores/editor_v2/node.js`

Tree mutations — đều qua `_commit` → có history entry.

### `getDef(type) → def | null`
**File**: `composable/editor_v2/registry.js`

Lookup element definition.

### `factoryFor(type, overrides) → Node | null`
Create node qua wrapped factory.

### `getDefaultsFor(type) → { style, config, specials, states, responsive } | null`
Expose defaults map cho "Reset to default" UI.

### `getAllowedKeys(type, ns) → Set | null`
Whitelist writeKey cho guard.

### `isRootOnlyType(type)`, `isLockedType(type)`, `canDropInto(srcType, parentType)`
**File**: `composable/editor_v2/registry.js`

Drop / lock rule helpers.

### `listSidebar() → def[]`
Filter `showInSidebar` cho sidebar pickers.

### `parseSides(value) → { top, right, bottom, left }`
**File**: `composable/editor_v2/cssShorthand.js`

```js
parseSides('20px 24px')         // { top:20, right:24, bottom:20, left:24 }
parseSides('10px 20px 30px')    // { top:10, right:20, bottom:30, left:20 }
```

### `formatSides({top, right, bottom, left}) → string`
Compose 4 sides thành CSS shorthand ngắn nhất.

```js
formatSides({top:20, right:20, bottom:20, left:20})    // '20px'
formatSides({top:20, right:24, bottom:20, left:24})    // '20px 24px'
```

### `getBreakpoint(key)`, `getBreakpointWidth(key)`, `isMobileBreakpoint(key)`
**File**: `composable/editor_v2/constants.js`

### `resolveBreakpointSlot(target, currentBp) → bpKey | null`
**File**: `composable/editor_v2/createNode.js`

Convert sentinel/key thành slot key.

```js
resolveBreakpointSlot('current', 'tablet')   // 'tablet'
resolveBreakpointSlot('base', 'tablet')      // null  (→ base slot)
resolveBreakpointSlot('mobile', 'tablet')    // 'mobile'  (explicit)
```

### `defaultStyleSlot(key)` / `defaultConfigSlot(key) → 'current' | 'base'`
**File**: `composable/editor_v2/responsivePolicy.js`

Per-key sentinel cho default slot — đọc `STYLE_ASYNC` / `CONFIG_ASYNC` set.

### `createNode(props)` / `createNodeTree(def)` / `wrapInBlankSection(tree)` / `buildFromDef(def)` / `genId(type)`
**File**: `composable/editor_v2/createNode.js`

Node + tree builders.

### `buildElementSchema(meta) → JSON Schema`
**File**: `components/editor_v2/components/trait/fields/definitions.js`

Walk traits → mirror per-bp + state-overrides → JSON Schema.

### `buildSatelliteSchema(satMeta)`
Slim schema cho satellite (no events/state).

### `collectStatefulWriteKeys(meta) → Set`
WriteKey eligible per-state — gom từ group có `stateful: true` (qua `buildStateOverrideSchema`). Lưu `def.statefulKeys`.

### `applyStateSchema(schema, meta)`
Augment schema với state-overrides cho mỗi variant.

### `validateEvents(events, ns, defConstraint, opts)`
**File**: `components/editor_v2/components/trait/fields/eventDefinitions.js`

Structural validate mảng events.

### `dumpRegistryForLLM(opts) → { type → { schema, ai, ... } }`
**File**: `composable/editor_v2/ai/schema.js`

Walk registry + lazy-load `ai.js` → map cho LLM tool input.

### `validateDef(def, depth?, parentType?) → string[]`
**File**: `composable/editor_v2/ai/validate.js`

Validate 1 def shape + type tồn tại + isRootOnly placement + writeKey hợp lệ. Empty = valid.

### `commitAISectionToCanvas(def, opts)` / `commitAISectionsToCanvas(sections, opts)`
**File**: `composable/editor_v2/ai/commit.js`

Apply AI output: validate → `createNodeTree(def)` → `addNodeTree(tree, parentId, index)`.

### `commitAISite(siteDef, opts)`
**File**: `composable/editor_v2/ai/commitSite.js`

Multi-page commit qua pageApi (headless, không đụng node store).

### `buildPagePayload(sections) → payload`
**File**: `composable/editor_v2/ai/buildPage.js`

Headless build payload đúng shape `serialize()` để POST trực tiếp.

---

## D. File mapping cheat sheet

| Folder | File | Trách nhiệm | Khi nào sửa |
|---|---|---|---|
| `composable/editor_v2/` | `constants.js` | BREAKPOINTS, ROOT_NODE, DEFAULT_BREAKPOINT, PLACEHOLDER_IMAGE | Thêm bp mới |
| | `createNode.js` | createNode/createNodeTree/wrapTree/genId/buildFromDef | Hiếm — chỉ Node shape thay đổi |
| | `mergeNode.js` | mergeNamespace, mergeStateNs, mergeStateMap, mergeStateNode, NON_CASCADING | Cascade logic |
| | `responsivePolicy.js` | STYLE_ASYNC / CONFIG_ASYNC sets | Đổi default slot per-key |
| | `get.js` | getStyle / getConfig helpers | Hiếm |
| | `registry.js` | registerElement, getDef, factoryFor, listSidebar, isRootOnlyType, isLockedType, canDropInto, getAllowedKeys, getDefaultsFor | Khi thêm field schema property mới |
| | `registerElements.js` | Eager glob nodes/*/index.vue | Không sửa |
| | `nodeFactory.js` | Composite builders (buildBlankSection, wrapInBlankSection, buildRowSection) | Thêm composite shortcut |
| | `templateRegistry.js` | listTemplates, getTemplate, buildTemplate | Hiếm |
| | `templates/<id>.js` | Page template data | Thêm template mới |
| | `Positioner.js` | Drop indicator engine | Drag-drop logic |
| | `cssShorthand.js` | parseSides, formatSides | Hiếm |
| | `patchRecorder.js` | PatchRecorder + compactPatches + applyPatches | Hiếm — primitive history |
| | `mixins/nodeBase.js` | props, isSelected, mergedStyle/Config/Specials, commonStyleData | Thêm mixin computed chung |
| | `mixins/nodeContainer.js` | + isEmpty, isDropTarget, onDragOver | |
| | `mixins/draggableNode.js` | onMoveDragStart, onMoveDragEnd | |
| | `mixins/editableText.js` | contenteditable opt-in via rule | |
| | `mixins/statefulNode.js` | stateCss injection | |
| | `mixins/satelliteOwner.js` | ensureSatellite lazy create | |
| | `ai/schema.js` | dumpRegistryForLLM | AI pipeline |
| | `ai/validate.js` | validateDef / validatePage / validateSite | |
| | `ai/commit.js` | commitAISectionToCanvas (single canvas) | |
| | `ai/commitSite.js` | commitAISite (multi-page persist) | |
| | `ai/buildPage.js` | buildPagePayload (headless) | |
| | `ai/aiChat.js` | createAiChatSession (UI state machine) | |
| | `ai/aiSiteApi.js` | REST HTTP transport | |
| | `ai/aiSiteChannel.js` | Phoenix WS transport | |
| | `ai/aiSiteStream.js` | Runner orchestrator | |
| | `ai/mockStream.js` | Local mock transport (dev/test) | |
| | `ai/protocol.js` | AI_SITE_TOPIC / AI_EVENTS / AI_COMMANDS / AI_ROUTES | |
| | `ai/selftest.js` | runAiGenSelfTest smoke test | |
| | `ai/BACKEND_PLAN.md` | Spec BE partner | |
| `stores/editor_v2/` | `node.js` | Tree state + actions + _commit chokepoint | Thêm action |
| | `dnd.js` | Drag session + Positioner lifecycle | |
| | `editor.js` | UI store (`useUIStore`, alias `'ui'`) | |
| | `history.js` | Timeline + undo/redo + coalesce | |
| | `page.js` | useEditorPageStore — load/save/switch page | |
| | `pageList.js` | usePageListStore — site pages CRUD | |
| | `globalStyling.js` | useGlobalStylingStore — site-wide tokens | |
| `components/editor_v2/` | `PageWrapper.vue` | Editor entry + canvas | |
| | `Header.vue` | Top bar (bp tabs, undo/redo, AI button) | |
| | `Sidebar.vue` | Left sidebar shell | |
| | `Toolbar.vue` | Right context toolbar | |
| | `Trait.vue` | Right trait panel container | |
| `components/editor_v2/nodes/` | `<name>/index.vue` | Element SFC + factory + icon | Thêm element |
| | `<name>/meta.js` | Pure data (type, traits, rules, defaults) | |
| | `<name>/ai.js` | AI hints (optional sidecar) | |
| `components/editor_v2/elements/` | `NodeRenderer.vue` | Switcher đọc registry | Hiếm |
| | `EdgeOverlays.vue` | Padding/margin SVG overlay | |
| | `ElementToolbar.vue` | Floating toolbar | |
| | `ElementDragV2.vue` | Sidebar drag wrapper | |
| | `IndicatorOverlay.vue` | Drop indicator | |
| | `NodePlaceholder.vue` | Empty container placeholder | |
| `components/editor_v2/components/` | `PageEmpty.vue` | Canvas-trống placeholder | |
| | `SettingDialog.vue` | Popover hub | |
| | `color_picker/` | Color picker stack | |
| | `sidebar/SidebarLayer.vue` | Layers tree (đọc registry) | |
| | `sidebar/LayerItem.vue` | 1 layer row | |
| | `sidebar/LayerGroupWrapper.vue` | Header/Footer/Body group | |
| | `sidebar/Elements*Picker.vue` | 10 picker per category | |
| `components/editor_v2/components/trait/` | `ClassTrait.vue` | Custom class field | |
| | `components/TraitField.vue` | Generic field dispatcher | |
| | `components/TraitWrapper.vue` | Group label wrapper | |
| | `components/TraitItemWrapper.vue` | Field label wrapper | |
| | `components/TraitAssetInput.vue` | Asset dialog trigger | |
| | `components/MediaUploader.vue` | File upload widget | |
| | `components/fields/*.vue` | 37 trait widget | Thêm widget mới |
| | `components/fields/events/*.vue` | UrlEvent/PageEvent/PopupEvent payload editors | |
| | `fields/definitions.js` | Re-export DEFINITIONS_DATA + builders | Schema builder API |
| | `fields/defs/*.js` | DEFINITIONS_DATA chia domain | Thêm trait def |
| | `fields/styleRenderers.js` | (node) → CSS map | Thêm CSS composition |
| | `fields/registry.js` | VUE_COMPONENTS map | Bind def → Vue |
| | `fields/schema_helpers.js` | JSON Schema builders | Thêm builder type |
| | `fields/enum.js` | TARGET / TRAIT / TRIGGER / ACTION constants | |
| | `fields/eventDefinitions.js` | EVENT_DEFINITIONS_DATA + validateEvents | Append action |
| | `fields/events/engine.js` | createEventApi | |
| | `fields/events/actions/*.js` | goToUrl / openPage / openPopup | Thêm action mới |
| `assets/editor_v2/` | `node.css` | Global CSS | |

---

## E. Naming conventions

| Pattern | Ví dụ | Ý nghĩa |
|---|---|---|
| `useXxxStore()` | `useNodeStore()` | Pinia store factory |
| Folder `snake_case` | `flex_block/`, `image_comparison/` | Element folder |
| Type `kebab-case` | `'flex-block'`, `'image-comparison'` | meta.type string |
| Trait def `snake_case` | `'width_select'`, `'bg_image'` | DEFINITIONS_DATA key |
| writeKey camelCase / CSS-style | `padding`, `--node-width`, `htmlTag` | Key thực ghi vào node |
| `WkXxx` | `WkInput`, `WkSelect` | webcake-ui-kit components |
| `wk-xxx` | `wk-flex-block` | CSS class prefix |
| `wk-xxx--state` | `wk-flex-block--drop-active` | BEM modifier |
| `wk-xxx__part` | `wk-node-placeholder__text` | BEM element |
| `data-node-id` | `:data-node-id="nodeId"` | DOM data attr cho Positioner |
| `data-node-type` | `data-node-type="flex-section"` | DOM data attr |
| `meta`, `def`, `field`, `attr` | – | Trait schema vocabulary |
| `_<name>` prefix | `_commit`, `_writeNs`, `_routeState`, `_lastCommitted` | Internal/non-reactive |

---

## F. Stores quick-ref

| Store | ID | Hot path | State chính |
|---|---|---|---|
| `useNodeStore` | `editor_v2_node` | YES | `nodes`, `events.{selected,hovered,dragged,indicator,state}` |
| `useDndStore` | `editor_v2_dnd` | YES | `dragTarget`, `draggedElementShadow`, `positioner` |
| `useUIStore` | `ui` | YES | `breakpointActive`, `leftSidebarKeyActive`, `settingDialogs[]` |
| `useHistoryStore` | `editor_v2_history` | YES | `timeline`, `pointer`, `_coalesce` |
| `useEditorPageStore` | `editor_v2_page` | NO | `pageId`, `loading`, `dirty`, `lastSavedAt` |
| `usePageListStore` | `editor_v2_page_list` | NO | `siteId`, `pages[]` |
| `useGlobalStylingStore` | `editor_v2_global_styling` | NO | `presets` (site-wide tokens) |

---

## G. Anti-patterns — DON'T

- ❌ `<element :is>` import trực tiếp element con — phá registry. Luôn qua `<NodeRenderer>`.
- ❌ Hardcoded type string trong logic (vd `if (type === 'flex-section')`). Dùng `getDef(type).rules.isRootOnly` hoặc tương tự.
- ❌ Mutate `node.data.style[key] = v` trực tiếp. Dùng `changeStyle / applyTrait`.
- ❌ Index assignment vào mảng reactive (`parent.data.nodes[0] = id`). Dùng `rec.insert/remove` qua `_commit`.
- ❌ Import element SFC từ `registry.js`. Phá cycle rule.
- ❌ `data.props` (đã xoá). Dùng `style/config/specials/events/bindings`.
- ❌ Numeric breakpoint key (`responsive[1440]`). Dùng text key (`responsive.laptop`).
- ❌ `meta.js` import `@/` alias. Phải relative (CI/build script `node` thuần dùng).
- ❌ Trait default complex value mà có key trùng bp name. Wrap qua `{ base: {...} }`.
- ❌ Đặt component path import trong `meta.js`. Vue-free.
- ❌ Skip `_commit` để mutate state. Phá undo/redo.
- ❌ Static `import('@/components/editor_v2/ai/schema')` vào runtime bundle. AI gen chỉ lazy-load.
- ❌ Skip `validateDef` trước commit AI output. Hallucinate type/keys silent corrupt state.
- ❌ Stateful write KHÔNG truyền `opts.stateful: true`. State map không được route.
