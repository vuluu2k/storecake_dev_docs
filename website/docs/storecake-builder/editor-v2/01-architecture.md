---
sidebar_position: 2
title: 01 — Architecture
---

# 01 — Architecture

Kiến trúc tổng thể, data model, 4 stores (node/dnd/ui/history), registry pattern, mixin layering, cách tránh import cycle.

## 1. Bức tranh lớn

```
┌────────────────────────────────────────────────────────────────┐
│  PageWrapper.vue  (editor entry)                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  .wk-editor-canvas (scroll container)                    │  │
│  │    ┌────────────────────────────────────────────────┐    │  │
│  │    │  .wk-editor-body (responsive width per bp)     │    │  │
│  │    │    <NodeRenderer node-id="ROOT" />             │    │  │
│  │    │      ↓ getDef('root') → RootCanvasV2           │    │  │
│  │    │      <FlexSectionV2 v-for child />             │    │  │
│  │    │        <FlexBlockV2 v-for child />             │    │  │
│  │    │          <HeadingV2 ... />                     │    │  │
│  │    └────────────────────────────────────────────────┘    │  │
│  └──────────────────────────────────────────────────────────┘  │
│  Teleport to body:                                             │
│    <IndicatorOverlay />     ← vạch xanh khi đang drag          │
│    <EdgeOverlays />         ← padding/margin SVG strips        │
│    <ElementToolbar />       ← floating toolbar trên selected   │
└────────────────────────────────────────────────────────────────┘
       ↑                ↑                ↑                ↑
       │                │                │                │
  ┌────┴────┐     ┌────┴────┐     ┌────┴────┐      ┌─────┴─────┐
  │NodeStore│     │ DndStore│     │ UIStore │      │HistoryStore│
  │         │     │         │     │         │      │           │
  │ nodes{} │     │ target  │     │ breakpt │      │ timeline  │
  │ events  │     │positioner│    │ Active  │      │ pointer   │
  │ +query  │     │  shadow │     │         │      │ coalesce  │
  │ _commit │ ───►│         │     │         │ ────►│  record   │
  └─────────┘     └─────────┘     └─────────┘      └───────────┘
       ▲               ▲                                  ▲
       │               │                                  │
       │       ┌───────┴────────┐               ┌─────────┴─────────┐
       │       │   Positioner   │               │  PatchRecorder    │
       │       │ (DOM analyzer) │               │ (fwd / inv ops)   │
       │       │  class instance│               │  per _commit      │
       │       └────────────────┘               └───────────────────┘
       │                                                  │
       └──────────────── undo()/redo() apply patches ─────┘
```

## 2. Data model

### Node shape

Mỗi node là một object trong `nodeStore.nodes` map:

```js
{
  id: 'fs_abc12345',          // unique, gen tự động
  data: {
    type: 'flex-section',      // key tra registry → component + meta
    parent: 'ROOT' | 'fs_xxx' | null,  // null chỉ với ROOT seed
    nodes: ['fb_yyy', 'fb_zzz'],       // children IDs theo thứ tự render
    isCanvas: true,            // có chấp nhận drop con không
    hidden: false,             // ẩn render
    custom: {},                // free-form per-element data

    // ─── 3 NAMESPACE ─────────────────────────────────────────
    style:    { padding: '32px 0px', '--node-width': 'fill' },  // CSS responsive
    config:   { contentWidth: 'fill_container' },               // data per-bp opt-in
    specials: { htmlTag: 'h2' },                                // base-only metadata
    events:   [],                                               // base-only behaviors
    bindings: [],                                               // base-only data refs

    responsive: {              // per-breakpoint overrides (text key)
      desktop: { style: { '--layout-direction': 'horizontal' }, config: {} },
      mobile:  { style: { '--layout-direction': 'vertical' },   config: {} },
    },
  },
  dom: HTMLElement | null,     // tham chiếu DOM thật, set qua setDOM mounted/updated/markRaw
  events: {},                  // (unused) — node-level event handlers
}
```

