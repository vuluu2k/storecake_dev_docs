# 12 — Vòng đời Page

Load, save, publish, đổi trang, theo dõi dirty, và global styling. Đây là phần "ngoài canvas" nhưng quyết định dữ liệu có được giữ hay mất.

---

## 1. Ba store, ba trách nhiệm

```
usePageListStore     — DANH SÁCH page của site (metadata, không có nodes)
useEditorPageStore   — TRANG ĐANG MỞ (load/save/publish/switch + dirty)
usePageActionStore   — DIALOG thao tác page (rename / duplicate / copy-to / delete)
```

Ranh giới: `useNodeStore` không biết gì về page id; `useEditorPageStore` không biết gì về từng node — nó chỉ gọi `serialize()` / `hydrate()`.

---

## 2. `usePageListStore` — danh sách page

```js
state: {
  siteId: null,
  pages: [],       // metadata: id, name, slug, is_homepage, type, is_default, order, icon
  types: Object.entries(PAGE_TYPE).map(([index, type]) => ({ key: type, value: Number(index) })),
  loading, lastError,
  sources: {},     // pageId → chuỗi JSON source đã tải (cache đổi trang)
}
```

`PAGE_TYPE` (`common/enum.js`) — 14 loại:

```
1 main · 2 store · 3 member · 4 blog · 5 custom · 6 error · 7 maintain
8 product · 9 category · 10 post · 11 search · 12 cart · 13 checkout · 14 complete
```

`DEFAULT_PAGE_TYPES = ['main','cart','checkout','search','complete']` — nhóm "trang chính", gộp chung một mục trong getter `typePages`.

### 2.1 `loadPages(siteId)` và tự tạo page thiếu

```js
loadPages(siteId)
  └─ pageApi.listBySite(siteId)        // metadata thôi, KHÔNG kèm nodes
  └─ mapPages(pages, types)            // gắn icon theo type / is_default
  └─ createDefaultPages()
```

`createDefaultPages()` làm hai việc cho site mới:

1. **Trang mặc định** — mỗi type trong `DEFAULT_PAGE_TYPES` mà site chưa có thì tạo; `main` được đánh dấu `isHomepage`.
2. **Trang template** — mỗi type *không* thuộc `DEFAULT_PAGE_TYPES` và khác `custom` (product, category, blog, post, member, …) mà chưa có bản `is_default` thì tạo một bản làm khuôn.

Tất cả chạy song song rồi `await Promise.all`.

### 2.2 Getter

```js
homePage   // pages.find(is_homepage) || pages[0] || null
byId(id)
typePages  // { main: [...], product: [...], … } — gom theo tab của page picker
```

### 2.3 Rename lạc quan

```js
this.pages[idx] = { ...prev, name, slug }   // đổi ngay trên UI
const res = await pageApi.rename(...)
if (!res.success) this.pages[idx] = prev    // hỏng thì trả lại
```

---

## 3. `useEditorPageStore` — trang đang mở

```js
state: {
  pageId, loading, saving, publishing,
  lastSavedAt, lastPublishedAt, lastError,
  dirty,   // true khi có mutation node sau khi load xong; false sau khi save thành công
}
```

### 3.1 Load

```
loadPage(pageId)
 └─ pageApi.fetch(siteId, pageId)
      ├─ pageList.sources[pageId] = res.data.source     // cache lại
      └─ setSource(pageId, source)

setSource(pageId, source)
 ├─ loading = true
 ├─ nodeStore.hydrate(parsePageSource(source))   // JSON.parse, hỏng → null
 ├─ preloadNodeFonts(nodeStore.nodes)
 ├─ await Promise.all([ ensureProducts(…), ensureCategories(…) ])
 ├─ dirty = false
 └─ finally: loading = false
```

BE trả document dưới dạng **chuỗi JSON** trong cột `source`; `parsePageSource` decode và trả `null` nếu hỏng (khi đó `hydrate` dựng ROOT rỗng).

### 3.2 Save

```js
savePage() {
  const payload = useNodeStore().serialize()
  const res = await pageApi.save(pageList.siteId, this.pageId, payload)
  if (res.success) {
    lastSavedAt = Date.now()
    dirty = false
    pageList.sources[this.pageId] = JSON.stringify(payload)   // đồng bộ cache
  }
}
```

`serialize()` bỏ mọi trường runtime (`dom`, `doms`, `events` bag) và xuất:

```js
{ schemaVersion: 1, rootNodeId: 'ROOT', nodes: { [id]: { id, data: {…} } } }
```

