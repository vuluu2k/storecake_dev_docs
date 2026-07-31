# 06 — Troubleshooting

Bắt đầu từ triệu chứng, đi ngược về nguyên nhân.

---

## 1. Bốn lệnh debug nên thuộc

```js
// Node store được expose ra window (cuối stores/editor_v2/node.js)
window.node.nodes                          // toàn bộ cây
window.node.events                         // selected / hovered / dragged / indicator / state
window.node.nodes['heading-abc'].data      // dữ liệu một node

// Trong console của editor
$vm = document.querySelector('[data-node-id="heading-abc"]')   // tìm DOM của node
```

```bash
# Kiểm tra schema trait sau khi sửa meta / defs
npx --yes vite-node@0.34.6 scripts/validate-trait-schemas.mjs
```

Ngoài ra: mở tab Console lọc theo `[editor_v2]` — hầu hết guard trong hệ thống đều `console.warn` với tiền tố này.

---

## 2. Element không hiện

| Kiểm tra | Cách xác nhận |
|---|---|
| `index.vue` có `export const meta` không? | Console lúc boot: `[editor_v2/registerElements] skipped (no meta export)` |
| `meta.type` có rỗng không? | `[editor_v2/registry] registerElement: missing meta.type` |
| Node có `type` khớp `meta.type` không? | Canvas hiện `[unknown: xxx]`; console `No component registered for type` |
| Có nằm đúng `nodes/<folder>/index.vue` không? | Glob chỉ bắt đúng mẫu này |
| `PageWrapper` có được mount không? | `registerElements` chỉ chạy khi PageWrapper mount |

---

## 3. Trait chỉnh mà không có gì xảy ra

Đi theo thứ tự:

1. **Console có `unknown key '…' (not declared in traits) — dropped`?**
   → writeKey chưa được khai trong `meta.traits`. Thêm trait, hoặc khai `{ key: TRAIT.X, visible: false }` để hợp lệ hóa mà không vẽ UI.

2. **Giá trị có vào `node.data` không?**
   `window.node.nodes[id].data.style` — nếu có thì lỗi nằm ở phía render.

3. **Element có bind `:style="commonStyleData"` không?**
   Nhiều element trộn thêm: `{ ...this.commonStyleData, ...this.animationStylePatch }`. Thiếu `commonStyleData` là mất sạch trait.

4. **Thẻ gốc có attribute đánh dấu không?**
   `canvas-node-wrapper` cho `--node-width/height/margin`, `canvas-flex` cho `--layout-*`. Renderer kiểm tra `node.dom.hasAttribute(...)` và trả `{}` nếu không có.

5. **`ref="root"` có gắn đúng thẻ gốc không?**
   Không có thì `node.dom` là `null` → hai renderer trên tự bỏ qua, overlay cũng mù.

6. **Trait có nằm trong nhóm `stateful` và đang ở state khác base không?**
   Khi đó giá trị được ghi vào `data.states[state]`, không phải `data.style`.

---

## 4. Vấn đề responsive

| Triệu chứng | Nguyên nhân | Xử lý |
|---|---|---|
| Chỉnh ở mobile mà desktop cũng đổi | Key không nằm trong `STYLE_ASYNC` / `CONFIG_ASYNC` ⇒ ghi vào base | Thêm key vào Set tương ứng trong `responsivePolicy.js` |
| Chỉnh ở desktop mà mobile không đổi | Slot mobile đã có giá trị riêng, thắng theo ưu tiên 1 | Đúng hành vi; reset slot mobile nếu muốn |
| Đổi breakpoint mà style không đổi | Element đọc `node.data.style.x` trực tiếp | Dùng `mergedStyle` hoặc `getStyle(node, key)` |
| Ẩn ở desktop kéo theo ẩn ở mobile | Key `hidden` bị ghi vào base | `hidden` nằm trong `NON_CASCADING` — kiểm tra đường ghi |
| Giá trị lạ "từ đâu ra" | Fallback lên từ breakpoint hẹp hơn (ưu tiên 4) | Đây là thiết kế, xem [07 §4.2](./07-traits-and-data.md) |

---

## 5. Vấn đề kéo thả

| Triệu chứng | Kiểm tra |
|---|---|
| Không có vạch định vị | Container có mixin `nodeContainer` và bind `dropListeners` chưa? |
| Kéo con nhưng chọn nhầm cha | Thiếu `e.stopPropagation()` trong `dragstart` |
| Luôn thả ra ngoài container | Container quá nhỏ ⇒ toàn vùng viền. Xem `isNearBorders` (`min(16px, span*0.2)`) |
| Thả xong không có gì | `window.node.events.indicator.error` có giá trị? Xem `nodeChildAllows` / `isRootOnly` |
| Node lơ lửng ngoài section | Auto-wrap chỉ chạy khi `parentId === ROOT` |
| Kéo item picker nhưng id trùng | Prop `tree` truyền object cố định thay vì hàm |
| Vị trí thả lệch khi canvas thu nhỏ | Bẫy đã biết: `getDOMInfo` trộn rect đã scale với margin chưa scale |

---

## 6. Vấn đề overlay / toolbar

| Triệu chứng | Kiểm tra |
|---|---|
| Khung chọn lệch | `ref="root"` sai thẻ; hoặc node render nhiều bản mà thiếu `nodeIndex` |
| Khung bám sai bản sao | `onClick` không gán `selectionAnchorEl`, hoặc gán **trước** `setSelected` (bị xóa) |
| Toolbar không hiện | Node là ROOT, hoặc `config.hidden` đang bật |
| Duplicate/Delete tác động nhầm node | Xem `meta.rules.toolbarTarget` |
| Dải padding không hiện | `meta.rules.edgeOverlay` là `false` hoặc `{ padding: false }` |
| Popover chui xuống dưới sidebar | z-index portal của ui-kit (~1001) < `--wk-z-sidebar-wrapper` (1100) — nâng thủ công |

