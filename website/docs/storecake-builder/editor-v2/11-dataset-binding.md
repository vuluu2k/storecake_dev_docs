---
sidebar_position: 12
title: 11 — Dataset & Binding (Product / Collection)
---

# 11 — Dataset & Binding (Product / Collection)

Hệ thống lớn nhất được thêm vào Editor V2. Nó cho phép một element **không chứa nội dung cứng** mà **trỏ tới dữ liệu thật** (sản phẩm, collection), rồi tự lấy tên / giá / ảnh / mô tả để hiển thị.

---

## 1. Ý tưởng trong một hình

```
node "Product Title"                     Store dữ liệu
┌──────────────────────────┐            ┌──────────────────────┐
│ type: 'text-dataset'     │            │ productsSaved: {     │
│ bindings: [{             │            │   'p-123': { … }     │
│   target: {              │─── id ───▶ │ }                    │
│     type: 'product',     │            └──────────────────────┘
│     kind: 'title',       │                       │
│     id:   'p-123'        │                       ▼
│   }                      │            mapProduct(item).title
│ }]                       │                       │
└──────────────────────────┘                       ▼
                                          render "Áo thun basic"
```

Node **chỉ lưu con trỏ**. Dữ liệu thật nằm trong store, được fetch một lần và chia sẻ cho mọi node cùng trỏ tới.

---

## 2. Cấu trúc `binding`

```js
node.data.bindings = [
  {
    id: 'BINDING-a1b2c3d4',
    target: {
      type: 'product' | 'category',   // nguồn dữ liệu
      id:   'p-123' | '',             // bản ghi cụ thể; '' = chưa chọn
      kind: 'title',                  // ĐỌC trường nào
      // hoặc
      action: 'add_to_cart',          // LÀM hành động gì
    },
  },
]
```

Editor hiện chỉ dùng `bindings[0]`. Mảng để dành cho tương lai.

`kind` và `action` loại trừ nhau:

| Nhóm | Giá trị | Ý nghĩa |
|---|---|---|
| `kind` (đọc dữ liệu) | `title`, `vendor`, `price`, `compare_price`, `prices`, `description`, `quantity`, `media`, `variants`, `product_general`, `product_list`, `category_general`, `collection_list` | Node hiển thị trường tương ứng |
| `action` (hành vi) | `add_to_cart`, `dynamic_checkout` | Node là nút thao tác |

> Lưu ý thuật ngữ: **trong code là `category`, trên giao diện là "Collection"**. `mapNodeBindings` dịch qua lại (`utils/editor_v2/bindings.js`).

---

## 3. Hai store dữ liệu

### 3.1 `useProductDatasetStore`

```js
state: {
  page, limit: 5, total, search,
  products: [],       // danh sách phân trang cho DIALOG CHỌN sản phẩm
  productsSaved: {},  // id → product, dữ liệu CANVAS đọc để render
  isFetching: false,
}
```

| Action | Dùng khi |
|---|---|
| `getProductsList(siteId)` | Dialog chọn sản phẩm — cuộn tới đáy thì nạp trang tiếp (`page += 1`) |
| `resetDefault(params)` | Người dùng gõ ô tìm kiếm → về trang 1 rồi fetch lại |
| `setProductSaved(product)` | Người dùng vừa chọn — nhét ngay vào cache, không cần chờ round-trip |
| `ensureProducts(ids)` | **Lúc load trang** — fetch một lượt mọi id còn thiếu |
| `getProductsByCategoryId(categoryId)` | Lấy sản phẩm thuộc một collection |
| `syncVariationToProducts(list)` | Gắn `product.variation_preview` = biến thể **đầu tiên có ảnh** — dùng làm ảnh/giá đại diện |

### 3.2 `useCategoryDatasetStore`

Giống trên, cộng thêm:

