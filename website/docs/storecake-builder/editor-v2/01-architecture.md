---
sidebar_position: 2
title: 01 — Architecture
---

# 01 — Architecture

Kiến trúc tổng thể, data model, 7 Pinia store, registry pattern, 6 mixin layering, cách tránh import cycle.

## 1. Bức tranh lớn

```
┌────────────────────────────────────────────────────────────────┐
│  PageWrapper.vue  (editor entry)                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  .wk-editor-canvas (scroll container)                    │  │
│  │    ┌────────────────────────────────────────────────┐    │  │
│  │    │  .wk-editor-body (responsive width per bp)     │    │  │
│  │    │    <NodeRenderer node-id="ROOT" />             │    │  │
│  │    │      ↓ getDef('root').component                │    │  │
│  │    │      <RootCanvas v-for child />                │    │  │
│  │    │        <FlexSection v-for child />             │    │  │
│  │    │          <FlexBlock ... > <Heading ... />      │    │  │
│  │    └────────────────────────────────────────────────┘    │  │
│  └──────────────────────────────────────────────────────────┘  │
│  Teleport to body:                                             │
│    <IndicatorOverlay />     ← vạch xanh khi đang drag          │
│    <EdgeOverlays />         ← padding/margin SVG strips        │
│    <ElementToolbar />       ← floating toolbar trên selected   │
│    <SettingDialog />        ← popover hub (color picker, …)    │
└────────────────────────────────────────────────────────────────┘
       ↑          ↑         ↑         ↑          ↑          ↑
   NodeStore  DndStore  UIStore  HistoryStore PageStore PageList
                                                           Store
                                                  + GlobalStylingStore
```

7 Pinia store song song; node/dnd/ui/history là 4 store hot path; page/pageList/globalStyling phục vụ multi-page persistence.

## 2. Data model

### Node shape

Mỗi node là một object trong `nodeStore.nodes` map:

```js
{
  id: 'flex-block-abc12345',          // genId(type) = `${type}-${randomString(8)}`
  data: {
    type: 'flex-block',               // key tra registry → component + meta
    name: 'Block',                    // hiển thị Layers (mặc định = meta.label)
    parent: 'ROOT' | 'fs_xxx' | null, // null chỉ với ROOT seed
    nodes: ['fb_yyy', 'fb_zzz'],      // children IDs (thứ tự render)
    isCanvas: true,                   // có chấp nhận drop con không
    hidden: false,                    // ẩn render
    custom: {},                       // free-form per-element data

    // ─── 5 NAMESPACE ─────────────────────────────────────────
    style:    { padding: '32px 0px', '--node-width': 'fill' },  // CSS responsive
    config:   { contentWidth: 'fill_container' },               // data per-bp opt-in
    specials: { htmlTag: 'h2' },                                // base-only metadata
    events:   [{ id, name, action, target, payload? }],         // base-only behaviors
    bindings: [{ id, source, field, target, transform? }],      // base-only data refs

    responsive: {                     // per-breakpoint overrides (text key)
      desktop: { style: { '--layout-direction': 'horizontal' }, config: {} },
      mobile:  { style: { '--layout-direction': 'vertical'   }, config: {} },
    },
  },
  dom: HTMLElement | null,            // tham chiếu DOM thật (markRaw)
  events: {},                         // runtime DOM-listener bag (Positioner/DnD)
}
```

**Merged values** (cái element thực sự render — desktop-first cascade qua `mergeNamespace`):
```js
mergedStyle    = base.style    ⊕ responsive[desktop].style ⊕ ... ⊕ responsive[currentBp].style
mergedConfig   = base.config   ⊕ ... (cùng cascade)
mergedSpecials = base.specials                              // KHÔNG cascade
```

`specials` / `events` / `bindings` đều base-only. `style` / `config` cascade.
Non-cascading key: `config.hidden` (xem `mergeNode.js` `NON_CASCADING`).

Chi tiết shape + cascade algorithm xem [`07-traits-and-data.md`](./07-traits-and-data.md) sections 1-3.

### ROOT seed

```js
{
  id: 'ROOT',
  data: { type: 'root', nodes: [], isCanvas: true, hidden: false, custom: {}, responsive: {}, parent: null, ... },
}
```

