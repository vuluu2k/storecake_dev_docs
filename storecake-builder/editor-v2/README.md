# Editor V2 — Documentation Index

Tài liệu chi tiết về kiến trúc Editor V2: visual page builder kế thừa từ Pagefly DOM convention, port từ craft.js (React) sang Vue 3 Options API + Pinia.

## Đọc theo thứ tự này

1. [`01-architecture.md`](./01-architecture.md) — Tổng quan kiến trúc, folder structure, 3 stores, registry pattern, mixin layering, cách tránh import cycle ⚠️ data model section đã outdate — xem `07` cho data shape mới
2. [`02-rendering.md`](./02-rendering.md) — Pipeline render: từ `PageWrapper` → `NodeRenderer` → component, cách Vue reactivity hoạt động với store
3. [`03-drag-drop.md`](./03-drag-drop.md) — Luồng kéo-tạo (sidebar → canvas) + kéo-di chuyển (existing node) + Positioner deep dive + IndicatorOverlay
4. [`04-overlays.md`](./04-overlays.md) — Selection state, ElementToolbar (floating), EdgeOverlays (padding/margin hover)
5. [`05-extending.md`](./05-extending.md) — Recipe thêm element mới + cases nâng cao (Grid, Product, ProductSlider) ⚠️ trait panel section thay bằng `07`
6. [`06-troubleshooting.md`](./06-troubleshooting.md) — Lỗi thường gặp + cách debug + checklist khi thêm/sửa element
7. [`07-traits-and-data.md`](./07-traits-and-data.md) ★ **NEW** — **Superset** thay thế phần data model + trait panel: 3 namespace (style/config/specials), cascade desktop-first, trait schema, TraitField generic, defaults (primitive + responsive map + complex value), dialog commit qua `applyTrait`, line-by-line code annotations
8. [`08-glossary.md`](./08-glossary.md) ★ **NEW** — Variable abbreviations (`ns`, `bp`, `def`, `ctx`, `raw`, `merged`, …), function purposes, file mapping, naming conventions, anti-patterns
9. [`09-ai-page-generation.md`](./09-ai-page-generation.md) ★ **PLAN** — Roadmap 3 phase tích hợp AI generate page (Phase 1 = one-shot full page MVP). Architecture, JSON contracts, building blocks (`dumpRegistryForLLM` / `validateDef` / `commitAIPage`), prompt strategy, cost/quota, test plan, open questions. Chưa implement — đọc khi bắt đầu Phase 1.

## Quick reference

### Folder tree
```
src/
  composable/editor_v2/          ← Logic không phụ thuộc Vue component
    constants.js                 ← ROOT_NODE, BORDER_OFFSET, BREAKPOINTS
    createNode.js                ← createNode / createNodeTree / wrapTree (leaf primitives)
    registry.js                  ← Pure data: getDef, registerElement, isRootOnlyType
    registerElements.js          ← Bootstrapper — eager glob nodes/*.vue + register
    nodeFactory.js               ← Composite tree builders (buildBlankSection, buildRowSection)
    Positioner.js                ← Drop placement engine (port craft.js)
    getDOMInfo.js                ← DOM rect + flow direction extraction
    findPosition.js              ← Vị trí drop trong list children
    movePlaceholder.js           ← (unused)
    createShadow.js              ← Tạo drag preview ghost
    cssShorthand.js              ← parseSides / formatSides (4-side padding/margin)
    draggableNode.js             ← Mixin methods: onMoveDragStart / onMoveDragEnd
    mixins/
      nodeBase.js                ← Props, isSelected, mergedStyle/Config/Specials, lifecycle setDOM, onClick, changeStyle/Config/Specials shortcuts
      nodeContainer.js           ← Mở rộng nodeBase: isEmpty, isDropTarget, onDragOver/Enter
      index.js                   ← Barrel + nodeLeaf alias + re-export draggableNode

  stores/editor_v2/
    node.js                      ← Tree state + add/move/remove/duplicate + query API
    dnd.js                       ← Drag session state + Positioner lifecycle
    editor.js                    ← UI state (breakpoint, sidebar)

  components/editor_v2/
    PageWrapper.vue              ← Editor entry — canvas + overlays + bootstrapper
    nodes/                       ← Element SFCs registered tự động
      RootCanvasV2.vue           ← type='root'
      FlexSectionV2.vue          ← type='flex-section'
      FlexBlockV2.vue            ← type='flex-block'
      HeadingV2.vue              ← type='heading'
    elements/                    ← Non-node UI cho editor
      NodeRenderer.vue           ← Switcher đọc registry → render component
      ElementDragV2.vue          ← Wrapper sidebar items để startCreate
      ElementToolbar.vue         ← Floating toolbar trên element selected
      EdgeOverlays.vue           ← Padding/margin SVG strips + hover detection
      IndicatorOverlay.vue       ← Vạch drop indicator
    components/
      sidebar/                   ← Sidebar groups + Element picker
      trait/                     ← Trait panel components (đang build)
    PageEmpty.vue                ← Empty canvas placeholder

  assets/editor_v2/
    node.css                     ← Global: wk-node-selected, wk-node-placeholder, cursor
```