| Action | Ghi chú |
|---|---|
| `getAllCollections({ force })` | Feed "tất cả collection". Phân trang 50/lần, chặn chạy loạn ở 20 trang. Kết quả vào `allCollections`, **tách riêng** khỏi `categories` để dialog tìm kiếm không phá thứ đang render |
| `setCategorySaved(category)` | Lưu category **kèm** fetch danh sách sản phẩm bên trong |
| `setCategoryMeta(category)` | Chỉ lưu metadata, **không** fetch sản phẩm — thẻ collection chỉ cần tên + ảnh |
| `ensureCategories(ids)` | Hydrate đủ (có sản phẩm) |
| `ensureCategoryMeta(ids)` | Hydrate nhẹ (không sản phẩm) |
| `createDefaultCategory()` | Category giả `{ id: 'all_products', name: 'General category' }` cho chế độ "tất cả sản phẩm" |

---

## 4. Hydrate lúc load trang

`page.setSource()` gom id từ **toàn bộ** cây node rồi fetch một lượt:

```js
nodeStore.hydrate(parsePageSource(source))
preloadNodeFonts(nodeStore.nodes)
await Promise.all([
  useProductDatasetStore().ensureProducts(productBindingIds(nodeStore.nodes)),
  useCategoryDatasetStore().ensureCategories(categoryBindingIds(nodeStore.nodes)),
])
```

`productBindingIds` / `categoryBindingIds` (`utils/editor_v2/bindings.js`) duyệt map node, lọc `bindings[0].target.type` rồi khử trùng bằng `Set`.

Không có bước này thì từng element sẽ tự fetch riêng → N request và canvas nhấp nháy.

---

## 5. Mixin `dataset` — trái tim của mọi element dữ liệu

```js
mixins: [nodeLeaf, draggableNode, statefulNode]
inject: { datasetItem: { from: 'datasetItem', default: null } }
```

### 5.1 Chuỗi computed

```js
binding  = node.data.bindings?.[0]
target   = binding?.target
type     = target?.type            // 'product' | 'category'
kind     = target?.kind

id       = datasetItem?.id                       // ① prop truyền xuống từ list
        || getAncestorBindingId(node)            // ② id của tổ tiên gần nhất có binding
        || target?.id                            // ③ id của chính mình
        || ''

item     = datasetItem ?? productsSaved[id]      // (hoặc categoriesSaved[id])
```

Thứ tự ưu tiên của `id` là chỗ **quan trọng nhất** của cả hệ thống:

- Một `text-dataset` đặt riêng lẻ trên trang → dùng `target.id` của chính nó (③).
- Cùng element đó đặt bên trong một `dataset-block` đã chọn sản phẩm → thừa hưởng id của cha (②).
- Cùng element đó đặt bên trong một `list-dataset` render 12 sản phẩm → mỗi bản render nhận `datasetItem` khác nhau (①).

Nhờ vậy **một node duy nhất** render ra 12 tên sản phẩm khác nhau.

### 5.2 Đọc giá trị: `getValue(key)`

```js
getValue(key) {
  switch (this.type) {
    case 'product':  return this.item ? mapProduct(this.item)[key]  || '' : ''
    case 'category': return this.item ? mapCategory(this.item)[key] || '' : ''
  }
}
```

Hai hàm chuẩn hóa (`utils/editor_v2/`):

```js
mapProduct(p)  → { id, title, image, price, comparePrice, description, vendor, totalRemainingQuantity }
mapCategory(c) → { id, title, description, image }
```

`mapProduct` lấy ảnh và giá từ `variation_preview` (biến thể đầu tiên có ảnh), và format giá theo `siteStore.site.currency`.

### 5.3 Kế thừa cấu hình: `resolveFieldValue(key)`

```js
resolveFieldValue(key) {
  return this.mergedConfig[key]    ?? this.mergedSpecials[key]  ?? this.mergedStyle[key]
      ?? this.parentConfig[key]    ?? this.parentSpecials[key]  ?? this.parentStyle[key]
      ?? ''
}
```

