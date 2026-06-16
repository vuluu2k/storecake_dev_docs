# Editor V2 — Mục lục tài liệu

Tài liệu chi tiết về kiến trúc Editor V2: visual page builder kế thừa convention DOM của Pagefly, port từ craft.js (React) sang Vue 3 Options API + Pinia.

> **Trạng thái cập nhật**: đồng bộ với code branch `feat-builder-v2` ở snapshot 2026-06-03. Phần code đã thay đổi nhiều so với draft đầu — chú ý các `★` đánh dấu chương vừa rewrite.

## Đọc theo thứ tự này

1. [`01-architecture.md`](./01-architecture.md) ★ — Tổng quan kiến trúc, data model, **7 store** (node/dnd/ui/history/page/pageList/globalStyling), registry pattern (factory wrap + allowedKeys + renderers + statefulKeys), **6 mixin** (nodeBase, nodeContainer, draggableNode, editableText, satelliteOwner, statefulNode), folder responsibility cheatsheet.
2. [`02-rendering.md`](./02-rendering.md) — Pipeline render: `PageWrapper` → `NodeRenderer` → component, Vue reactivity + Pinia, stateful CSS injection (`<style v-if="stateCss">`).
3. [`03-drag-drop.md`](./03-drag-drop.md) — Drag-create (sidebar → canvas) + drag-move + Positioner + IndicatorOverlay + auto-scroll. Sidebar đã có 10 `Elements*Picker.vue`.
4. [`04-overlays.md`](./04-overlays.md) — Selection state, ElementToolbar, EdgeOverlays (padding/margin SVG strips), Layers panel (`SidebarLayer` + `LayerItem` + `LayerGroupWrapper` đọc registry).
5. [`05-extending.md`](./05-extending.md) ★ — Recipe thêm element folder-per-type (`nodes/<name>/{index.vue, meta.js, ai.js}`). Element catalog 15 type hiện có. Pattern stateful / satellite / locked / contenteditable.
6. [`06-troubleshooting.md`](./06-troubleshooting.md) — Lỗi thường gặp, cycle script, SFC compile check, checklist khi thêm/sửa element / store / Positioner / events / stateful.
7. [`07-traits-and-data.md`](./07-traits-and-data.md) ★ — 5 base namespace + `states` override namespace + responsive cascade (`mergeNamespace` / `mergeStateNs` / `mergeStateMap` / `mergeStateNode`). `DEFINITIONS_DATA` chia thành `defs/{layout,size,background,shape,typography,icon,media,behavior,image_comparison}.js`. 37 widget vue trong `components/fields/`. Events catalog (`eventDefinitions.js` + `events/engine.js` + `events/actions/*`). Stateful keys (group `stateful: true`) + `applyStateSchema`.
8. [`08-glossary.md`](./08-glossary.md) ★ — Variable abbreviations, key functions, file mapping, terms mới: `state`, `variant`, `statefulKeys`, `satellite`, `locked`, `isContentEditable`, `STYLE_ASYNC/CONFIG_ASYNC`, `templates`, `non-cascading`.
9. [`09-ai-page-generation.md`](./09-ai-page-generation.md) ★★ **REWRITTEN** — Từ "PLAN" → "IMPLEMENTED spec". Inventory đủ 13 file trong `composable/editor_v2/ai/` (schema, validate, commit, commitSite, buildPage, aiChat, aiSiteApi/Channel/Stream, mockStream, protocol, selftest, BACKEND_PLAN.md). Roadmap Phase 2/3 còn lại.
10. [`10-history.md`](./10-history.md) — Undo/Redo: `PatchRecorder`, `useHistoryStore`, `_commit` chokepoint, coalesce + throttle (300ms), selection restore. Actions có history: `move/reorderChildren/ungroup/remove/duplicate/addNode/addNodeTree/changeStyle|Config|Specials/reset*/addEvent/updateEvent/removeEvent/addBinding/updateBinding/removeBinding`.

## Tra cứu nhanh

### Cây thư mục (snapshot hiện tại)