`ROOT` là parent của mọi FlexSection. Không xoá / drag được. Locked thông qua `root_canvas/meta.js`: `rules: { hideInLayer: true, locked: true, edgeOverlay: { padding: false } }`.

### NodeTree shape

Khi factory hoặc `createNodeTree(def)` tạo nội dung mới (chưa vào store), kết quả là **NodeTree** chứ không phải dict:

```js
{
  rootNodeId: 'fb_xxx',
  nodes: {
    'fb_xxx': { id, data, dom, events },
    'fb_yyy': { ... },
  },
}
```

Tree được `addNodeTree(tree, parentId, index)` merge vào store và re-parent gốc.

## 3. Bảy stores (Pinia Options API)

### `useNodeStore` (`src/stores/editor_v2/node.js`)

**State:**
- `nodes: { [id]: Node }` — flat map toàn bộ cây (kể cả satellites)
- `events: { selected: [], hovered: null, dragged: [], indicator: null, state: null }`

`events.state` = active variant cho selected node (`'default'|'hover'|'active'|null`).

**Chokepoint:** `_commit(label, mutateFn, opts)` wrap mọi mutation trong `$patch` + `PatchRecorder` + record vào history. Xem [`10-history.md`](./10-history.md).

**Action chính:**

| Action | Mô tả |
|---|---|
| `addNodeTree(tree, parentId, index)` | Merge tree, auto-wrap non-section vào `flex-section` khi parent=ROOT |
| `addNode(node, parentId, index)` | Add 1 node đã shaped sẵn (set parent + seed responsive slot) |
| `addDetachedNode(node, parentId)` | Register satellite (không vào parent.data.nodes — no Layers/reorder) |
| `move(nodeId, newParentId, newIndex)` | Re-parent, cycle-guard, root-only check, auto-wrap |
| `reorderChildren(parentId, orderedIds)` | Permutation reorder cùng parent (1 history entry) |
| `ungroup(nodeId)` | Dissolve container — lift children lên parent slot (refuse ROOT/parentless/child-of-ROOT) |
| `remove(nodeId)` | Xoá node + descendants + satellites; refuse `rules.locked` |
| `duplicate(nodeId)` | Deep-clone subtree với id mới (incl. events/bindings new id), insert sibling kế |
| `setDOM(id, el)` | Ghi DOM ref (markRaw) — **KHÔNG** qua `_commit` |
| `setSelected(id)` | Set selection + reset `events.state` về `meta.states.base` |
| `setIndicator(indicator)` | Cập nhật indicator — **KHÔNG** qua `_commit` |
| `setState(value)` | Set active variant cho selected node (hover/active editing) |
| `changeStyle(id, patch, opts?)` | Ghi style — route per-key qua `defaultStyleSlot`; `opts.stateful=true` → `_routeState` divert stateful keys vào `config[state]` |
| `changeConfig(id, patch, opts?)` | Ghi config — route per-key qua `defaultConfigSlot` |
| `changeSpecials(id, patch, opts?)` | Ghi specials (base-only) |
| `resetStyle/Config/Specials(id, keys)` | Xoá key khỏi target slot (force throttle = 0) |
| `addEvent/updateEvent/removeEvent` | Append/merge/xoá entry trong `node.data.events` (validate qua `eventDefinitions.js`) |
| `addBinding/updateBinding/removeBinding` | Tương tự cho `node.data.bindings` |
| `serialize()` | Snapshot payload gửi BE (bỏ runtime `dom`/`events`) |
| `hydrate(payload)` | Replace toàn bộ state + clear history |

**Internal (`_` prefix):**

| Helper | Mô tả |
|---|---|
| `_commit(label, mutateFn, opts)` | Wrap mutation + record history; `opts: { silent, key, throttleMs }` |
| `_writeNs(id, ns, patch, slot, opts)` | Single-slot write (ép breakpoint cụ thể hoặc base) |
| `_writeByPolicy(id, ns, patch, slotForKey, bp, opts)` | Chia patch theo per-key responsive policy → multiple `_writeNs` |
| `_resetNs(method, id, keys)` | Build `{key: undefined}` patch + ép throttle = 0 |
| `_addEntry/_updateEntry/_removeEntry` | Generic array-namespace mutation cho events/bindings |
| `_activeState(id)` | Trả variant đang edit (`null` nếu base hoặc id không phải selected) |
| `_routeState(id, patch, opts)` | Khi `opts.stateful` + có active state: divert stateful writeKey → `config[state]` map; return non-stateful rest cho flat write |
| `_validateEventsWrite(id, nextEvents)` | Structural validation array events theo `getDef(type).events` |