Cho phép cha đặt một tùy chọn (ví dụ `descriptionDisplayType`, `quantity`, `itemsPerRow`) mà con tự nhận. Cụ thể `parentTypes = ['pricing-dataset', 'text-dataset', 'quantity-dataset']` là các cụm mà con chỉ là phần hiển thị của cha.

### 5.4 Placeholder khi chưa chọn nguồn

```js
notShowContent() {
  return !this.id && !this.parentTypes.includes(this.parentNode?.data?.type)
}
```

`true` ⇒ element render `SelectDataset.vue`: *"Select a product — Please select a product in General panel to see this content"*.

---

## 6. `visible.js` — ẩn/hiện trait theo ngữ cảnh

Vì `dataset-block`, `text-dataset`… dùng chung một `meta` cho nhiều `kind`, panel phải tự lọc. Toàn bộ predicate nằm ở `utils/editor_v2/visible.js`:

| Helper | Trả về true khi |
|---|---|
| `isVisibleByKind(node, list)` | `"${type}::${kind}"` nằm trong `list` — vd `'product::product_general'` |
| `isVisibleByAction(node, list)` | Tương tự cho `action`; node **không có binding** thì so bằng `node.data.type` |
| `isVisibleByGeneral(node, list)` | Như trên nhưng **loại bỏ node con được sinh ra bên trong thẻ dataset** (đã có `isGeneratedDatasetChild`) |
| `isVisibleByListDataset(node)` | Cha **không phải** `list-dataset` — trong danh sách thì không cho chọn sản phẩm riêng lẻ |
| `isDefaultVariantVisible(nodeData)` | Sản phẩm đã chọn thật sự có thuộc tính biến thể |
| `isProductVariantOptionGroupVisible(node)` | Ẩn tùy chọn biến thể lồng bên trong thẻ sản phẩm sinh tự động |
| `visibleChildIds(node)` | Danh sách con **được render** — với `kind === 'prices'` thì lọc theo `config.displayPriceId` (`BOTH` / `PRICE` / `COMPARE_PRICE`) |

Ví dụ trong `dataset-block/meta.js`:

```js
{
  key: 'product', label: 'Product',
  visible: (node) => isVisibleByKind(node, ['product::product_general'])
                  && isVisibleByListDataset(node),
  attributes: [
    { key: TRAIT.PRODUCT },
    { key: TRAIT.VARIANT_OPTION, visible: (data) => isDefaultVariantVisible(data) },
  ],
},
{
  key: 'size', label: 'Size',
  visible: (node) => isVisibleByKind(node, GENERAL_KINDS),
  attributes: [
    { key: TRAIT.WIDTH_SELECT, disabled: (data) => !isVisibleByListDataset(data) },
    { key: TRAIT.HEIGHT_SELECT },
  ],
},
```

---

## 7. Chọn sản phẩm: `ProductTrait`

```js
handleChoose(product) {
  this.setProductSaved(product)                 // ① đưa ngay vào cache
  this.handleUpdateBinding(this.node, product.id)
  this.dialogOpen = false
}

handleUpdateBinding(node, id) {
  const binding = node.data.bindings?.[0]
  if (binding?.target?.type !== 'product') return
  this.nodeStore.updateBinding(node.id, binding.id, {
    ...binding,
    target: { ...binding.target, id },          // ② chỉ đổi id, giữ nguyên kind
  })
}
```

Đây là lý do `[TRAIT.PRODUCT]` và `[TRAIT.CATEGORY]` khai `writes: {}` — chúng **không ghi vào style/config/specials** mà ghi vào `bindings` qua action riêng của store.

Dialog phân trang: cuộn còn < 100px tới đáy thì gọi `getProductsList()`; ô tìm kiếm debounce 300ms rồi `resetDefault()`.

---

