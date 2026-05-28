# Editor V2 — Mục lục tài liệu

Tài liệu chi tiết về kiến trúc Editor V2: visual page builder kế thừa convention DOM của Pagefly, port từ craft.js (React) sang Vue 3 Options API + Pinia.

## Đọc theo thứ tự này

1. [`01-architecture.md`](./01-architecture.md) — Tổng quan kiến trúc, cấu trúc thư mục, 4 store (node/dnd/ui/history), registry pattern (factory wrap + allowedKeys + renderers precomputed), mixin layering, cách tránh import cycle.
2. [`02-rendering.md`](./02-rendering.md) — Pipeline render: từ `PageWrapper` → `NodeRenderer` → component, cách Vue reactivity phối hợp với store.
3. [`03-drag-drop.md`](./03-drag-drop.md) — Luồng kéo-tạo (sidebar → canvas) + kéo-di chuyển (node đã có) + Positioner chi tiết + IndicatorOverlay.
4. [`04-overlays.md`](./04-overlays.md) — Selection state, ElementToolbar (floating), EdgeOverlays (padding/margin khi hover).
5. [`05-extending.md`](./05-extending.md) — Cách thêm element mới + case nâng cao (Grid, Product, ProductSlider). ⚠️ Phần trait panel thay bằng `07`.
6. [`06-troubleshooting.md`](./06-troubleshooting.md) — Lỗi thường gặp, cách debug và checklist khi thêm/sửa element.
7. [`07-traits-and-data.md`](./07-traits-and-data.md) ★ **Tài liệu chính**: 3 namespace (style/config/specials), cascade desktop-first 2-phase, `DEFINITIONS_DATA` catalog đầy đủ (width_select / bg_* / border / corner / shadow / padding_margin / animation / display / html_tag …), CSS custom properties (`--node-width`, `--layout-direction`), `styleRenderers.js` co-located, `meta.defaults` + factory wrap, `normalizeResponsiveSlot` (canonical + flat shape), `buildElementSchema` mirror per-bp, store-level guard `allowedKeys`.
8. [`08-glossary.md`](./08-glossary.md) — Từ viết tắt cho biến (`ns`, `bp`, `def`, `ctx`, `raw`, `merged`, …), mục đích của từng hàm, mapping file, quy ước đặt tên, anti-pattern cần tránh.
9. [`09-ai-page-generation.md`](./09-ai-page-generation.md) ★ **KẾ HOẠCH** — Roadmap 3 phase tích hợp AI generate page (Phase 1 = MVP one-shot full page). Kiến trúc, JSON contracts, building block (`dumpRegistryForLLM` / `validateDef` / `commitAIPage`), chiến lược prompt, cost/quota, test plan, câu hỏi mở. Chưa triển khai — đọc khi bắt đầu Phase 1.
10. [`10-history.md`](./10-history.md) ★ **MỚI** — Undo / Redo: `PatchRecorder` (forward + inverse atomic), `useHistoryStore` (timeline + pointer + coalesce window + throttle = 300ms), `_commit` chokepoint trong node store, hot path coalesce + `compactPatches`, selection restore, DOM ref scrub. Đọc khi đụng vào mutation flow hoặc debug "Undo nhảy nhiều bước / không nhảy được".

## Tra cứu nhanh

### Cây thư mục

```
src/
  composable/editor_v2/          ← Logic không phụ thuộc Vue component
    constants.js                 ← ROOT_NODE, BORDER_OFFSET, BREAKPOINTS
    createNode.js                ← createNode / createNodeTree / wrapTree (leaf primitives)
    registry.js                  ← Pure data: getDef, registerElement, isRootOnlyType, getAllowedKeys
    registerElements.js          ← Bootstrapper — eager glob nodes/*/index.vue + register
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
    node.js                      ← Tree state + add/move/remove/duplicate + query API + writeNamespaceWithRec guard + _commit chokepoint
    dnd.js                       ← Drag session state + Positioner lifecycle
    editor.js                    ← UI state (breakpoint, sidebar)
    history.js                   ← Undo/Redo: timeline + pointer + coalesce + throttle (xem 10-history.md)

  components/editor_v2/
    PageWrapper.vue              ← Editor entry — canvas + overlays + bootstrapper
    nodes/                       ← Element folder structure (auto-registered)
      root_canvas/
        ├── index.vue            ← Component + factory (imports meta)
        └── meta.js              ← type='root', runtime metadata (NO Vue, NO @/ alias)
      flex_section/
        ├── index.vue            ← Component + factory
        ├── meta.js              ← Runtime metadata + defaults (style/config/specials/responsive)
        └── ai.js                ← AI hints (lazy-loaded, optional)
      flex_block/
        ├── index.vue
        ├── meta.js
        └── ai.js
      heading/
        ├── index.vue
        ├── meta.js
        └── ai.js
    elements/                    ← Non-node UI cho editor
      NodeRenderer.vue           ← Switcher đọc registry → render component
      ElementDragV2.vue          ← Wrapper sidebar items để startCreate
      ElementToolbar.vue         ← Floating toolbar trên element đang chọn
      EdgeOverlays.vue           ← Padding/margin SVG strips + hover detection
      IndicatorOverlay.vue       ← Vạch drop indicator
    components/
      sidebar/                   ← Sidebar groups + Element picker
      trait/
        fields/
          ├── definitions.js     ← Pure data: DEFINITIONS_DATA, getDefinitionData(), buildElementSchema(), normalizeResponsiveSlot()
          ├── styleRenderers.js  ← (node) → CSS object — co-located, registered qua collectRenderers
          ├── registry.js        ← COMPONENT_DEFINITIONS với field .component đính kèm
          └── schema_helpers.js  ← JSON Schema builders (string, number, cssColor, responsive, etc.)
        components/fields/       ← Vue widget cho trait (PaddingTrait, ShadowTrait, CornerTrait, …)
      dialog/                    ← Trait dialog (PaddingDialog, …)
    PageEmpty.vue                ← Canvas trống placeholder

  composable/editor_v2/
    patchRecorder.js             ← PatchRecorder class + compactPatches + applyPatches (history primitive)
    get.js                       ← getStyle(node, key, fallback) / getConfig(node, key, fallback) — đọc per-bp
    responsivePolicy.js          ← defaultStyleSlot / defaultConfigSlot — per-key slot router

  assets/editor_v2/
    node.css                     ← Global: wk-node-selected, wk-node-placeholder, cursor
```