### Key concepts một câu

| Concept | Tóm tắt |
|---|---|
| **Node** | Đơn vị trong cây: `{ id, data:{type,style,config,specials,parent,nodes,responsive}, dom }` |
| **NodeTree** | `{ rootNodeId, nodes }` — input cho `addNodeTree`, output từ factory |
| **Element / Component** | Vue SFC trong `nodes/`, mỗi file render 1 `data.type` |
| **Meta** | Object xuất kèm component, mô tả label, icon, factory, traits, rules |
| **Registry** | Map `type → { ...meta, factory, defaults, component }` — auto-populate từ `registerElements` |
| **Mixin** | Code chung: `nodeBase`, `nodeContainer`, `draggableNode` — mỗi element compose lại |
| **Positioner** | Class tính ra vị trí drop khi drag, expose `computeIndicator(dropTargetId, x, y)` |
| **Indicator** | `events.indicator = { placement: { parent, index, where }, error }` — UI overlay |
| **Breakpoint** | text key `'desktop'/'laptop'/'tablet'/'mobile'` — slot key trong `data.responsive` |
| **Auto-wrap** | Drop element không phải Section vào ROOT → tự bọc trong FlexSection |
| **Style / Config / Specials** | 3 namespace data — style=CSS responsive, config=data per-bp opt-in, specials=base-only metadata |
| **Cascade** | Desktop-first read-time: base ⊕ mọi bp slot width ≥ current (xem `07`) |
| **applyTrait** | Generic dispatcher trong store — route value vào đúng changeStyle/Config/Specials theo `field.target` |
| **isBreakpointMap** | Helper check object có phải responsive map (`{base, mobile, ...}`) hay complex value |

### Workflow phổ biến

| Việc cần làm | File mở |
|---|---|
| Thêm element mới | `nodes/XxxV2.vue` (mixin + meta) — không đụng file khác |
| Sửa drop rule | `composable/editor_v2/Positioner.js` hoặc `meta.rules.canDropInto` |
| Sửa visual selection | `assets/editor_v2/node.css` |
| Sửa toolbar | `elements/ElementToolbar.vue` |
| Sửa padding/margin hover | `elements/EdgeOverlays.vue` |
| Thêm trait field type | `components/trait/fields/Xxx.vue` + extend `TraitField` switch |
| Sửa auto-wrap rule | `stores/editor_v2/node.js` (move / addNodeTree) |
| Sửa breakpoint list | `composable/editor_v2/constants.js` + Header WkTabs |

## Convention đặt tên

- Element SFC: `XxxV2.vue` PascalCase, suffix V2 phân biệt với v1
- Type string: kebab-case (`flex-section`, `product-slider`)
- CSS class: prefix `wk-` (web-cake), modifier `--`, element `__`
  - `wk-flex-block` / `wk-flex-block--drop-active` / `wk-node-placeholder__text`
- Mixin: camelCase, không cần suffix (`nodeBase`, `nodeContainer`)
- Store: `useXxxStore` (Pinia convention)

## Out of scope hiện tại

- Multi-select / shift-click
- Undo / redo (history store stub đã có nhưng chưa wire)
- Linked nodes (data-list pattern cho ProductSlider advanced)
- Save / load page state (chỉ in-memory)
- Inline text editing (Heading hiện chỉ đọc)
- Keyboard nav (arrow để chọn node)
- Lock / hide element trong Layers
- Copy / paste qua clipboard

Xem `05-extending.md` phần "Roadmap" để biết hướng triển khai từng cái.
