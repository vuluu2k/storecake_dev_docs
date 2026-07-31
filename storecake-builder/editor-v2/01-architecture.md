# 01 — Kiến trúc

Chương này trả lời: **dữ liệu trông như thế nào**, **ai giữ dữ liệu đó**, và **`type` được nối với component ra sao**.

---

## 1. Bốn tầng

Editor V2 chia theo *mức độ phụ thuộc Vue*, không phải theo feature. Đây là điều quan trọng nhất cần nhớ vì nó quyết định file nào được phép import file nào.

```
┌─────────────────────────────────────────────────────────────┐
│ TẦNG 4 — CHROME (Vue)                                       │
│ Header · Toolbar (tool rail) · Sidebar · Trait · overlays    │
│ Không render node, chỉ đọc/ghi store.                        │
├─────────────────────────────────────────────────────────────┤
│ TẦNG 3 — ELEMENT (Vue)                                      │
│ nodes/<type>/index.vue — render một node ra DOM.             │
│ Dùng mixin để lấy sẵn style đã merge, listener drag, v.v.    │
├─────────────────────────────────────────────────────────────┤
│ TẦNG 2 — STATE (Pinia)                                      │
│ 11 store. Sự thật duy nhất. Component không giữ state trang. │
├─────────────────────────────────────────────────────────────┤
│ TẦNG 1 — LOGIC THUẦN (JS)                                   │
│ composable/editor_v2/*.js — chạy được bằng plain Node,       │
│ không import .vue. Nhờ vậy script CI validate được schema.   │
└─────────────────────────────────────────────────────────────┘
```

**Luật vàng về import**: tầng dưới **không bao giờ** import tầng trên.

Ngoại lệ được kiểm soát duy nhất là `registerElements.js` — file này cố tình import toàn bộ SFC element, và **chỉ được import một lần, từ `PageWrapper.vue`**. Nếu để glob đó nằm trong `registry.js` thì sẽ tạo vòng lặp `store → registry → SFC → mixin → store` và vỡ TDZ lúc khởi động.

---

## 2. Data model — một node trông như thế nào

`useNodeStore().nodes` là **map phẳng**, không phải cây lồng nhau:

```js
nodes: {
  'ROOT':             { … },
  'heading-a1b2c3d4': { … },
  'text-e5f6g7h8':    { … },
}
```

Một node đầy đủ:

```js
{
  id: 'heading-a1b2c3d4',
  data: {
    type: 'heading',              // khóa tra registry
    name: 'Heading',              // nhãn ở Layers (factory seed từ meta.label)

    // ─── 5 namespace dữ liệu ───────────────────────────────
    style:    { '--text-color': '#111' },          // CSS,   CÓ responsive
    config:   { textGlobalStyle: 'heading-2' },    // data,  CÓ responsive
    specials: { htmlTag: 'h2', text: 'Xin chào' }, // base-only
    events:   [ { id: 'EVENT_x', name: 'click', action: 'openPage', … } ],
    bindings: [ { id: 'BINDING_x', target: { type:'product', kind:'title', id:'…' } } ],

    // ─── override theo state (hover / active) ──────────────
    states: { hover: { style: {…}, config: {…} } },

    // ─── biến thể theo breakpoint ──────────────────────────
    responsive: {
      mobile: { style: {…}, config: {…}, states: { hover: {…} } },
    },

    // ─── quan hệ cây ───────────────────────────────────────
    parent: 'flex-block-xxxx',
    nodes:  ['text-e5f6g7h8'],   // id các con, ĐÚNG thứ tự hiển thị

    isCanvas: false,   // true = chứa được con (drop target)
    hidden:   false,
    custom:   {},
  },

  // ─── runtime, KHÔNG serialize ───────────────────────────
  dom:  HTMLElement | null,   // = doms[0]
  doms: { 0: el, 1: el, … },  // nhiều bản render — xem §6
  events: {},                 // túi listener runtime (tên giữ cho Positioner)
}
```

### 2.1 Vì sao chia 5 namespace?

| Namespace | Nội dung | Responsive? | Override theo state? |
|---|---|---|---|
| `style` | Thuộc tính CSS / CSS var mà renderer biến thành style inline | ✅ | ✅ |
| `config` | Dữ liệu *không phải CSS* nhưng có thể khác nhau theo màn hình (số cột, tỉ lệ ảnh, ẩn/hiện) | ✅ | ✅ |
| `specials` | Thuộc tính HTML / metadata: `text`, `htmlTag`, `className`, `customCss` | ❌ base-only | ❌ |
| `events` | Hành vi khi click: mở trang, mở popup, đi tới URL, mở giỏ, checkout | ❌ | ❌ |
| `bindings` | Nối node với dữ liệu thật (sản phẩm / collection) — [chương 11](./11-dataset-binding.md) | ❌ | ❌ |

