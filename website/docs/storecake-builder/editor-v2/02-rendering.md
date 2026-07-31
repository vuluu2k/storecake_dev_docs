---
sidebar_position: 3
title: 02 — Rendering Pipeline
---

# 02 — Rendering: từ URL đến pixel

Chương này đi **từng bước** từ lúc trình duyệt vào `/manage/:site_id/editor` cho tới lúc một chữ "Xin chào" hiện trên canvas.

---

## 1. Giai đoạn BOOT — `EditorV2.vue` mounted

File: `src/views/EditorV2.vue`

```
mounted()
 ├─ ① Dựng guard mobile
 │     matchMedia('(max-width: 639.98px)') → isMobileViewport
 │     (<640px: canvas view-only, phủ một lớp chặn pointer)
 │
 ├─ ② siteStore.getSite(siteId) → .getPublishNewest()      (không await)
 │
 ├─ ③ await productDatasetStore.getProductsList(siteId)
 │     nạp trang đầu danh sách sản phẩm cho picker "Store"
 │
 ├─ ④ await pageList.loadPages(siteId)
 │     lấy metadata mọi page + tự tạo các page mặc định còn thiếu
 │
 ├─ ⑤ Chọn page để mở:
 │       pageList.byId($route.query.page_id) ?? pageList.homePage
 │       → await page.loadPage(target.id)
 │       → nếu query khác id thật thì sửa lại URL (replace)
 │     Không có page nào? → thử localStorage 'temp_page_source_v2'
 │
 ├─ ⑥ Bật dirty-tracking
 │     watch(() => nodeStore.nodes, () => page.markDirty(),
 │           { deep: true, flush: 'sync' })
 │
 ├─ ⑦ beforeunload guard khi page.dirty
 └─ ⑧ Phím tắt: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z hoặc Ctrl+Y, Ctrl/Cmd+S
```

Hai chi tiết dễ vấp:

- **`flush: 'sync'` ở bước ⑥ là bắt buộc.** `loadPage` bật `loading = true` → `hydrate()` → tắt `loading`. `markDirty()` chỉ ghi khi `!loading`. Với flush mặc định (async), watcher chạy *sau* khi `loading` đã tắt → trang vừa load xong đã bị đánh dấu dirty. Sync flush khiến watcher chạy ngay trong lúc mutate, khi `loading` còn true.
- Watcher chỉ theo dõi `nodeStore.nodes`, **không** theo dõi cả store. Nhờ vậy click chọn / hover / kéo (nằm ở `nodeStore.events`) không làm trang thành dirty.

---

## 2. Giai đoạn LOAD — `page.loadPage(pageId)`

File: `src/stores/editor_v2/page.js`

```
loadPage(pageId)
 └─ pageApi.fetch(siteId, pageId)
      └─ setSource(pageId, res.data.source)
           ├─ nodeStore.hydrate(JSON.parse(source))
           ├─ preloadNodeFonts(nodeStore.nodes)
           └─ Promise.all([
                productDataset.ensureProducts(productBindingIds(nodes)),
                categoryDataset.ensureCategories(categoryBindingIds(nodes)),
              ])
```

- `hydrate(payload)` **thay toàn bộ** `nodes` và **xóa timeline history** (timeline cũ trỏ vào node của trang cũ). Payload thiếu / hỏng / không có `ROOT` ⇒ tạo ROOT rỗng.
- `preloadNodeFonts` quét mọi `--text-font-family` trong `style` base, mọi slot responsive, mọi state override, cộng thêm preset của global styling, rồi gọi `Font.loadFont()` cho từng họ chữ. Không có bước này thì text nhấp nháy đổi font sau khi render.
- `ensureProducts` / `ensureCategories` gom id trong `bindings[0].target` của mọi node rồi fetch một lượt — nếu bỏ, các element dataset sẽ render rỗng cho tới khi từng element tự fetch.

Chi tiết save / publish / switch: [chương 12](./12-page-lifecycle.md).

---

## 3. Giai đoạn RENDER — `PageWrapper.vue`

### 3.1 Cấu trúc DOM