**Merged values** (cái element thực sự dùng để render — desktop-first cascade qua `mergeNamespace`):
```js
mergedStyle    = base.style    ⊕ responsive[desktop].style ⊕ ... ⊕ responsive[currentBp].style
mergedConfig   = base.config   ⊕ ... (cùng cascade)
mergedSpecials = base.specials                              // KHÔNG cascade — base only
```

> Chi tiết shape data + cascade algorithm xem [`07-traits-and-data.md`](./07-traits-and-data.md) sections 1-2.

### ROOT seed

Khi store init lần đầu, luôn có 1 node `id: 'ROOT'` (constant `ROOT_NODE`):
```js
{
  id: 'ROOT',
  data: { type: 'root', nodes: [], isCanvas: true, ... },
}
```
ROOT là parent của mọi FlexSection. Không xoá được, không drag được.

### NodeTree shape

Khi factory tạo nội dung mới (chưa vào store), kết quả là **NodeTree** chứ không phải dict:

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

## 3. Bốn stores (Pinia Options API)

### `useNodeStore` (`src/stores/editor_v2/node.js`)

**State:**
- `nodes: { [id]: Node }` — toàn bộ cây dưới dạng flat map
- `events: { selected: [], hovered: null, dragged: [], indicator: null }`

**Chokepoint:** `_commit(label, mutateFn, opts)` — wrap mọi mutation trong `$patch` + `PatchRecorder`, snapshot selection trước/sau, record vào history store. Xem [`10-history.md`](./10-history.md) cho chi tiết.

**Action chính:**
| Action | Mô tả |
|---|---|
| `addNodeTree(tree, parentId, index)` | Merge tree vào store, auto-wrap nếu parent=ROOT & tree không phải root-only |
| `addNode(node, parentId, index)` | Add 1 node đã shaped sẵn |
| `move(nodeId, newParentId, newIndex)` | Re-parent, cycle-guard, auto-wrap, isRootOnly check |
| `remove(nodeId)` | Xoá node + tất cả descendants |
| `duplicate(nodeId)` | Deep-clone subtree với id mới, insert làm sibling kế |
| `setDOM(id, el)` | Ghi DOM ref (markRaw để không reactive) — KHÔNG qua `_commit` |
| `setSelected(id)` | Set selection (single-select hiện tại) — KHÔNG qua `_commit` |
| `setIndicator(indicator)` | Cập nhật indicator của drag session — KHÔNG qua `_commit` |
| `changeStyle(id, patch, opts?)` | Ghi style — route per-key qua `defaultStyleSlot` policy; override `opts.breakpoint: 'base'\|key` |
| `changeConfig(id, patch, opts?)` | Ghi config — route per-key qua `defaultConfigSlot` policy |
| `changeSpecials(id, patch, opts?)` | Ghi specials — luôn base (không có per-breakpoint) |
| `resetStyle/Config/Specials(id, keys, opts?)` | Xoá key khỏi target slot (force throttle = 0) |
| `addEvent / updateEvent / removeEvent` | Append/merge/xóa entry trong `node.data.events` array |
| `addBinding / updateBinding / removeBinding` | Tương tự cho `node.data.bindings` |
| `serialize() / hydrate(payload)` | Snapshot ⇄ replace toàn bộ state (hydrate clear history) |

**Internal (`_` prefix):**
| Helper | Mô tả |
|---|---|
| `_commit(label, mutateFn, opts)` | Wrap mutation + record history; `opts: { silent, key, throttleMs }` |
| `_writeNs(id, ns, patch, slot, opts)` | Single-slot write (ép breakpoint cụ thể hoặc base) |
| `_writeByPolicy(id, ns, patch, slotForKey, bp, opts)` | Chia patch theo per-key responsive policy → multiple `_writeNs` |
| `_resetNs(method, id, keys, opts)` | Build `{key: undefined}` patch + ép throttle = 0 |
| `_addEntry / _updateEntry / _removeEntry` | Generic array-namespace mutation cho events/bindings |

**Getter:**
- `query` — mirror craft.js API: `query.node(id).get() / .isCanvas() / .isDroppable() / .ancestors() / .descendants()`. Positioner đọc qua đây.