Ranh giới `style` vs `config` **không phải** "CSS hay không CSS" mà là **"renderer có biến nó thành CSS không"**. Ví dụ `imageRatio` nằm ở `config` vì component tự tính chứ không đổ thẳng ra `style=""`.

### 2.2 Cây nằm ở hai chỗ và phải luôn khớp

`node.data.nodes[]` (danh sách con có thứ tự) và `child.data.parent` (con trỏ ngược). Mọi action trong node store luôn cập nhật **cả hai** trong cùng một `_commit`. Nếu chỉ sửa một phía, Layers panel và Positioner sẽ nhìn thấy hai cây khác nhau.

Ngoại lệ có chủ đích: **satellite** — node có `parent` nhưng **không** nằm trong `parent.data.nodes` (§7).

---

## 3. Mười một store

| Store | File | Giữ gì |
|---|---|---|
| `useNodeStore` | `node.js` | Cây node + toàn bộ action ghi + `events` (`selected` / `hovered` / `dragged` / `indicator` / `state`) |
| `useDndStore` | `dnd.js` | Phiên kéo thả đang chạy: `dragTarget`, shadow DOM, instance `Positioner` |
| `useUIStore` | `editor.js` | View state: `breakpointActive`, `toolbarKeyActive`, `leftSidebarKeyActive`, `settingDialogs[]`, `canvasScale`, `selectionAnchorEl`, `animationPreviewNodeId`, `accordionItemIndexActive` |
| `useHistoryStore` | `history.js` | Timeline patch undo/redo + coalesce |
| `useEditTextStore` | `edittext.js` | Có đang inline-edit không, editor Tiptap đang sống, trạng thái B/I/U của vùng chọn |
| `useEditorPageStore` | `page.js` | Trang đang mở: `pageId`, `loading/saving/publishing`, `dirty`; `loadPage` / `savePage` / `publishSite` / `switchPage` |
| `usePageListStore` | `pageList.js` | Danh sách page của site + cache `sources[pageId]` + tự tạo page mặc định |
| `usePageActionStore` | `pageAction.js` | State dialog rename / duplicate / copy-to-page / delete |
| `useGlobalStylingStore` | `globalStyling.js` | Preset typography toàn site (`heading-1`…`text-3`) → sinh CSS inject vào `<head>` |
| `useProductDatasetStore` | `product_dataset.js` | Fetch + cache sản phẩm (`products` cho picker, `productsSaved` cho canvas) |
| `useCategoryDatasetStore` | `category_dataset.js` | Tương tự cho collection, thêm feed `allCollections` |

Ranh giới cần tôn trọng:

- `useNodeStore` **chỉ** biết cây node. Không biết page id, không gọi API.
- `useEditorPageStore` **chỉ** biết persistence. Nó gọi `nodeStore.serialize()` / `hydrate()` chứ không đụng từng node.
- `useUIStore` **chỉ** biết giao diện editor. Không có gì trong đây được lưu xuống BE.

---

## 4. Registry — nối `type` với component

### 4.1 Lúc boot

`PageWrapper.vue` import `registerElements.js` (side-effect). File này glob eager mọi `nodes/*/index.vue`:

```js
const modules = import.meta.glob('@/components/editor_v2/nodes/*/index.vue', { eager: true })
for (const path in modules) {
  const m = modules[path]
  if (m && m.meta) registerElement(m.meta, m.default)
}
```

Mỗi element folder phải export **hai** thứ từ `index.vue`:

- `export default` → component Vue
- `export const meta` → dữ liệu thuần, thường viết `{ ...baseMeta, factory }` với `baseMeta` import từ `meta.js` cạnh bên

Vì sao tách `meta.js`? Vì `meta.js` **không import Vue** → script CI (`scripts/validate-trait-schemas.mjs`) đọc được bằng plain Node.

### 4.2 `registerElement` tính sẵn 5 thứ

Điểm dễ bỏ sót: registry **không lưu meta nguyên xi**, nó *tính trước* để runtime khỏi phải đi lại `traits` mỗi lần render.

```js
reg[meta.type] = { ...meta, factory, defaults, allowedKeys, renderers, statefulKeys, component }
```