**Getter:**
- `query` — mirror craft.js API: `query.node(id).get() / .getParent() / .isCanvas() / .isDroppable(...) / .ancestors() / .descendants() / .parentId()`. Positioner đọc qua đây.
- `getNodeById`, `getParentId`, `getParent` — sugar helpers.

### `useDndStore` (`src/stores/editor_v2/dnd.js`)

**State:**
- `dragTarget: null | { type: 'new', tree } | { type: 'existing', nodes: [id] }`
- `draggedElementShadow: { el }` — preview ghost DOM (markRaw)
- `positioner: Positioner instance` (markRaw)

**Action:**

| Action | Mô tả |
|---|---|
| `startCreate(tree, shadowEl)` | Drag từ sidebar (tạo mới) — instantiate Positioner |
| `startMove(nodeId, shadowEl)` | Drag node đã tồn tại |
| `endDrag(e)` | Commit drop nếu cursor trong `.wk-editor-body`, cleanup |
| `setPositioner(p)`, `setDraggedShadow(el)` | markRaw helpers |

### `useUIStore` (`src/stores/editor_v2/editor.js`, alias `'ui'`)

**State:**
- `breakpointActive: 'laptop'` (text key — `'desktop' | 'laptop' | 'tablet' | 'mobile'`, default `DEFAULT_BREAKPOINT='laptop'`)
- `leftSidebarKeyActive: null` — panel sidebar hiện active
- `toolbarKeyActive: null` — right-toolbar tab
- `settingDialogs: []` — stack popover (color picker, asset picker…)
- `animationPreviewNodeId: null` — id node đang preview animation

**Action:**
- `setStateField(key, value)` — generic setter
- `setToolbarActive(key)` — toggle right-toolbar
- `toggleDialogVis(e, type, data?)` — open/close popover
- `closeDialog(type)`, `setDialogPosition(type, position)`

### `useHistoryStore` (`src/stores/editor_v2/history.js`)

**State:**
- `timeline: [{ patches, inversePatches, label, key, ts, selectedBefore, selectedAfter }]`
- `pointer: -1` — cursor entry hiện tại
- `_silent: boolean` — set bởi `ignore()` để skip record
- `_coalesce: { key, until } | null` — window gộp entry cùng key

**Action:**
- `record(patches, inversePatches, label, opts)` — gọi qua `_commit`, không gọi tay
- `undo() / redo()` — apply inverse/forward patches + restore selection + scrub DOM refs
- `ignore(fn)` — chạy fn không record (nest-safe)
- `clear()` — reset timeline + pointer + coalesce (gọi sau `hydrate`)
- `defaultThrottleMs() → 300` — default coalesce window

**Getter:** `canUndo`, `canRedo`, `nextUndoLabel`, `nextRedoLabel`.

Chi tiết timeline, throttle/coalesce, patch op shape: [`10-history.md`](./10-history.md).

### `useEditorPageStore` (`src/stores/editor_v2/page.js`, alias `'editor_v2_page'`)

**State:** `{ pageId, loading, saving, lastSavedAt, lastError, dirty }`

**Action:**
- `loadPage(pageId)` — fetch payload từ BE → `nodeStore.hydrate(payload)`
- `savePage()` — `nodeStore.serialize()` → POST pageApi
- `switchPage(newPageId, { saveDirty })` — save dirty page (optional) trước khi load page mới
- `markDirty()` — gọi từ watch trên `nodeStore.nodes` (debounced)

### `usePageListStore` (`src/stores/editor_v2/pageList.js`)

**State:** `{ siteId, pages: [], loading, lastError }`

**Getter:** `homePage`, `byId`.