**Quy tắc auto-wrap & isRootOnly** sống ở `move`, `addNodeTree`, và `query.node().isDroppable`. Tất cả đọc `isRootOnlyType(type)` từ registry để rule có thể mở rộng cho element root-only tương lai (ví dụ `Header`, `Footer`).

### `useDndStore` (`src/stores/editor_v2/dnd.js`)

**State:**
- `dragTarget: null | { type: 'new', tree } | { type: 'existing', nodes: [id] }`
- `draggedElementShadow: { el }` — preview ghost DOM (markRaw)
- `positioner: Positioner instance` (markRaw)

**Action:**
| Action | Mô tả |
|---|---|
| `startCreate(tree, shadowEl)` | Bắt đầu drag từ sidebar (tạo mới) — instantiate Positioner |
| `startMove(nodeId, shadowEl)` | Bắt đầu drag node đã tồn tại — instantiate Positioner |
| `endDrag(e)` | Commit drop nếu cursor trong canvas, cleanup shadow + Positioner |
| `setPositioner(p)` | Helper markRaw |
| `setDraggedShadow(el)` | Helper markRaw |

`endDrag` đọc indicator của Positioner, gọi `addNodeTree` hoặc `move`. Sau đó cleanup. Có guard `dropInsideCanvas` để không apply drop khi nhả ngoài `.wk-editor-body`.

### `useUIStore` (`src/stores/editor_v2/editor.js`)

**State:**
- `breakpointActive: 'desktop'` (text key — `'desktop' | 'laptop' | 'tablet' | 'mobile'`)
- `leftSidebarKeyActive: 'elements__layout'` v.v.

**Action:**
- `setBreakpoint(bp)` — gọi từ Header WkTabs
- `setLeftSidebarKey(key)` — chuyển panel sidebar

### `useHistoryStore` (`src/stores/editor_v2/history.js`)

**State:**
- `timeline: [{ patches, inversePatches, label, key, ts, selectedBefore, selectedAfter }]`
- `pointer: -1` — cursor entry hiện tại
- `_silent: boolean` — set bởi `ignore()` để skip record
- `_coalesce: { key, until } | null` — window đang mở để gộp entry cùng key

**Action:**
- `record(patches, inversePatches, label, opts)` — node store gọi qua `_commit`, không gọi tay
- `undo() / redo()` — apply inverse/forward patches + restore selection + scrub DOM refs
- `ignore(fn)` — chạy fn không record (nest-safe)
- `clear()` — reset timeline + pointer + coalesce; gọi sau `hydrate`

**Getter:** `canUndo`, `canRedo`, `nextUndoLabel`, `nextRedoLabel`.

Chi tiết timeline, throttle/coalesce, patch op shape: xem [`10-history.md`](./10-history.md).

## 4. Registry pattern

### Vấn đề muốn giải

Trước refactor:
- `NodeRenderer` hardcode switch `'flex-section' → FlexSectionV2, 'flex-block' → FlexBlockV2, …`
- `Positioner` hardcode `'flex-section'` cho rule root-only
- `nodeFactory` hardcode shape mỗi element trong inline literal
- Thêm element mới = sửa 4–5 file

### Sau refactor

**Source of truth:** mỗi element folder tự khai báo `meta` trong file riêng. Registry tự lookup, wrap factory với defaults, precompute allowedKeys + renderers.

```
nodes/heading/
  ├── index.vue        ← component + factory (imports meta từ ./meta.js)
  ├── meta.js          ← Pure data: type, label, traits, rules, defaults (NO Vue, NO @/)
  └── ai.js            ← (optional) AI hints, lazy-loaded
```