## 8. Cây dựng sẵn trong `src/data/editor_v2/`

Mỗi file xuất một hàm trả về **def** cho `createNodeTree` — không phải node đã dựng. Nhờ vậy mỗi lần kéo sinh id mới.

```js
// data/editor_v2/product-title.js
const productTitleDataDef = () => ({
  type: 'text-dataset',
  style:    { '--text-font-size': '22px' },
  config:   { textGlobalStyle: 'heading-4' },
  specials: { htmlTag: 'h4' },
  bindings: [{ id: `BINDING-${randomString(8)}`,
               target: { type: 'product', id: '', kind: 'title' } }],
})
```

| File | Xuất |
|---|---|
| `product-title.js` / `product-vendor.js` / `product-description.js` | `text-dataset` với `kind` tương ứng |
| `product-price.js` | `pricing-dataset` + con `price` / `compare_price` |
| `product-media.js` | `media-dataset` |
| `product-quantity.js` | `quantity-dataset` |
| `product-variants.js` | `product-variants` |
| `add-to-cart.js` / `dynamic-checkout.js` | `button` có `target.action` + state hover |
| `collection.js` | `collectionGeneralBinding`, `collectionMedia/Title/DescriptionDataDef` |
| `dataset.js` | `singleDatasetDataDef` / `multiDatasetDataDef` — **thẻ sản phẩm đầy đủ** |
| `list-dataset.js` | `listDatasetDataDef` — `list-dataset` bọc quanh một `multiDatasetDataDef` |
| `index.js` | Barrel |

Khác biệt giữa hai biến thể thẻ:

```
singleDatasetDataDef  (trang chi tiết sản phẩm)
  media
  flex-block dọc
    title · price · variants · description · quantity · add-to-cart · dynamic-checkout

multiDatasetDataDef   (thẻ trong danh sách)
  media · title · price
```

---

## 9. `list-dataset` — một node, N thẻ

Element phức tạp nhất. Nó **import trực tiếp** `dataset-block/index.vue` (ngoại lệ duy nhất của luật "chỉ render qua NodeRenderer") để render *cùng một node con* nhiều lần:

```vue
<DatasetBlockNode
  v-for="(item, index) in currentItems"
  :key="item.id"
  :dataset-item="item"        <!-- ← sản phẩm cụ thể của bản render này -->
  :node="childNode"           <!-- ← CÙNG một node cho mọi bản -->
  :node-id="childId"
  :is-clone="isClone || index !== 0"
  :node-index="index"
/>
```

`dataset-block` `provide('datasetItem', …)` xuống, mixin `dataset` của con `inject` nó ở ưu tiên ① (§5.1).

### 9.1 Nguồn dữ liệu

```js
listItems() {
  switch (this.type) {
    case 'product':
      return categoriesSaved[this.collectionId]?.products || []
    case 'category':
      return collectionListType === 'custom_collections'
        ? collectionIds.map(id => categoriesSaved[id]).filter(Boolean)
        : allCollections
  }
}
```

`currentItems` cắt theo `quantity`, **trừ khi** đó là danh sách collection do người dùng tự chọn (`isExplicitList`) — khi đó số lượng đã là lựa chọn tường minh.

Hydrate ở `mounted` và trong watcher:

| Trường hợp | Gọi |
|---|---|
| `type === 'category'`, `collectionListType === 'custom_collections'` | `ensureCategoryMeta(collectionIds)` |
| `type === 'category'`, còn lại | `getAllCollections()` |
| `type === 'product'`, `collectionType === 'all_products'` | `setCategorySaved(createDefaultCategory())` |
| `type === 'product'`, `collectionType === 'collection'` | `ensureCategories([collectionId])` |

### 9.2 Hai chế độ hiển thị

```js
layout === 'slide' ? (flex + nav + pagination) : (grid, gridTemplateColumns: repeat(itemsPerRow, 1fr))
```