---

## 7. Vấn đề dataset / binding

| Triệu chứng | Kiểm tra |
|---|---|
| Luôn hiện "Select a product" | `bindings[0].target.id` còn `''`; hoặc `notShowContent` tính sai vì cha không thuộc `parentTypes` |
| Đã chọn nhưng canvas trống | `productsSaved[id]` chưa có ⇒ thiếu `setProductSaved` / `ensureProducts` |
| Mọi thẻ trong danh sách giống nhau | `provide('datasetItem')` / prop `:dataset-item` bị đứt |
| Danh sách trống | Chưa hydrate collection — xem bảng ở [11 §9.1](./11-dataset-binding.md) |
| Đổi ảnh ở thẻ này kéo theo thẻ kia | Khóa `productImageState` thiếu product id |
| Nhóm trait sai với `kind` | Chuỗi truyền vào `isVisibleByKind` phải là `"${type}::${kind}"` |
| Giá sai định dạng | `siteStore.site.currency` chưa nạp (`getSite` chạy không `await`) |

---

## 8. Vấn đề undo / redo

| Triệu chứng | Kiểm tra |
|---|---|
| Thao tác không undo được | Action mutate `this.nodes` trực tiếp, hoặc dùng `silent: true` |
| Một cú kéo tạo hàng trăm entry | Thiếu `throttleMs`, hoặc `key` thay đổi mỗi lần |
| Hai thao tác bị gộp làm một | Trùng `key` trong cửa sổ 300ms |
| Undo xong canvas trắng | `hydrate` không gọi `history.clear()` |
| Redo mất sau khi sửa | Đúng hành vi — sửa mới cắt nhánh redo |

---

## 9. Vấn đề lưu / đổi trang

| Triệu chứng | Kiểm tra |
|---|---|
| Trang vừa load đã dirty | Watcher `nodes` thiếu `flush: 'sync'` |
| Nút Save luôn xám | `page.dirty` false hoặc `page.pageId` null |
| Đổi trang mất thay đổi | `switchPage({ saveDirty: false })` mà không tự `savePage()` |
| Publish thiếu thay đổi mới | Publish chụp bản đã lưu — kiểm tra `savePage()` thành công chưa |
| Duplicate làm hỏng trang gốc | Thiếu `remapPageNodeIds` ⇒ hai trang chung id node |
| Canvas trắng khi đổi trang | `sources[pageId]` cache chuỗi hỏng → `parsePageSource` trả `null` |

---

## 10. Vấn đề inline text

| Triệu chứng | Kiểm tra |
|---|---|
| Double-click không vào chế độ sửa | Thiếu `rules.isContentEditable` hoặc chưa bind `editableListeners` |
| Bấm nút toolbar là editor tắt | Thiếu `@mousedown.prevent` trên container toolbar |
| Kéo picker màu làm editor mất | `applyColor` đang gọi `focus()` |
| Nội dung bị bọc thêm `<p>` | Dùng `Document` mặc định thay vì `InlineDocument` |
| Đổi màu ở panel mà chữ bôi đỏ vẫn đỏ | `STRIP_INLINE_KEYS` thiếu key, hoặc node không `isContentEditable` |

---

## 11. Vòng lặp import (TDZ)

Triệu chứng: `Cannot access 'X' before initialization` ngay khi vào editor, hoặc store `undefined` trong mixin.

Nguyên nhân luôn là **tầng dưới import tầng trên**:

```
❌ registry.js       import nodes/*.vue
❌ constants.js      import store
❌ meta.js           import .vue hoặc import store
❌ createNode.js     import registry ở top-level dùng ngay lúc load
```

Quy tắc:

- `registerElements.js` là **file duy nhất** được import SFC element, và **chỉ `PageWrapper.vue`** được import nó.
- `constants.js`, `createNode.js`, `mergeNode.js`, `responsivePolicy.js` phải giữ dependency-free.
- `meta.js` chỉ được import `enum.js`, `visible.js` và các module dữ liệu thuần khác.

---

## 12. Checklist trước khi báo xong

**Thêm/sửa element**
- [ ] `meta.js` không import Vue
- [ ] `index.vue` export cả `default` lẫn `meta`
- [ ] Thẻ gốc có `ref="root"`, `nodeAttrs`, `nodeListenersBase`, `nodeClassMap`, `commonStyleData`
- [ ] Có `canvas-node-wrapper` / `canvas-flex` nếu dùng các biến tương ứng
- [ ] Container: có `dropListeners` + `NodePlaceholder` khi rỗng + render con qua `NodeRenderer`
- [ ] Chạy `validate-trait-schemas.mjs`
- [ ] Thử đủ 4 breakpoint, undo/redo, duplicate, delete

**Thêm/sửa trait**
- [ ] Def nằm đúng file nhóm trong `defs/`
- [ ] `writes[key].target` đúng namespace
- [ ] Đăng ký widget trong `trait/fields/registry.js`
- [ ] Cân nhắc thêm key vào `STYLE_ASYNC` / `CONFIG_ASYNC`
- [ ] Cần CSS thì thêm renderer vào `styleRenderers.js` **cùng key**
- [ ] Khai trait trong `meta.traits` của element cần dùng

**Sửa store / action**
- [ ] Mutate qua `_commit`, không đụng `this.nodes` trực tiếp
- [ ] Có `key` + `throttleMs` nếu là hot path
- [ ] Cập nhật **cả** `data.nodes[]` lẫn `data.parent`
- [ ] Xử lý satellite (node có `parent` nhưng ngoài `data.nodes`)