| Trường tính sẵn | Là gì | Ai dùng |
|---|---|---|
| `factory` | Factory gốc **được bọc thêm một lớp**: điền `meta.defaults` vào key node chưa có (fill-missing, override thắng default), seed `data.name` từ `meta.label`, seed `responsive` và `states` mặc định | `createNodeTree`, `factoryFor` |
| `defaults` | `meta.defaults` chuẩn hóa đủ 5 khóa `{style, config, specials, states, responsive}` | nút "Reset to default" |
| `allowedKeys` | `Set` writeKey hợp lệ theo từng namespace, **trích ra từ `meta.traits`** | `writeNamespaceWithRec` trong node store — key lạ bị **drop kèm `console.warn`** |
| `renderers` | Mảng hàm `(node) → object CSS` theo thứ tự khai báo trait; luôn mở đầu bằng `flexCanvas` + `canvasNodeWrapper` | `nodeBase.commonStyleData` |
| `statefulKeys` | `Set` writeKey được phép lưu riêng cho state hover/active | `node._routeState` |

Hệ quả thực tế:

> **Trait không khai trong `meta.traits` thì `changeStyle` / `changeConfig` sẽ chặn key đó.**
> Thấy log `unknown key 'xxx' (not declared in traits) — dropped` là do đây, không phải lỗi store.

`allowedKeys` rỗng ⇒ store **bỏ qua** kiểm tra (dành cho node hệ thống / node cũ không khai trait).

### 4.3 API tra cứu

```js
getDef(type)                     // → entry registry đầy đủ (hoặc null)
listSidebar()                    // → các def có showInSidebar
isRootOnlyType(type)             // meta.rules.isRootOnly
isLockedType(type)               // meta.rules.locked
canDropInto(srcType, parentType) // meta.rules.canDropInto(parentType)
getNodeChildAllows(type)         // meta.rules.nodeChildAllows → whitelist type con
factoryFor(type, overrides)      // tạo node mới đã seed defaults
getAllowedKeys(type, ns)         // Set | null
getDefaultsFor(type)
```

---

## 5. Mixin — để element viết ít code nhất có thể

`composable/editor_v2/mixins/index.js` là barrel:

| Mixin | Cho ai | Cung cấp |
|---|---|---|
| `nodeBase` | mọi element | props (`node`, `nodeId`, `isClone`, `nodeIndex`), `mergedStyle` / `mergedConfig` / `mergedSpecials`, `commonStyleData`, `nodeAttrs`, `nodeClassMap`, `nodeListenersBase`, `onClick`; đăng ký `dom` vào store ở `mounted/updated/beforeUnmount`; patch animation preview |
| `nodeLeaf` | element lá | `nodeBase` + `editableText` |
| `nodeContainer` | element chứa con | `nodeBase` + `isEmpty`, `isDropTarget`, `dropListeners`, thêm class `wk-drop-active` |
| `draggableNode` | element kéo được | `dragListeners` = `{ dragstart, dragend }` |
| `editableText` | element sửa text tại chỗ | `isEditing`, `textEditor`, `startEdit/finishEdit`, `editableAttrs/editableListeners` — **inert** nếu `meta.rules.isContentEditable` không bật |
| `satelliteOwner` | element có node con "ẩn" | `ensureSatellite()`, `getSatelliteNode(configKey)`, `setSatelliteDom()` |
| `statefulNode` | element có hover/active | computed `stateCss` → SFC render `<component :is="'style'">` |
| `dataset` | element bind dữ liệu | `nodeLeaf + draggableNode + statefulNode` cộng thêm `binding` / `target` / `type` / `kind` / `id` / `item`, `getValue()`, `resolveFieldValue()` — [chương 11](./11-dataset-binding.md) |

Khai báo điển hình:

```js
mixins: [nodeContainer, draggableNode]           // container thường
mixins: [nodeLeaf, draggableNode]                // lá có text
mixins: [nodeLeaf, draggableNode, statefulNode]  // nút có hover
mixins: [dataset]                                // element dữ liệu (đã gộp 3 cái trên)
```

---

## 6. `dom` vs `doms` — một node, nhiều bản render

Trước đây mỗi node chỉ có một element DOM. Điều đó **không còn đúng**: `list-dataset` render *cùng một* node `dataset-block` cho N sản phẩm, `text-marquee` nhân bản item để chạy vòng lặp.

Vì vậy:

```js
setDOM(id, el, index = 0)   // node.doms[index] = el;  index 0 gán luôn vào node.dom
```

- `node.dom` = bản render đầu tiên — Positioner và các phép đo cũ vẫn dùng.
- `node.doms[i]` = bản render thứ i.
- Component nhận prop `isClone` + `nodeIndex` để tự đăng ký đúng slot.
- Khi người dùng click, `nodeBase.onClick` lưu **đúng element vừa click** vào `uiStore.selectionAnchorEl`; overlay và toolbar bám theo element đó thay vì luôn bám bản số 0.