**Meta shape:**
```js
// meta.js
export const meta = {
  type: 'flex-block',
  label: 'Block',
  rules: { isRootOnly: false },
  defaults: {
    style: { padding: '0px', '--node-width': 'fill' },
    config: { contentWidth: 'fill_container' },
    responsive: { mobile: { '--layout-direction': 'vertical' } },  // flat shape OK
  },
  traits: {
    general:  [{ key: 'layout', attributes: ['width_select', 'padding'] }],
    advanced: [{ key: 'spacing', attributes: ['padding_margin'] }],
  },
}

// index.vue
import { meta as baseMeta } from './meta.js'
import { createNode } from '@/composable/editor_v2/createNode'

export default { ... }
export const meta = {
  ...baseMeta,
  // Factory return minimal node — registry wrap để fill defaults missing keys.
  factory: (overrides) => createNode({ type: 'flex-block', style: overrides.style || {} }),
}
```

**`registerElement(meta, component)` làm 3 việc:**
1. Wrap `meta.factory` — sau khi factory return, merge `defaults.style/config/specials/responsive` vào node missing keys (factory/overrides win).
2. Precompute `allowedKeys` — walk `meta.traits.general + .advanced`, lookup `DEFINITIONS_DATA`, build `{style: Set, config: Set, specials: Set}` writeKey allowlist. Store's `writeNamespaceWithRec` đọc set này để drop key lạ.
3. Precompute `renderers` — walk traits, lookup `STYLE_RENDERERS[key]`, build ordered array. `nodeBase.commonStyleData` lặp array này để compose CSS — không re-walk traits per render.

**Bootstrap:** `registerElements.js` chạy `import.meta.glob('nodes/*/index.vue', { eager: true })`, lặp qua từng module, gọi `registerElement(meta, default)`.

**Consumers:**
| File | Đọc gì từ registry |
|---|---|
| `NodeRenderer` | `getDef(type).component` để render |
| `Positioner` | `isRootOnlyType(type)` để biết force ROOT khi drag |
| `node.js` store | `isRootOnlyType(type)` cho rule isDroppable + auto-wrap; `getAllowedKeys(type, ns)` cho whitelist trong `writeNamespaceWithRec` |
| `nodeFactory` | `factoryFor(type, props)` cho `buildElement` (factory đã wrap) |
| `nodeBase.commonStyleData` | `getDef(type).renderers` để compose CSS |
| Sidebar | `listSidebar()` để render danh sách element |
| Trait panel | `getDef(type).traits` để render form |

### Tại sao tách `registry.js` và `registerElements.js`?

**Để tránh import cycle TDZ.** Chain trước khi tách:

```
node.js store
  ├── import { isRootOnlyType } from 'registry'
  └── registry
        ├── import.meta.glob('nodes/*.vue', { eager: true })  ← KÉO MỌI ELEMENT VÀO
        └── nodes/HeadingV2.vue
              └── import { nodeLeaf } from 'mixins'
                    └── mixins/nodeBase
                          └── import { useNodeStore } from 'node.js'  ← TDZ!
                                node.js đang giữa chừng evaluation,
                                useNodeStore chưa có binding
```

ESM cho phép circular import nhưng nếu binding **chưa initialize** thì throw `Cannot access 'X' before initialization`.

**Fix:** chuyển phần `import.meta.glob` sang file riêng `registerElements.js`, chỉ import từ `PageWrapper`. `registry.js` còn lại pure data + lookup functions, không kéo element nào.

Chain sau khi tách:
```
node.js store
  └── import from 'registry'           ← pure data, không cycle
        (registry không import gì cả)

PageWrapper.vue
  ├── import 'registerElements'         ← side-effect: eager glob nodes/*/index.vue
  │     └── kéo index.vue → meta.js → mixins → stores → registry (đã load xong, OK)
  └── import other components
```

Khi PageWrapper render, stores đã init xong, mixins đã có binding `useNodeStore`, registry đã populate.

**Rule cứng:** trong `registry.js` KHÔNG được import bất cứ component nào (kể cả via re-export). `meta.js` files PHẢI Vue-free (NO `import` từ `@/components`). Mọi import-cycle test phải pass.

## 5. Mixin layering

3 mixin chính (Options API mixins, không phải composables vì project ban Composition API):