**Action:** `loadPages(siteId)`, `createPage({name, slug, isHome})`, `renamePage(pageId, {name, slug})`, `deletePage(pageId)`.

Header `PagePickerDropdown` đọc store này.

### `useGlobalStylingStore` (`src/stores/editor_v2/globalStyling.js`)

**State:** site-wide design tokens — `presets`, `currentBp` (mirror UI).

**Action:**
- `getNodeStyles(node, elementType)` / `getNodeStylesAuto(node)` — compose preset styles theo `node.data.specials.preset` (slug)
- `getNodeClass(node, elementType)` — return CSS class name
- `updatePresetStyle(elementType, slug, cssKey, cssValue)` — update token
- `load(pageId)` / `save(pageId)` — persist qua site API
- `refreshCSS()` — inject CSS variables vào `<style>` root

Element widget (vd HeadingV2) qua mixin/computed kết hợp `nodeBase.commonStyleData` + `globalStylingStore.getNodeStylesAuto(node)`.

## 4. Registry pattern

### Vấn đề muốn giải

Trước refactor: NodeRenderer hardcode switch, Positioner hardcode rule root-only, nodeFactory hardcode shape mỗi element. Thêm element = sửa 4-5 file.

### Sau refactor

Mỗi element folder tự khai báo `meta` trong file riêng. Registry tự lookup + wrap factory + precompute allowedKeys + renderers + statefulKeys.

```
nodes/heading/
  ├── index.vue        ← component + factory (imports meta từ ./meta.js)
  ├── meta.js          ← Pure data: type, label, traits, rules, defaults, states?, satellite? (NO Vue, NO @/)
  └── ai.js            ← (optional) AI hints — lazy-loaded
```

**Meta shape (đầy đủ tùy chọn):**

```js
// meta.js
export const meta = {
  type: 'button',                   // unique key (kebab-case)
  label: 'Button',
  category: 'basic',                // sidebar group: 'layout' | 'basic' | 'system'
  showInSidebar: true,
  isContainer: false,
  rules: {
    isRootOnly: false,
    locked: false,                  // không delete/duplicate/drag riêng
    hideInLayer: false,             // ẩn khỏi Layers panel
    isContentEditable: false,       // bật editableText mixin
    edgeOverlay: { padding: true, marginSides: { left: false } },  // overlay rule
    canDropInto: (parentType) => true,                              // src-side drop guard
    nodeChildAllows: [],            // parent-side whitelist: chỉ chấp nhận child types này; [] = không hạn chế
  },
  defaults: {
    style:    { '--node-width': 'fit', padding: '12px 24px' },
    config:   {},
    specials: {},
    responsive: { mobile: { padding: '8px 16px' } },               // flat OK — normalizeResponsiveSlot tự route
  },
  states: {                                                        // optional — variant state UI (hover/active)
    base: 'default',
    variants: [
      { value: 'default', label: 'Default' },
      { value: 'hover',   label: 'Hover', selector: ':hover'   },
      { value: 'active',  label: 'Active', selector: ':active' },
    ],
    groups: ['Background', 'Shape'],                               // chỉ groups này dùng state UI
  },
  satellite: { type: 'list-item', configKey: 'satelliteId' },      // optional — child node auto-created
  events: { on: ['click', 'hover'], actions: ['openPage', 'openPopup', 'goToUrl'] },  // optional — event slots
  traits: {
    general: [
      { key: 'layout',   label: 'Layout',   attributes: ['width_select', 'padding'] },
      { key: 'styling',  label: 'Styling',  attributes: ['bg_color', 'border'] },
    ],
    advanced: [
      { key: 'spacing',  label: 'Spacing',  attributes: ['padding_margin'] },
    ],
  },
}

// index.vue
import { meta as baseMeta } from './meta.js'
import { createNode } from '@/composable/editor_v2/createNode'

export default { /* Vue Options API component */ }
export const meta = {
  ...baseMeta,
  // Factory trả node minimal — registry wrap để fill defaults missing keys.
  factory: (overrides) => createNode({ type: 'button', style: overrides.style || {} }),
}
```

**`registerElement(meta, component)` làm 5 việc:**