Cả `dom` lẫn `doms` đều `markRaw` — DOM node tuyệt đối không để Vue theo dõi reactive.

---

## 7. Satellite — node con nằm ngoài cây

Một số element cần node con *chỉnh trait riêng được* nhưng **không** được hiện trong Layers, không kéo được, không xóa riêng được. Ví dụ: nút của một `tab`, header của một `accordion-item`.

Giải pháp: **satellite**.

```js
// trong meta
satellite: [{ type: 'tab-item', configKey: 'tabItemId' }]
```

- Node satellite được tạo **lười** ở `mounted`, qua `satelliteOwner.ensureSatellite()`.
- Nó vào `nodes` map và có `data.parent = owner.id`…
- …nhưng **không** vào `owner.data.nodes` → Layers / Positioner / reorder không thấy.
- Owner giữ id của nó ở `config[configKey]`.
- `duplicate()` và `remove()` trong node store có nhánh riêng quét satellite: tìm node có `parent` nằm trong tập đang xử lý nhưng **không** nằm trong `data.nodes` của owner.

`meta.satellite` nhận **cả object đơn lẫn mảng** — một owner có thể có nhiều satellite.

---

## 8. Chokepoint ghi state: `_commit`

Mọi action ghi vào cây đều đi qua đúng một hàm:

```js
_commit(label, mutateFn, opts = {}) {
  const selectedBefore = [...this.events.selected]
  let rec
  this.$patch((state) => {
    rec = new PatchRecorder(state)   // rec.set / rec.insert / rec.remove
    mutateFn(rec, state)             // vừa mutate, vừa thu patch
  })
  if (!rec || !rec.hasChanges()) return
  if (!opts.silent) {
    useHistoryStore().record(rec.getForward(), rec.getInverse(), label, {
      key: opts.key || label,
      throttleMs: opts.throttleMs || 0,
      selectedBefore,
      selectedAfter: [...this.events.selected],
    })
  }
}
```

Nhờ vậy bạn được **miễn phí**: undo/redo, gộp thao tác kéo liên tục thành một entry, khôi phục selection khi undo. Chi tiết ở [chương 10](./10-history.md).

> Viết action mới mà mutate `this.nodes` trực tiếp thay vì qua `_commit` thì thao tác đó **không undo được** và có thể làm lệch timeline.

Action đi qua `_commit`:
`move` · `reorderChildren` · `ungroup` · `remove` · `duplicate` · `addNode` · `addNodeTree` · `changeStyle` · `changeConfig` · `changeSpecials` · `resetStyle/Config/Specials` · `resetNodeToDefault` · `addEvent/updateEvent/removeEvent` · `addBinding/updateBinding/removeBinding`.

Cố ý **không** đi qua: `setSelected` · `setDOM` · `addDetachedNode` · `setState` · `setIndicator` — đều là state runtime, không phải nội dung trang.

---

## 9. Đọc dữ liệu node: `merged*` và `get*`

Hai đường đọc, dùng đúng chỗ:

**Trong component element** — computed của `nodeBase`:

```js
this.mergedStyle      // mergeNamespace(node, 'style', bpActive)
this.mergedConfig
this.mergedSpecials   // = node.data.specials (không cascade)
this.commonStyleData  // chạy hết def.renderers + parse specials.customCss
```

**Ngoài component** (trait widget, util, store) — helper của `get.js`:

```js
getStyle(node, key, fallback, { breakpoint })   // có cascade
getConfig(node, key, fallback, { breakpoint })
getSpecials(node, key, fallback)                // không cascade
```

Cả hai đều đi qua `mergeNamespace` nên **luật cascade chỉ có một**: xem [chương 07 §4](./07-traits-and-data.md).

---

## 10. Checklist đọc code lần đầu

1. `stores/editor_v2/node.js` — đọc `state()` và danh sách `actions`. Đây là bộ xương.
2. `nodes/heading/meta.js` + `nodes/heading/index.vue` — đối chiếu `traits` với panel bên phải trong app.
3. `composable/editor_v2/registry.js` — hiểu `registerElement` tính sẵn những gì.
4. `components/editor_v2/elements/NodeRenderer.vue` — ~30 dòng, là toàn bộ cơ chế render.
5. `components/editor_v2/Trait.vue` — hiểu panel phải chỉ đọc `meta.traits` chứ không biết element nào.

Xong 5 file đó là nắm khoảng 70% hệ thống.