Chế độ slide có điều hướng và chấm phân trang, cấu hình qua `resolveFieldValue`:

- Nav: `listNavPosition` (`inside` / `outside`), `listNavIcon`, `listNavIconColor`, `listNavIconSize`, `listNavButtonWidth/Height/Bg`.
- Pagination: `paginationItemWidth/Height/Gap/Bg/BorderRadius/BorderWidth/BorderStyle/BorderColor` và bộ `paginationItemActive*` tương ứng.
- `slideCount = max(renderCount - itemsPerRow + 1, 1)`; `hasPagination` chỉ bật khi `slideCount > 1` **và** width/height chấm > 0.

---

## 10. Nhóm product-image

`product-image-feature` (ảnh lớn) và `product-image-list` (dải thumbnail) phải đồng bộ ảnh đang xem. State dùng chung nằm ở `composable/editor_v2/productImageState.js`:

```js
getProductImages(product)   // gom ảnh mọi variation → [{ id, url, alt }], có ảnh fallback
getProductImageStateKey(parentNodeId, productId)   // `${nodeId}:${productId}`
getActiveImageIndex(key) / setActiveImageIndex(key, i)
```

Khóa gồm **cả** node id **và** product id, vì clone trong `list-dataset` dùng chung node id nhưng render sản phẩm khác nhau — nếu chỉ khóa theo node id thì đổi ảnh ở thẻ này sẽ đổi luôn ở thẻ kia.

---

## 11. Nhãn hiển thị: `mapNodeBindings`

Toolbar nổi và Layers gọi hàm này để hiện tên "người đọc hiểu được" thay vì `text-dataset`:

```js
mapNodeBindings(node) → { icon, label }
```

Vài quy tắc dịch:

- `category` → hiển thị **"Collection"**.
- `product_general` → `"Product detail"` nếu cha là `list-dataset`, ngược lại `"Product"`.
- `category_general` → `"Collection detail"` / `"Collection"` theo cùng logic.
- `compare_price` → `"Compare price"`; `add_to_cart` → `"Add to cart"`; `dynamic_checkout` → `"Dynamic checkout"`.

---

## 12. Layer API

`api/editor_v2/bindings/`:

| File | Endpoint |
|---|---|
| `productApi.js` | `list(siteId, params)`, `getByIds(siteId, ids)`, `getProductsByCategoryId(siteId, categoryId)` |
| `categoryApi.js` | `list`, `getByIds` |
| `blogApi.js` / `postApi.js` | Chuẩn bị cho nguồn dữ liệu tương lai |
| `bindingResourceApi.js` | Lớp chung |

---

## 13. Bảng debug nhanh

| Triệu chứng | Kiểm tra |
|---|---|
| Element hiện "Select a product" dù đã chọn | `bindings[0].target.id` còn `''`; hoặc `updateBinding` ghi vào binding sai id |
| Chọn xong nhưng canvas vẫn trống | `productsSaved[id]` chưa có ⇒ thiếu `setProductSaved` hoặc `ensureProducts` |
| Mọi thẻ trong danh sách hiện cùng một sản phẩm | Con không nhận `datasetItem` — kiểm tra `provide/inject` và prop `:dataset-item` |
| Danh sách trống | `categoriesSaved[collectionId]` chưa hydrate — xem bảng ở §9.1 |
| Đổi ảnh ở thẻ này kéo theo thẻ kia | Khóa `productImageState` thiếu product id |
| Nhóm trait không hiện đúng `kind` | Predicate `isVisibleByKind` nhận sai chuỗi `"${type}::${kind}"` |
| Trait ẩn khi ở trong danh sách | Đúng thiết kế — `isVisibleByListDataset` chặn chọn sản phẩm riêng lẻ trong `list-dataset` |
| Giá hiển thị sai định dạng | `siteStore.site.currency` chưa nạp (`getSite` chạy không `await`) |