```
src/
  composable/editor_v2/                ← Logic không phụ thuộc Vue SFC
    constants.js                       ← ROOT_NODE, BORDER_OFFSET, BREAKPOINTS (4 bp), PLACEHOLDER_IMAGE
    createNode.js                      ← createNode / createNodeTree / wrapTree / genId / buildFromDef
    registry.js                        ← Pure data: getDef, registerElement, isRootOnlyType, isLockedType, canDropInto, getAllowedKeys
    registerElements.js                ← Bootstrapper — eager glob nodes/*/index.vue
    nodeFactory.js                     ← Composite builders (wrapInBlankSection, buildBlankSection, buildRowSection)
    templateRegistry.js                ← Page-template lookup (`templates/*.js` glob eager)
    templates/
      hero.js                          ← Hero-section template (id, name, def)
    Positioner.js                      ← Drop placement engine (port craft.js)
    getDOMInfo.js                      ← DOM rect + flow direction
    findPosition.js                    ← Index + where trong list children
    movePlaceholder.js                 ← (unused)
    createShadow.js                    ← Drag preview ghost
    cssShorthand.js                    ← parseSides / formatSides
    draggableNode.js                   ← Methods: onMoveDragStart / onMoveDragEnd
    get.js                             ← getStyle / getConfig — đọc per-bp với cascade
    mergeNode.js                       ← mergeNamespace (2-phase cascade) + mergeStateNs/Map/Node (states ns) + NON_CASCADING (`hidden`)
    patchRecorder.js                   ← PatchRecorder class + compactPatches + applyPatches
    responsivePolicy.js                ← STYLE_ASYNC / CONFIG_ASYNC set; defaultStyleSlot / defaultConfigSlot
    mixins/
      nodeBase.js                      ← Props, isSelected, merged*, commonStyleData, click, change* shortcuts
      nodeContainer.js                 ← Mở rộng nodeBase: isEmpty, isDropTarget, onDragOver/Enter
      editableText.js                  ← Inline contenteditable (opt-in via meta.rules.isContentEditable)
      satelliteOwner.js                ← Lazy-create satellite child node (meta.satellite={type,configKey})
      statefulNode.js                  ← Inject CSS rule cho non-base variants (hover/active)
      index.js                         ← Barrel + nodeLeaf alias + re-export draggableNode

    ai/                                ← AI page-gen pipeline (IMPLEMENTED, xem doc 09)
      schema.js                        ← dumpRegistryForLLM, listElementSchemas
      validate.js                      ← validateDef / validatePage / validateSite
      commit.js                        ← commitAISectionToCanvas / commitAISectionsToCanvas
      commitSite.js                    ← commitAISite (async, persist multi-page)
      buildPage.js                     ← buildPagePayload (headless, không đụng node store)
      aiChat.js                        ← createAiChatSession (UI state machine)
      aiSiteApi.js                     ← AiSiteApi class (REST HTTP)
      aiSiteChannel.js                 ← createAiSiteChannel (Phoenix WS)
      aiSiteStream.js                  ← createAiSiteRunner + createRealPersistence
      mockStream.js                    ← createMockAiSiteTransport / createMockChat / createLocalPersistence
      protocol.js                      ← AI_SITE_TOPIC / AI_EVENTS / AI_COMMANDS / AI_ROUTES
      selftest.js                      ← runAiGenSelfTest (smoke verify)
      BACKEND_PLAN.md                  ← Spec BE Elixir partner cần implement

  stores/editor_v2/
    node.js                            ← Tree state + actions (move/reorder/ungroup/duplicate/remove/...) + _commit chokepoint + _routeState (stateful dispatch)
    dnd.js                             ← Drag session + Positioner lifecycle
    editor.js                          ← UI store (breakpointActive, leftSidebar*, settingDialogs[])
    history.js                         ← Undo/Redo timeline + coalesce + throttle
    page.js                            ← useEditorPageStore — page metadata + save/load qua pageApi
    pageList.js                        ← usePageListStore — site-level page list + create/delete/rename
    globalStyling.js                   ← useGlobalStylingStore — site-wide colors / fonts / spacing tokens

  components/editor_v2/
    PageWrapper.vue                    ← Editor entry — canvas + overlays + import registerElements
    Header.vue                         ← Top bar: bp tabs, breadcrumb, undo/redo, AI button, page picker
    Sidebar.vue                        ← Left sidebar shell
    Toolbar.vue                        ← Right context toolbar (legacy slot)
    Trait.vue                          ← Right trait panel — đọc getDef(type).traits
    nodes/                             ← 15 element folders (auto-registered)
      root_canvas/                     ← Page (system, hideInLayer, locked)
      flex_section/                    ← Section (isRootOnly, isContainer)
      flex_block/                      ← Block (isContainer)
      heading/                         ← Heading (isContentEditable)
      text/                            ← Text body
      button/                          ← Button (stateful: default/hover/active)
      image/                           ← Image
      image-comparison/                ← Image comparison (before/after slider)
      icon/                            ← Icon (Lucide picker)
      list/                            ← List container (uses satellite list_item)
      list_item/                       ← List item (composite child)
      tab/                             ← Tabs container (composite)
      tab_content/                     ← Tab content panel
      tab_item/                        ← Tab item button
      breadcrumb/                      ← Breadcrumb with separator
    elements/                          ← Editor chrome (non-node UI)
      NodeRenderer.vue                 ← Switcher đọc registry
      ElementDragV2.vue                ← Sidebar item drag wrapper
      ElementToolbar.vue               ← Floating toolbar trên selected
      EdgeOverlays.vue                 ← Padding/margin SVG strips
      IndicatorOverlay.vue             ← Drop indicator vạch xanh
      NodePlaceholder.vue              ← Empty-container placeholder
    components/
      PageEmpty.vue                    ← Canvas-trống placeholder
      SettingDialog.vue                ← Mount tất cả dialog popovers
      color_picker/                    ← ColorPicker + SolidColorPicker + InputHexColor + NodePicker
      sidebar/
        SidebarWrapper.vue / Sidebar*.vue ← Layer + element sidebar shells
        SidebarLayer.vue / LayerItem.vue / LayerGroupWrapper.vue ← Layers tree (đọc registry label/icon)
        ElementContainer.vue           ← Wrapper item picker
        ElementsLayoutPicker.vue       ← Layout group (Section + N-column rows + templates)
        ElementsHeadingPicker.vue
        ElementsTextPicker.vue
        ElementsButtonPicker.vue
        ElementsImagePicker.vue
        ElementsIconPicker.vue
        ElementsBreadcrumbPicker.vue
        ElementsListPicker.vue
        ElementsTabPicker.vue
        ElementsImageComparisonPicker.vue
      trait/
        ClassTrait.vue                 ← Custom class field
        components/
          TraitField.vue               ← Generic dispatcher
          TraitWrapper.vue / TraitItemWrapper.vue ← Group + field shell
          TraitAssetInput.vue          ← Asset (image/video) picker
          MediaUploader.vue
          SelectCustomOption.vue
          fields/                      ← 37 Vue widget
            WidthSelectTrait / HeightSelectTrait / PaddingTrait / PaddingMarginTrait / ContentWidthTrait
            DirectionTrait / VerticalTrait / HorizontalTrait / GapTrait / DisplayTrait
            BackgroundColorTrait / BackgroundImageTrait / BackgroundVideoTrait
            BorderTrait / CornerTrait / ShadowTrait / AnimationTrait
            FontSizeTrait / LineHeightTrait / FontFamilyTrait / TextStyleTrait / TextTransformTrait
            TextAlignTrait / TextSpacingTrait / TextColorTrait / TextGlobalStyleTrait
            IconPickerTrait / IconSizeTrait / IconColorTrait / IconGapTrait / IconPositionTrait
            ImageTrait / ImageComparisonTrait / ListItemsTrait / TabLayoutTrait
            HtmlTagTrait / ActionTrait
            iconCatalog.js / iconManifest.json  (icon picker assets)
            events/                    ← UrlEvent.vue / PageEvent.vue / PopupEvent.vue
        fields/                        ← Pure data (Vue-free)
          definitions.js               ← Re-export DEFINITIONS_DATA + getDefinitionData + normalizeResponsiveSlot
                                          + buildElementSchema + buildSatelliteSchema + applyStateSchema + collectStatefulWriteKeys
          defs/                        ← Domain split của DEFINITIONS_DATA
            index.js                   ← Merge tất cả groups
            layout.js                  ← direction / gap / vertical / horizontal / padding / padding_margin
            size.js                    ← width_select / height_select
            background.js              ← bg_color / bg_image / bg_video
            shape.js                   ← border / corner / shadow
            typography.js              ← font_size / font_family / text_align / text_color / text_style / text_global_style / line_height / text_spacing / text_transform / html_tag
            icon.js                    ← icon_picker / icon_size / icon_color / icon_gap / icon_position
            media.js                   ← image / asset
            behavior.js                ← animation / display / content_width / action
            image_comparison.js
          styleRenderers.js            ← (node) → CSS object (composed CSS cho border/corner/bg_image/...)
          registry.js                  ← VUE_COMPONENTS map: defKey → Vue widget
          schema_helpers.js            ← JSON Schema builders (string/number/oneOfEnum/cssSides/cssColor/...)
          eventDefinitions.js          ← EVENTS catalog (action types: openPage/openPopup/goToUrl) + validateEvents + EVENTS_AI
          enum.js                      ← Enum constants for typography/icon/...
          events/
            engine.js                  ← Runtime dispatcher event/action

  assets/editor_v2/
    node.css                           ← Global: wk-node-selected, wk-node-placeholder, wk-dragging, cursor
```

### Các khái niệm chính trong một câu

| Khái niệm | Tóm tắt |
|---|---|
| **Node** | `{ id, data:{type,style,config,specials,events,bindings,parent,nodes,custom,responsive}, dom }` |
| **NodeTree** | `{ rootNodeId, nodes }` — input cho `addNodeTree`, output từ factory hoặc `createNodeTree(def)` |
| **Element folder** | `nodes/<name>/{index.vue, meta.js, ai.js?}` — auto-register qua `import.meta.glob` |
| **Meta** | Pure data từ `meta.js` — type, label, traits, rules, defaults, satellite?, states?, events? |
| **AI sidecar** | Optional `ai.js` — description, hints, examples, semantics (lazy-loaded cho AI gen) |
| **Registry** | Map `type → { ...meta, factory(wrap), defaults, component, allowedKeys, renderers, statefulKeys }` |
| **Trait definition** | Entry trong `DEFINITIONS_DATA`: `{ writes: { writeKey: { target, schema } } }` |
| **Writes map** | Cho phép 1 widget multi-key dispatch (`padding` → style.padding + config.isPaddingLinked) |
| **Mixin** | `nodeBase`, `nodeContainer`, `draggableNode`, `editableText`, `satelliteOwner`, `statefulNode` |
| **Positioner** | Class tính drop placement, expose `computeIndicator(dropTargetId, x, y)` |
| **Indicator** | `events.indicator = { placement: { parent, index, where }, error }` |
| **Breakpoint** | `'desktop' \| 'laptop' \| 'tablet' \| 'mobile'` — slot key trong `data.responsive` (default `laptop`) |
| **Auto-wrap** | Drop non-Section vào ROOT → tự bọc trong `flex-section` (`wrapInBlankSection`) |
| **Style/Config/Specials/Events/Bindings** | 5 base namespace dữ liệu; chỉ `style` + `config` có per-bp responsive |
| **States** | Override namespace (`states[state] = { style, config }`, base + per-bp); hover/active variant overrides |
| **Cascade** | Desktop-first 2-phase: down (bp ≥ current) rồi up-fallback (bp < current, only missing) |
| **Non-cascading** | Key trong `NON_CASCADING` (vd `config.hidden`) chỉ áp dụng đúng bp của nó |
| **TraitField.onChange** | Dispatcher trong widget — route emit `(key, value)` → đúng `change[Style/Config/Specials]` theo `def.writes[key].target` |
| **buildElementSchema** | Pure `(meta) → JSON Schema` — mirror per-bp + state-overrides |
| **allowedKeys** | Precomputed Set whitelist per (type, ns) — guard trong `writeNamespaceWithRec` |
| **renderers** | Ordered `(node) → CSS` array, precomputed. Compose `commonStyleData` trong `nodeBase` |
| **State / Variant** | `meta.states = { base, variants: [{value,label}], groups? }` — UI cho hover/active editing |
| **statefulKeys** | Precomputed Set writeKey eligible per-state (collectStatefulWriteKeys) |
| **Satellite** | Child node ghi vào flat `nodes[]` map nhưng KHÔNG nằm trong `parent.data.nodes` (no Layers/reorder). Vd `tab` owner ↔ `tab-content` satellite. |
| **Locked** | `meta.rules.locked = true` → không delete/duplicate/drag riêng — chỉ cascade theo owner |
| **isContentEditable** | `meta.rules.isContentEditable = true` → `editableText` mixin bật dblclick → contenteditable |
| **PatchRecorder** | Mutate state + thu (forward, inverse) atomic. Dùng trong `_commit`. |
| **_commit** | Chokepoint node store: `$patch` + `PatchRecorder` + `history.record`. |
| **_routeState** | Khi `events.state ≠ base`, divert stateful writeKey (`def.statefulKeys`) → `states[state][ns]` namespace (per-bp). |

### Workflow phổ biến

| Việc cần làm | File cần mở |
|---|---|
| Thêm element mới | `nodes/<name>/{index.vue, meta.js}` + tùy chọn `ai.js` |
| Thêm trait widget mới | `components/trait/fields/defs/<group>.js` (+ `registry.js` + Vue file trong `components/fields/`) |
| Sửa trait writes của element | `nodes/<name>/meta.js` — `traits.general` / `traits.advanced` |
| Sửa drop rule | `meta.rules.canDropInto(parentType)` hoặc `Positioner.js` |
| Sửa visual selection | `assets/editor_v2/node.css` |
| Sửa toolbar | `elements/ElementToolbar.vue` |
| Sửa hover padding/margin | `elements/EdgeOverlays.vue` |
| Sửa rule auto-wrap | `stores/editor_v2/node.js#addNodeTree` + `#move` (qua `wrapInBlankSection`) |
| Sửa danh sách breakpoint | `composable/editor_v2/constants.js` `BREAKPOINTS` |
| Thêm template page | `composable/editor_v2/templates/<id>.js` — auto-register qua `templateRegistry.js` |
| Thêm action event | `components/trait/fields/events/actions/<name>.js` + add vào `eventDefinitions.js` `EVENTS` |
| Đổi default behavior responsive | `composable/editor_v2/responsivePolicy.js` (`STYLE_ASYNC` / `CONFIG_ASYNC`) |
| AI gen dump schema | `composable/editor_v2/ai/schema.js#dumpRegistryForLLM` |
| AI gen validate | `composable/editor_v2/ai/validate.js` |
| AI gen commit | `composable/editor_v2/ai/commit.js` (single canvas) hoặc `commitSite.js` (multi-page) |

## Quy ước đặt tên

- Element folder: `snake_case` (`flex_block/`, `image_comparison/`) — type string `kebab-case` (`flex-block`, `image-comparison`)
- Element SFC trong folder: luôn `index.vue` (không còn convention `XxxV2.vue`)
- CSS class: prefix `wk-` (web-cake), modifier `--`, element `__`
  - `wk-flex-block` / `wk-flex-block--drop-active` / `wk-node-placeholder__text`
- Mixin: camelCase (`nodeBase`, `nodeContainer`, `satelliteOwner`)
- Store: `useXxxStore` (Pinia convention) — kể cả các store mới như `useEditorPageStore` / `usePageListStore` / `useGlobalStylingStore`
- Trait def: `snake_case` (`width_select`, `bg_image`, `html_tag`) — writeKey thì giữ camelCase / CSS-style (`padding`, `--node-width`, `htmlTag`)

## Ngoài phạm vi hiện tại

- Multi-select / shift-click
- Lock / hide element trong Layers (UI — `locked` flag đã có nhưng UX toggle chưa làm)
- Inline rich-text editor (hiện chỉ plain contenteditable qua `editableText`)
- Keyboard nav (arrow chọn sibling, Esc deselect)
- Copy / paste qua system clipboard (chỉ có `duplicate`)
- AI inline-edit selected (Phase 2 — xem `09-ai-page-generation.md`)
- AI design tokens generation (palette / typography từ prompt) — Phase 3

Xem mục "Roadmap" trong `05-extending.md` và `09-ai-page-generation.md`.