1. **Normalize defaults** — đảm bảo `{ style, config, specials, responsive }`.
2. **Wrap factory** — sau khi factory return, merge defaults vào missing keys (factory/overrides win). Seed `node.data.name` từ `meta.label`. Normalize per-bp slots qua `normalizeResponsiveSlot`.
3. **Precompute `allowedKeys`** — walk `meta.traits.*.attributes`, resolve qua `DEFINITIONS_DATA.writes`, build `{style: Set, config: Set, specials: Set}`. Cộng thêm variant keys (`states.variants[].value`) vào `allowedKeys.config` để guard không drop state map. Consumer: `writeNamespaceWithRec`.
4. **Precompute `renderers`** — ordered `(node)→CSS` array, seed `[flexCanvas, canvasNodeWrapper]` rồi walk traits + lookup `STYLE_RENDERERS[key]`. Consumer: `nodeBase.commonStyleData`.
5. **Precompute `statefulKeys`** — `collectStatefulWriteKeys(meta)` — Set writeKey eligible per-state (chỉ keys thuộc groups khai báo trong `states.groups`, trừ opt-outs). Consumer: `_routeState`.

**Bootstrap:** `registerElements.js` chạy `import.meta.glob('@/components/editor_v2/nodes/*/index.vue', { eager: true })`, lặp module, gọi `registerElement(meta, default)`. Import từ `PageWrapper` 1 lần.

**Consumers:**

| File | Đọc gì từ registry |
|---|---|
| `NodeRenderer` | `getDef(type).component` để render |
| `Positioner` | `isRootOnlyType(type)`, `canDropInto(src, parent)`, `getNodeChildAllows(parent)` để biết drop rule |
| `node.js` store | `isRootOnlyType`, `isLockedType`, `getAllowedKeys(type, ns)`, `getNodeChildAllows(parent)`, `getDef(type).statefulKeys`, `getDef(type).states`, `getDef(type).events` |
| `nodeFactory.factoryFor` | Wrapped factory + defaults |
| `nodeBase.commonStyleData` | `getDef(type).renderers` array |
| `satelliteOwner` | `getDef(type).satellite` để ensure child |
| `statefulNode` | `getDef(type).states` + `mergeStateMap` để inject CSS |
| `editableText` | `getDef(type).rules.isContentEditable` |
| Sidebar pickers | `listSidebar()` để render danh sách element |
| Layers panel | `getDef(type).label/icon` |
| Trait panel | `getDef(type).traits` |
| AI gen | `dumpRegistryForLLM()` walk registry build LLM schema |

### Tại sao tách `registry.js` và `registerElements.js`?

**Để tránh import cycle TDZ.** Chain trước khi tách:

```
node.js store
  ├── import { isRootOnlyType } from 'registry'
  └── registry
        ├── import.meta.glob('nodes/*.vue', { eager: true })  ← KÉO MỌI ELEMENT VÀO
        └── nodes/heading/index.vue
              └── import { nodeLeaf } from 'mixins'
                    └── mixins/nodeBase
                          └── import { useNodeStore } from 'node.js'  ← TDZ!
```

**Fix:** `import.meta.glob` chỉ ở `registerElements.js`, load 1 lần từ `PageWrapper`. `registry.js` còn lại pure data + lookup, không kéo SFC.

**Rule cứng:**
- `registry.js` KHÔNG import component nào (kể cả via re-export).
- `meta.js` files PHẢI Vue-free (NO `import` từ `@/components`).
- `mixins/*` KHÔNG import element SFC.
- Stores KHÔNG import component.

Cycle check script: xem [`06-troubleshooting.md`](./06-troubleshooting.md) § Cycle check.

## 5. Mixin layering

6 mixin (Options API mixins — composables bị project ban):

```
nodeBase  ─────────────────┐
  ↑ extends                │  Element compose:
nodeContainer ←────────────┤
                           │  Heading:   nodeLeaf + draggableNode + editableText (gắn sẵn vào nodeBase)
draggableNode (orthogonal)─┤  Text:      nodeLeaf + draggableNode + editableText
                           │  Button:    nodeLeaf + draggableNode + statefulNode
editableText (rule opt-in) ┤  Image:     nodeLeaf + draggableNode
                           │  Icon:      nodeLeaf + draggableNode
statefulNode (state opt-in)┤  Block:     nodeContainer + draggableNode
                           │  Section:   nodeContainer + draggableNode
satelliteOwner (sat opt-in)┤  Tab:       nodeContainer + draggableNode + satelliteOwner
                           │  List:      nodeContainer + draggableNode + satelliteOwner
nodeLeaf = alias nodeBase ─┘  Root:      (đặc biệt — không mixin, locked)
```