### Các khái niệm chính trong một câu

| Khái niệm | Tóm tắt |
|---|---|
| **Node** | Đơn vị trong cây: `{ id, data:{type,style,config,specials,parent,nodes,responsive}, dom }` |
| **NodeTree** | `{ rootNodeId, nodes }` — input cho `addNodeTree`, output từ factory |
| **Element** | Folder trong `nodes/<name>/` với 3 file: `index.vue` (component + factory), `meta.js` (runtime metadata), `ai.js` (tùy chọn — AI hints) |
| **Meta** | Object dữ liệu thuần từ `meta.js` — type, label, icon, factory, traits, rules. KHÔNG có Vue imports. |
| **Registry** | Map `type → { ...meta, factory (đã wrap), defaults, component }` — auto-populate từ `registerElements` |
| **Trait definition** | Entry trong definitions.js: `{ writes: { key: { target, schema } } }` — dùng lại được cho nhiều element |
| **Writes map** | `{ padding: { target: 'style', schema }, ... }` — multi-key dispatch (một attribute update nhiều field) |
| **Mixin** | Code chung: `nodeBase`, `nodeContainer`, `draggableNode` — mỗi element compose lại |
| **Positioner** | Class tính vị trí drop khi drag, expose `computeIndicator(dropTargetId, x, y)` |
| **Indicator** | `events.indicator = { placement: { parent, index, where }, error }` — UI overlay |
| **Breakpoint** | text key `'desktop'/'laptop'/'tablet'/'mobile'` — slot key trong `data.responsive` |
| **Auto-wrap** | Drop element không phải Section vào ROOT → tự bọc trong FlexSection |
| **Style / Config / Specials** | 3 namespace dữ liệu — style=CSS responsive, config=data per-bp opt-in, specials=metadata base-only |
| **Cascade** | Desktop-first lúc đọc: base ⊕ mọi slot bp có width ≥ current (xem `07`) |
| **TraitField.onChange** | Dispatcher trong widget — route emit `(key, value)` vào đúng changeStyle/Config/Specials theo `def.writes[key].target` |
| **buildElementSchema** | Hàm pure: walk `meta.traits` → resolve definitions → trả về JSON Schema cho element (mirror per-bp) |
| **allowedKeys** | Set của tất cả writeKey trong traits của element — store guard reject key lạ (catch typo). Precomputed lúc `registerElement`. |
| **renderers** | Ordered array of `(node) → CSS` cho element, precomputed từ `STYLE_RENDERERS` map khi `registerElement`. Consumed bởi `nodeBase.commonStyleData`. |
| **PatchRecorder** | Class mutate state + thu thập (forward, inverse) patches. Dùng trong `_commit`. |
| **_commit** | Chokepoint node store: wrap mutation trong `$patch` + `PatchRecorder` + record vào history. |

### Workflow phổ biến

| Việc cần làm | File cần mở |
|---|---|
| Thêm element mới | `nodes/<name>/index.vue` (component + factory) + `meta.js` (metadata) + `ai.js` (tùy chọn) |
| Sửa trait definition | `components/trait/fields/definitions.js` (DEFINITIONS_DATA) — thay đổi áp dụng cho TẤT CẢ element dùng nó |
| Sửa element traits | `nodes/<name>/meta.js` (traits schema) — có thể ref định nghĩa hoặc spec inline |
| Sửa drop rule | `composable/editor_v2/Positioner.js` hoặc `meta.rules.canDropInto` |
| Sửa visual selection | `assets/editor_v2/node.css` |
| Sửa toolbar | `elements/ElementToolbar.vue` |
| Sửa hover padding/margin | `elements/EdgeOverlays.vue` |
| Thêm field widget mới | `components/trait/fields/Xxx.vue` + register vào `registry.js` FIELD_COMPONENTS |
| Sửa rule auto-wrap | `stores/editor_v2/node.js` (move / addNodeTree) |
| Sửa danh sách breakpoint | `composable/editor_v2/constants.js` + Header WkTabs |
| Validate trait schema | `npm run validate:schemas` — script CI dùng Node thuần |

## Quy ước đặt tên

- Element SFC: `XxxV2.vue` PascalCase, suffix V2 để phân biệt với v1
- Type string: kebab-case (`flex-section`, `product-slider`)
- CSS class: prefix `wk-` (web-cake), modifier `--`, element `__`
  - `wk-flex-block` / `wk-flex-block--drop-active` / `wk-node-placeholder__text`
- Mixin: camelCase, không cần suffix (`nodeBase`, `nodeContainer`)
- Store: `useXxxStore` (theo convention Pinia)

## Ngoài phạm vi hiện tại

- Multi-select / shift-click
- Linked node (data-list pattern cho ProductSlider advanced)
- Save / load page state (hiện chỉ in-memory)
- Inline text editing (Heading hiện chỉ đọc)
- Keyboard nav (mũi tên để chọn node)
- Lock / hide element trong Layers
- Copy / paste qua clipboard

Xem mục "Roadmap" trong `05-extending.md` để biết hướng triển khai từng cái.