```html
<div class="wk-editor-canvas">           <!-- container cuộn -->
  <div class="wk-editor-scale-wrapper">  <!-- giữ chỗ theo kích thước ĐÃ scale -->
    <div class="wk-editor-body">         <!-- mặt giấy trắng, width = width breakpoint -->
      <div id="editor-dnd-wrapper">
        <NodeRenderer node-id="ROOT" />
      </div>
      <PageEmpty v-if="isPageEmpty" />
    </div>
  </div>

  <Teleport to="body">
    <NodeHoverOverlay /> <NodeSelectedOverlay />
    <IndicatorOverlay /> <EdgeOverlays /> <ElementToolbar />
  </Teleport>
</div>
```

### 3.2 Zoom-to-fit tự động

Canvas **luôn giữ đúng chiều rộng thật của breakpoint** (desktop 1920, laptop 1440, tablet 768, mobile 360) rồi thu nhỏ bằng `transform: scale()`.

```js
raw   = (canvas.clientWidth - 16) / breakpointWidth
ratio = Math.min(1, Math.max(0.4, raw))   // chỉ thu nhỏ, sàn 40%
uiStore.canvasScale = ratio
```

- `.wk-editor-body` là `position: absolute`, `transform-origin: 0 0` → hộp chưa scale của nó không đẩy layout.
- `.wk-editor-scale-wrapper` giữ chỗ **kích thước sau khi scale** để vùng cuộn khớp với những gì mắt nhìn thấy.
- Hai `ResizeObserver` (một trên container, một trên body) gộp callback vào **một `requestAnimationFrame`** để tránh cảnh báo *ResizeObserver loop*.
- Đổi breakpoint không làm container đổi kích thước ⇒ observer không bắn ⇒ có watcher `breakpointActive` gọi lại thủ công.

> ⚠️ **Bẫy đã biết**: `getDOMInfo` trộn rect đã scale với margin chưa scale. Với node có margin lớn, vị trí thả có thể lệch một chút khi `canvasScale < 1`.

### 3.3 CSS global styling

`PageWrapper` watch `globalStylingStore.styleData.all` (immediate) và ghi vào một thẻ `<style id="wk-global-styles">` trong `<head>`; gỡ bỏ ở `beforeUnmount`. Đây là nơi các class `.wk-gs-heading-1`… ra đời.

---

## 4. `NodeRenderer` — switcher đệ quy duy nhất

```vue
<component
  :is="resolved" v-if="node && resolved"
  :node="node" :node-id="nodeId" :is-clone="isClone" :node-index="nodeIndex" />
<div v-else-if="node">[unknown: {{ node.data.type }}]</div>
```

```js
node()     { return this.nodes[this.nodeId] || null }
resolved() { return getDef(this.node.data.type)?.component ?? null }  // + console.warn nếu thiếu
```

Đệ quy:

```
NodeRenderer(ROOT)
  → getDef('root').component = RootCanvas
      v-for childId in node.data.nodes → <NodeRenderer :node-id="childId" />
          → FlexSection
              v-for → <NodeRenderer>
                  → FlexBlock → … → Heading / Text / Button (lá)
```

**Luật**: mọi container render con qua `<NodeRenderer>`, không import element khác trực tiếp — nếu không, registry mất tác dụng và element mới sẽ không hiện.

Ngoại lệ có chủ đích: `list-dataset` import thẳng `dataset-block/index.vue` để render **cùng một node** thành N thẻ sản phẩm ([chương 11](./11-dataset-binding.md)).

---

## 5. Bên trong một element — style ra đời như thế nào

Ví dụ `nodes/text-dataset/index.vue`:

```vue
<component :is="htmlTag" ref="root"
  :class="[nodeClassMap, globalStyleClass]"
  :style="datasetStyle"
  canvas-node-wrapper
  v-bind="{ ...nodeAttrs, ...editableAttrs }"
  v-on="{ ...nodeListenersBase, ...dragListeners }">
  <component :is="'style'" v-if="stateCss">{{ stateCss }}</component>
  …
</component>
```

Bốn nguồn ghép lại thành hình thức cuối cùng:

```
① :style  ← commonStyleData
     def.renderers.reduce((out, fn) => Object.assign(out, fn(node)))
     + parse specials.customCss
     ( renderers = [flexCanvas, canvasNodeWrapper, …theo thứ tự trait khai báo] )

② :class  ← nodeClassMap
     { 'wk-node-selected': isSelected,
       'wk-hidden': mergedConfig.hidden,
       …các class trong specials.className,
       'wk-drop-active': isDropTarget   ← chỉ với nodeContainer }
   + globalStyleClass ('wk-gs-heading-4' …)

③ <style> nội tuyến ← stateCss   (mixin statefulNode)
     [data-node-id="x"]:hover { … !important }

④ CSS toàn cục ← assets/editor_v2/node.css + #wk-global-styles
```

### 5.1 `nodeAttrs`

```js
{
  'data-node-id':    nodeId,      // Positioner, overlay, stateCss selector đều dựa vào cái này
  'data-node-type':  type,
  'data-node-index': nodeIndex,   // bản render thứ mấy
  draggable:         locked ? 'false' : 'true',
}
```

### 5.2 Hai attribute đánh dấu cho renderer

`flexCanvas` và `canvasNodeWrapper` chỉ trả về CSS khi element **thật sự có** attribute tương ứng trên DOM:

```js
if (node.data.type == 'flex-section' || !node.dom?.hasAttribute('canvas-flex')) return {}
```

Nghĩa là muốn nhận biến `--node-width` / `--node-height` / `--node-margin-*`, element phải viết `canvas-node-wrapper` trên thẻ gốc; muốn nhận `--layout-direction` / `--layout-vertical` / `--layout-horizontal`, phải viết `canvas-flex`.

> Đây là nguyên nhân số một của lỗi "chỉnh width trong panel mà element không đổi": thiếu attribute trên thẻ gốc, hoặc `ref="root"` chưa được gắn nên `node.dom` còn `null`.

### 5.3 `stateCss`

`statefulNode` chỉ sinh CSS cho các key **thực sự bị override** ở state đó:

```js
override = mergeStateMap(node, 'hover', bpActive)   // { '--text-color': '#f00' }
defKeys  = override.keys → map ngược về def key    // { 'text_color' }
body     = declsToCss(renderStateDecls(node, 'hover', defKeys), /* !important */ true)
css      = `[data-node-id="x"]:hover{${body}}`
```

`!important` là bắt buộc vì style base được gắn inline (`:style`), mà inline luôn thắng rule ngoài.

---

## 6. Reactivity — vì sao mọi thứ tự cập nhật

- `nodeBase` dùng `mapState(useNodeStore, ['events'])` và `mapState(useUIStore, ['breakpointActive', …])`.
- `mergedStyle` / `mergedConfig` phụ thuộc `node.data.*` **và** `breakpointActive` → đổi breakpoint là mọi node tính lại.
- `commonStyleData` gọi các renderer, các renderer lại gọi `getStyle/getConfig` → cũng đọc `breakpointActive` từ store → cũng reactive.
- Store mutate qua `$patch` trong `_commit` ⇒ một lần thông báo cho toàn bộ subscriber, không phải N lần.

Ba lỗi reactivity hay gặp:

| Triệu chứng | Nguyên nhân |
|---|---|
| Sửa trait mà canvas không đổi | Ghi thẳng vào `node.data.x` thay vì gọi action; hoặc key bị `allowedKeys` chặn |
| Đổi breakpoint mà style không đổi | Element đọc `node.data.style.x` trực tiếp thay vì `mergedStyle.x` / `getStyle()` |
| Overlay bám sai vị trí | `ref="root"` đặt sai thẻ, hoặc quên `nodeIndex` khi render nhiều bản |

---

## 7. Ba trạng thái đặc biệt của canvas

| Trạng thái | Hiển thị | Điều kiện |
|---|---|---|
| Trang trống | `PageEmpty.vue` giữa canvas | `nodes.ROOT.data.nodes.length === 0` |
| Container rỗng | `NodePlaceholder.vue` | `nodeContainer.isEmpty` |
| Dataset chưa chọn nguồn | `SelectDataset.vue` ("Select a product") | `dataset.notShowContent` — chưa có `id` và cha không phải nhóm dataset |

---

## 8. Bỏ chọn

`PageWrapper` gắn listener click lên `.wk-editor-body`:

```js
this._onEditdorBodyClick = (e) => { e.stopPropagation(); this.nodeStore.setSelected(null) }
```

Node con `stopPropagation` trong `nodeBase.onClick`, nên click trúng node thì chọn node; click vào khoảng trống của mặt giấy thì bỏ chọn.