`pageApi.save` snake-case **nông**: chỉ vỏ ngoài (`schema_version`, `root_node_id`); `nodes` giữ nguyên vì đó là dữ liệu đục.

### 3.3 Publish

```js
publishSite() {
  if (dirty) { if (!await savePage()) return false }   // publish chụp bản ĐÃ LƯU
  const res = await siteApi.publish(siteId)            // → { published, total }
}
```

Publish ở **cấp site**, không phải cấp page: nó snapshot mọi source đã lưu sang `PublishedPage`. Vì vậy trang đang sửa dở phải được lưu trước.

### 3.4 Đổi trang

```js
switchPage(newPageId, { saveDirty = true } = {}) {
  if (dirty && saveDirty) { if (!await savePage()) return false }

  if (pageList.sources[newPageId]) return await setSource(newPageId, sources[newPageId])  // dùng cache
  useNodeStore().hydrate(null)     // xóa canvas để không thấy trang cũ trong lúc chờ
  return await loadPage(newPageId)
}
```

`saveDirty: false` dành cho luồng có hộp thoại xác nhận riêng — bạn tự gọi `savePage()` trước.

### 3.5 Copy sang trang khác

```js
copyToPage(pageTargetId, source)
 └─ pageApi.save(siteId, pageTargetId, source)
 └─ cập nhật cache; nếu trang đích chính là trang đang mở thì setSource lại luôn
```

---

## 4. Theo dõi `dirty`

Đăng ký trong `views/EditorV2.vue`:

```js
watch(() => nodeStore.nodes, () => page.markDirty(), { deep: true, flush: 'sync' })
markDirty() { if (!this.loading) this.dirty = true }
```

Hai quyết định thiết kế:

| Quyết định | Lý do |
|---|---|
| Chỉ theo dõi `nodeStore.nodes` | Bỏ qua `events.selected/hovered/dragged/indicator` → click chọn và hover khi kéo không làm trang thành dirty |
| `flush: 'sync'` | `loadPage` bật/tắt `loading` quanh `hydrate`. Với flush async, watcher chạy **sau** khi `loading` đã tắt → trang vừa load đã dirty. Sync khiến watcher chạy ngay trong lúc mutate, `loading` còn true |

`dirty` được dùng cho: nút Save (disabled khi không dirty), `beforeunload`, `switchPage`, `publishSite`, và xác nhận trước khi xóa page.

---

## 5. `usePageActionStore` — dialog thao tác

```js
state: { actionDialogOpen, action, editingPage, targetPage, name, submitting, typeKey }
```

`action` nhận: `rename` · `duplicate` · `copy_to_page` · `delete_page` · `create_new_page` · `create_new_page_template`.

```
openPageAction({ action, page, typeKey, name })  → mở dialog
submitPageAction()                               → switch theo action
closePageAction()                                → dọn state
```

### 5.1 `remapPageNodeIds` — chống trùng id

Duplicate hoặc copy-to-page mà giữ nguyên id sẽ khiến hai trang dùng chung id node. Vì vậy:

```js
remapPageNodeIds(source) {
  const document = typeof source === 'string' ? JSON.parse(source) : source
  let serialized = JSON.stringify(document)
  Object.keys(document.nodes).forEach(oldId => {
    if (oldId === ROOT_NODE) return                       // ROOT giữ nguyên
    serialized = serialized.replaceAll(
      JSON.stringify(oldId),
      JSON.stringify(genId(document.nodes[oldId].data.type))
    )
  })
  return serialized
}
```

Thay trên **chuỗi JSON** chứ không đi cây, nên id nằm ở bất kỳ đâu — `data.nodes[]`, `data.parent`, hay `config.tabItemId` trỏ satellite — đều được đổi cùng lúc. Đây chính là điểm mấu chốt: satellite được tham chiếu qua giá trị config nên duyệt cây thường sẽ bỏ sót.

### 5.2 Xóa trang

```js
confirmDeletePage()
 ├─ nếu đang xóa chính trang đang mở → savePage() trước (không lưu được thì hủy)
 ├─ pageList.deletePage(id)
 └─ chuyển sang trang liền trước, hoặc trang is_default của cùng nhóm (replace: true)
```

BE từ chối xóa trang duy nhất hoặc trang chủ (409); FE hiển thị thông điệp của BE.

### 5.3 Đồng bộ URL

```js
handleRoutePageIdChange(router, route, pageId, replace)
  → router.push/replace({ name, params, query: { ...query, page_id: pageId } })
```

`EditorV2.vue` cũng watch chiều ngược lại:

```js
'$route.query.page_id': async function (pageId) {
  if (!pageId || pageId === pageStore.pageId) return
  const target = pageListStore.byId(pageId)
  if (!target) { /* id không hợp lệ → trả URL về trang trước */ return }
  const switched = await pageStore.switchPage(target.id)
  if (!switched && previousPageId) { /* switch hỏng → trả URL về trang trước */ }
}
```

Nhờ vậy nút back/forward của trình duyệt hoạt động, và URL không bao giờ trỏ tới page không tồn tại.

---

## 6. Global styling

`useGlobalStylingStore` giữ preset typography **ở cấp site** (một style dùng chung cho mọi trang, giống `site_styles` của v1).

```js
presets: [
  { name: 'Heading 1', slug: 'heading-1', className: 'wk-gs-heading-1',
    isDefault: true, styles: { '--text-font-size': '48px', … } },
  … Heading 2..6, Text 1..3
]
styleData: { all: '<css>', laptop: '', tablet: '', mobile: '' }
```

Đường đi:

```
① node.config.textGlobalStyle = 'heading-4'
② getNodeClass(node) → 'wk-gs-heading-4'         → element gắn vào :class
③ refreshCSS() → styleData.all = '.wk-gs-heading-4 { --text-font-size: 22px } …'
④ PageWrapper watch styleData.all → ghi vào <style id="wk-global-styles"> trong <head>
```

| Action | Ghi chú |
|---|---|
| `load(siteId)` | `styleGlobalApi.fetch`; hỏng hoặc thiếu `style_data.all` thì `refreshCSS()` từ preset mặc định. **Chưa có nơi nào gọi** — hiện store luôn khởi động bằng `DEFAULT_PRESETS()` |
| `save(siteId)` | `styleGlobalApi.save(siteId, { presets, style_data })` — cũng chưa được nối vào UI |
| `updatePresetStyle(type, slug, cssKey, cssValue)` | Sửa một thuộc tính rồi `refreshCSS()` |
| `getNodeStyles(node, type)` / `getNodeStylesAuto(node)` | Trả về style của preset — trait widget dùng để hiển thị giá trị hiệu lực khi node chưa override |

Cơ chế này giải thích vì sao đổi cỡ chữ ở trait cấp node **thắng** preset: preset là class ngoài, trait cấp node là inline style.

---

## 7. Layer API

```
api/editor_v2/
├── axiosEditorV2.js   instance axios riêng cho editor v2
├── baseApi.js         BaseApi (getUrl, controller)
├── pageApi.js         listBySite / create / fetch / save / rename / updateMeta / remove
├── siteApi.js         publish(siteId) → { published, total }
├── styleGlobalApi.js  fetch / save global styling
├── nodeApi.js         thao tác từng node (dành cho tương lai)
├── versionApi.js      lịch sử phiên bản
└── bindings/          productApi · categoryApi · blogApi · postApi · bindingResourceApi
```

Quy ước wire: **snake_case**. `keysToSnake(payload, { deep: false })` chỉ chuyển lớp vỏ, giữ nguyên `nodes` (dữ liệu đục, đã đúng hình dạng).

---

## 8. Lưu tạm bằng phím tắt

```js
Cmd/Ctrl + S → localStorage.setItem('temp_page_source_v2', JSON.stringify(nodeStore.serialize()))
```

Đây là **chỗ tạm** (`// TODO: re-handler to save db`). Nó cũng là đường dự phòng lúc boot: nếu site chưa có page nào, `EditorV2.vue` đọc `temp_page_source_v2` và hydrate từ đó.

---

## 9. Bảng debug nhanh

| Triệu chứng | Kiểm tra |
|---|---|
| Trang vừa load đã báo dirty | Watcher `nodes` mất `flush: 'sync'` |
| Nút Save luôn disabled | `page.dirty` false, hoặc `page.pageId` null |
| Đổi trang mất thay đổi | `switchPage` gọi với `saveDirty: false` mà không tự `savePage()` trước |
| Publish thiếu thay đổi mới nhất | Publish chụp bản đã lưu — kiểm tra `savePage()` có thành công không |
| Duplicate trang làm hỏng trang gốc | `remapPageNodeIds` không được gọi ⇒ hai trang chung id node |
| Canvas trắng khi đổi trang | `sources[pageId]` cache một chuỗi hỏng; xem `parsePageSource` trả `null` |
| Undo kéo node của trang cũ vào | `hydrate` không `history.clear()` |
| Preset typography không áp dụng | `<style id="wk-global-styles">` rỗng ⇒ `styleData.all` chưa `refreshCSS()` |
| Site mới thiếu trang cart/checkout | `createDefaultPages()` lỗi giữa chừng — xem `pageList.lastError` |