```
nodeBase  ─────────────────┐
  ↑ extends                │
nodeContainer ←────────────┤  Element compose:
                           │
draggableNode (orthogonal)─┤  Heading: nodeLeaf + draggableNode
                           │  Block:   nodeContainer + draggableNode
                           │  Section: nodeContainer + draggableNode
nodeLeaf = alias nodeBase ─┘  Root:    (đặc biệt, không mixin)
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
  changeStyle(patch, opts)    // forward → nodeStore.changeStyle
  changeConfig(patch, opts)   // forward → nodeStore.changeConfig
  changeSpecials(patch)       // forward → nodeStore.changeSpecials
}
```

**Template root convention:**
```vue
<template>
  <div ref="root" v-bind="nodeAttrs" :class="nodeClassMap"
       :style="{ ...commonStyleData, /* element-specific overrides last */ }"
       v-on="{ ...nodeListenersBase, ...dragListeners, ...dropListeners }">
    ...
  </div>
</template>
```

`commonStyleData` đi TRƯỚC element-specific style — element giữ final word cho layout vars, gap, padding override.

### `nodeContainer` cung cấp thêm

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

### `draggableNode` (object `draggableNodeMethods` đổi tên qua barrel)

```js
methods: {
  onMoveDragStart(e)      // setSelected + createShadow + startMove + classList
  onMoveDragEnd(e)        // endDrag + cleanup classList
}
```

### Element compose

```js
import { nodeContainer, draggableNode } from '@/composable/editor_v2/mixins'
export default {
  mixins: [nodeContainer, draggableNode],
  // ...component-specific computed / template
}
```

Vue merge mixin theo thứ tự, component override mixin nếu trùng key. `data` thì merge sâu, methods thì replace.

### Cảnh báo về mixin

- Mixin che nguồn property — debug `this.isSelected` không tự jump tới `nodeBase.js` được. Vue 3 docs khuyến nghị composables hơn mixins, nhưng project ban Composition API nên đành dùng mixin.
- Nếu tên trùng (vd mixin có `data() { return { foo: 1 } }` và component cũng `data() { return { foo: 2 } }`), component thắng.

## 6. CSS architecture

**Global** (`src/assets/editor_v2/node.css`), import 1 lần từ `PageWrapper`:
- `.wk-node-selected` — outline xanh khi selected
- `.wk-node-placeholder` + `__content` + `__text` — empty-container placeholder
- `[data-node-type][draggable="true"]` — cursor grab/grabbing
- `.wk-flex-block--drop-active`, `.wk-flex-section--drop-active` — tint xanh khi indicator target

**Scoped** trong từng element SFC:
- Layout structural CSS (flex direction, min-height, padding mặc định)
- Không lặp lại class chung — chỉ giữ cái element-specific

## 7. Cycle avoidance rules

Khi sửa code editor_v2, ghi nhớ:

1. **`registry.js` không import component nào.** Pure data + lookup.
2. **`mixins/*` chỉ import từ stores + composables**, không import element SFC.
3. **Stores chỉ import từ `composable/editor_v2/`**, không import component.
4. **Composables (`Positioner`, `createNode`, …) không import store ngoại trừ qua function call**, vì `useXxxStore()` là factory chỉ chạy khi gọi runtime.
5. **`constants.js` là leaf module** — không import gì.

Test cycle bằng script tĩnh (xem `06-troubleshooting.md` § Cycle check).

## 8. Folder responsibility cheatsheet

| Folder | Trách nhiệm | Không được làm |
|---|---|---|
| `composable/editor_v2/` | Logic JS thuần, không UI | Import Vue component |
| `composable/editor_v2/mixins/` | Compose-able behaviors cho element | Import element SFC |
| `stores/editor_v2/` | State + actions | Import component |
| `components/editor_v2/nodes/` | Element SFC, mỗi file 1 type | Import lẫn nhau (qua NodeRenderer) |
| `components/editor_v2/elements/` | Editor chrome (renderer, overlays, toolbar) | Là node element |
| `components/editor_v2/components/` | Sidebar, trait, layers panels | Drag-drop logic |
| `assets/editor_v2/` | Global CSS | Component-specific style |