### `nodeBase` cung cấp

```js
props: { node, nodeId }
computed: {
  events                  // mapState(useNodeStore, ['events'])
  breakpointActive        // mapState(useUIStore, ['breakpointActive']) — text key
  isSelected              // events.selected.includes(nodeId)
  mergedStyle             // cascade qua mergeNamespace (style ns)
  mergedConfig            // cascade qua mergeNamespace (config ns)
  mergedSpecials          // base only — node.data.specials
  commonStyleData         // Object.assign({}, ...def.renderers.map(r => r(node))) — precomputed CSS
  nodeAttrs               // { data-node-id, data-node-type, draggable: 'true' }
  nodeClassMap            // { 'wk-node-selected': isSelected, hidden: mergedConfig.hidden }
  nodeListenersBase       // { click: onClick }
}
lifecycle: mounted / updated / beforeUnmount → setDOM (markRaw)
methods: {
  onClick                 // stopPropagation + setSelected(nodeId)
  changeStyle(patch, opts)
  changeConfig(patch, opts)
  changeSpecials(patch)
}
```

**Template root convention:**
```vue
<template>
  <div ref="root"
       v-bind="{ ...nodeAttrs, ...editableAttrs }"
       :class="nodeClassMap"
       :style="{ ...commonStyleData, /* element-specific overrides last */ }"
       v-on="{ ...nodeListenersBase, ...dragListeners, ...editableListeners, ...dropListeners }">
    <component :is="'style'" v-if="stateCss">{{ stateCss }}</component>
    ...
  </div>
</template>
```

`commonStyleData` ĐI TRƯỚC element-specific style — element giữ final word cho layout vars, gap, padding override.

### `nodeContainer` thêm

```js
computed: {
  isEmpty                 // node.data.nodes.length === 0
  isDropTarget            // indicator.placement.parent.id === nodeId
}
methods: {
  onDragOver(e)           // positioner.computeIndicator(nodeId, x, y) → setIndicator
  onDragEnter(e)          // preventDefault + stopPropagation
}
```

### `draggableNode` (object methods + computed)

```js
computed: {
  dragListeners           // { dragstart, dragend }
}
methods: {
  onMoveDragStart(e)      // stopProp + setSelected + createShadow + startMove + classList
  onMoveDragEnd(e)        // endDrag + cleanup classList
}
```

Opt-out cho `locked` type qua check `getDef(type).rules.locked`.

### `editableText` (opt-in via `meta.rules.isContentEditable`)

```js
data: { isEditing: false }
computed: {
  isContentEditable       // getDef(type).rules.isContentEditable
  editableAttrs           // { spellcheck, tabindex, contenteditable } khi rule = true
  editableListeners       // { dblclick → enter editing, blur → commit, keydown }
}
```

Khi rule off, cả 2 bundle là `{}` → element inert. Image / Video share `nodeLeaf` mà không phải re-implement.

### `statefulNode` (opt-in via `meta.states`)

```js
computed: {
  stateDef                // getDef(type).states
  stateCss                // compose CSS rules `[data-node-id="..."]:hover { padding: 12px !important; … }` cho mỗi non-base variant
}
```

Component template phải có `<component :is="'style'" v-if="stateCss">{{ stateCss }}</component>` ở root. CSS dùng `!important` để beat inline base style.

Reader: `mergeStateMap(node, state, currentBp)` cascade per-bp giống `mergeNamespace` nhưng 1 level sâu hơn (`config[state]` map).

### `satelliteOwner` (opt-in via `meta.satellite`)

