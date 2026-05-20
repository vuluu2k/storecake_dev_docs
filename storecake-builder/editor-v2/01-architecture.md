# 01 — Architecture

Kiến trúc tổng thể, data model, 3 stores, registry pattern, mixin layering, cách tránh import cycle.

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
                    ↑                  ↑                ↑
                    │                  │                │
              ┌─────┴─────┐      ┌─────┴─────┐    ┌─────┴─────┐
              │ NodeStore │      │  DndStore │    │  UIStore  │
              │           │      │           │    │           │
              │ nodes{}   │      │dragTarget │    │breakpoint │
              │ events{}  │      │positioner │    │  Active   │
              │ +query    │      │   shadow  │    │           │
              └───────────┘      └───────────┘    └───────────┘
                    ↑                  ↑
                    └──────┬───────────┘
                           │
                  ┌────────┴──────────┐
                  │     Positioner    │     Class, không phải Pinia
                  │   (DOM analyzer)  │     dnd store tạo khi startCreate
                  └───────────────────┘
```

## 2. Data model

### Node shape

Mỗi node là một object trong `nodeStore.nodes` map:

```js
{
  id: 'fs_abc12345',          // unique, gen tự động
  data: {
    type: 'flex-section',      // key tra registry → component + meta
    props: {                   // base props — default, không theo breakpoint
      padding: '20px 24px',
      background: '#fff',
    },
    parent: 'ROOT' | 'fs_xxx' | null,  // null chỉ với ROOT seed
    nodes: ['fb_yyy', 'fb_zzz'],       // children IDs theo thứ tự render
    isCanvas: true,            // có chấp nhận drop con không
    hidden: false,             // ẩn render
    custom: {},                // free-form per-element data

    // ─── 3 NAMESPACE (thay cho single `props` cũ) ──────────────
    style:    { padding: '20px 24px' },   // CSS visual, responsive
    config:   {},                          // data per-bp opt-in (vd image src art-direction)
    specials: { text: 'Hello' },           // base-only metadata (text, htmlId, productId, ...)

    responsive: {              // per-breakpoint overrides (text key)
      laptop:  { style: { padding: '20px 32px' }, config: {} },
      mobile:  { style: { padding: '20px 15px' }, config: {} },
    },
  },
  dom: HTMLElement | null,     // tham chiếu DOM thật, set qua setDOM mounted/updated
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

## 3. Ba stores (Pinia Options API)

### `useNodeStore` (`src/stores/editor_v2/node.js`)

**State:**
- `nodes: { [id]: Node }` — toàn bộ cây dưới dạng flat map
- `events: { selected: [], hovered: null, dragged: [], indicator: null }`

**Action chính:**
| Action | Mô tả |
|---|---|
| `addNodeTree(tree, parentId, index)` | Merge tree vào store, auto-wrap nếu parent=ROOT & tree không phải root-only |
| `addNode(node, parentId, index)` | Add 1 node đã shaped sẵn |
| `move(nodeId, newParentId, newIndex)` | Re-parent, cycle-guard, auto-wrap, isRootOnly check |
| `remove(nodeId)` | Xoá node + tất cả descendants |
| `duplicate(nodeId)` | Deep-clone subtree với id mới, insert làm sibling kế |
| `setDOM(id, el)` | Ghi DOM ref (markRaw để không reactive) |
| `setSelected(id)` | Set selection (single-select hiện tại) |
| `setIndicator(indicator)` | Cập nhật indicator của drag session |
| `changeStyle(id, patch, opts?)` | Ghi style — default current bp, override `opts.breakpoint: 'base'\|key` |
| `changeConfig(id, patch, opts?)` | Ghi config — default base, opt-in per-bp |
| `changeSpecials(id, patch)` | Ghi specials — luôn base |
| `resetStyle/Config/Specials(id, keys, opts?)` | Xoá key khỏi target slot |
| `applyTrait(nodeId, field, value, opts?)` | Generic dispatcher — route theo `field.target` |

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
- `breakpointActive: 1440` (px)
- `leftSidebarKeyActive: 'elements__layout'` v.v.

**Action:**
- `setBreakpoint(bp)` — gọi từ Header WkTabs
- `setLeftSidebarKey(key)` — chuyển panel sidebar

## 4. Registry pattern

### Vấn đề muốn giải

Trước refactor:
- `NodeRenderer` hardcode switch `'flex-section' → FlexSectionV2, 'flex-block' → FlexBlockV2, …`
- `Positioner` hardcode `'flex-section'` cho rule root-only
- `nodeFactory` hardcode shape mỗi element trong inline literal
- Thêm element mới = sửa 4–5 file

### Sau refactor

**Source of truth:** mỗi element SFC tự khai báo `meta`. Registry tự lookup.

```
nodes/HeadingV2.vue
  ├── export default { ... component options ... }
  └── export const meta = {
        type: 'heading',
        label: 'Heading',
        icon: Type,
        factory: (overrides) => createNode({...}),
        traits: [{ key: 'text', type: 'text', label: 'Text' }],
        rules: { isRootOnly: false },
      }
```

**Bootstrap:** `registerElements.js` chạy `import.meta.glob('@/components/editor_v2/nodes/*.vue', { eager: true })`, lặp qua từng module, gọi `registerElement(meta, default)`.

**Consumers:**
| File | Đọc gì từ registry |
|---|---|
| `NodeRenderer` | `getDef(type).component` để render |
| `Positioner` | `isRootOnlyType(type)` để biết force ROOT khi drag |
| `node.js` store | `isRootOnlyType(type)` cho rule isDroppable + auto-wrap |
| `nodeFactory` | `factoryFor(type, props)` cho `buildElement` |
| Sidebar (tương lai) | `listSidebar()` để render danh sách element |
| Trait panel (tương lai) | `getDef(type).traits` để render form |

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
  ├── import 'registerElements'         ← side-effect: eager glob nodes
  │     └── kéo nodes/*.vue → mixins → stores → registry (đã load xong, OK)
  └── import other components
```

Khi PageWrapper render, stores đã init xong, mixins đã có binding `useNodeStore`, registry đã populate.

**Rule cứng:** trong `registry.js` KHÔNG được import bất cứ component nào (kể cả via re-export). Mọi import-cycle test phải pass.

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
}
lifecycle: mounted / updated / beforeUnmount → setDOM
methods: {
  onClick                 // setSelected(nodeId)
  changeStyle(patch, opts)    // forward → nodeStore.changeStyle
  changeConfig(patch, opts)   // forward → nodeStore.changeConfig
  changeSpecials(patch)       // forward → nodeStore.changeSpecials
}
```

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