```js
computed: {
  satelliteMeta           // getDef(type).satellite | null
  satelliteId             // getConfig(node, satellite.configKey, null)
  satelliteNode           // nodeStore.nodes[satelliteId]
}
mounted: this.$nextTick(() => this.ensureSatellite())
methods: {
  ensureSatellite()       // lazy-create satellite child qua factoryFor + addDetachedNode
}
```

Vd `tab` owner ↔ `tab-content` satellite: owner template render qua `<NodeRenderer :node-id="satelliteId" />`. Satellite KHÔNG nằm trong `data.nodes` — không xuất hiện trong Layers, không drag tách rời.

### Element compose

```js
import { nodeContainer, draggableNode } from '@/composable/editor_v2/mixins'
import { satelliteOwner } from '@/composable/editor_v2/mixins/satelliteOwner'
export default {
  mixins: [nodeContainer, draggableNode, satelliteOwner],
  // ...
}
```

Vue merge mixin theo thứ tự, component override mixin nếu trùng key.

### Cảnh báo về mixin

- Mixin che nguồn property — debug `this.isSelected` không jump tới `nodeBase.js` được. Vue 3 khuyến nghị composables hơn mixins, nhưng project ban Composition API.
- Nếu trùng tên method → component thắng.

## 6. CSS architecture

**Global** (`src/assets/editor_v2/node.css`), import 1 lần từ `PageWrapper`:
- `.wk-node-selected` — outline xanh khi selected
- `.wk-node-placeholder` + `__content` + `__text` — empty-container placeholder
- `[data-node-type][draggable="true"]` — cursor grab/grabbing
- `.wk-flex-block--drop-active`, `.wk-flex-section--drop-active` — tint xanh khi indicator target
- `body.wk-dragging` — flag drag session

**Scoped** trong từng element SFC — chỉ structural CSS (flex direction, min-height, padding mặc định).

**State CSS** — `<style>` inject động bởi `statefulNode` mixin. Selector `[data-node-id="..."]:<selector>` để chỉ apply cho instance đó.

**Global styling** — `useGlobalStylingStore.refreshCSS()` inject CSS variables vào `<style id="wk-global-styling">` ở `<head>`.

## 7. Cycle avoidance rules

Khi sửa code editor_v2, ghi nhớ:

1. **`registry.js` không import component nào.** Pure data + lookup.
2. **`mixins/*` chỉ import từ stores + composables**, không import element SFC.
3. **Stores chỉ import từ `composable/editor_v2/`**, không import component.
4. **Composables (`Positioner`, `createNode`, …) không import store top-level** — qua function call (`useXxxStore()` chỉ chạy khi gọi runtime).
5. **`constants.js` là leaf module** — không import gì.
6. **`ai/*` chỉ glob `nodes/*/meta.js` + `ai.js`** — KHÔNG glob `index.vue` (tránh kéo Vue vào AI chunk).

Test cycle bằng script tĩnh (xem `06-troubleshooting.md` § Cycle check).

## 8. Folder responsibility cheatsheet

| Folder | Trách nhiệm | KHÔNG được làm |
|---|---|---|
| `composable/editor_v2/` | Logic JS thuần, không UI | Import Vue component |
| `composable/editor_v2/mixins/` | Compose-able behaviors cho element | Import element SFC |
| `composable/editor_v2/ai/` | AI gen pipeline | Import .vue / kéo runtime store top-level |
| `composable/editor_v2/templates/` | Page-template data | Import Vue component |
| `stores/editor_v2/` | State + actions | Import component |
| `components/editor_v2/nodes/` | Element SFC (folder-per-type) | Import lẫn nhau (qua NodeRenderer) |
| `components/editor_v2/elements/` | Editor chrome (renderer, overlays, toolbar) | Là node element |
| `components/editor_v2/components/sidebar/` | Sidebar groups + Element pickers + Layers | Drag-drop logic |
| `components/editor_v2/components/trait/` | Trait panel + widgets + defs | Drag-drop |
| `components/editor_v2/components/trait/fields/` | Pure data (definitions, schema, defs/) | Import Vue component |
| `components/editor_v2/components/trait/components/fields/` | Vue widget files | Logic ngoài widget scope |
| `components/editor_v2/components/color_picker/` | Color picker UI | Trait-specific logic |
| `assets/editor_v2/` | Global CSS | Component-specific style |
