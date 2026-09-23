# 04 — Gán template & trang động

> **Cho BA:**
> Trang sản phẩm, danh mục, bài viết, chuyên mục blog là **trang động**: một bản thiết kế (template) dùng cho nhiều sản phẩm/bài.
> Merchant có thể có nhiều template cùng loại và chọn "template A áp dụng cho **tất cả** sản phẩm", "template B cho sản phẩm thuộc **danh mục** Giày", "template C cho **đúng** 3 sản phẩm này".
> Khi khách mở `/products/ao-thun`, hệ thống chọn template theo thứ tự: **chọn riêng → theo danh mục (danh mục con thắng cha) → tất cả → template mặc định**.
> Template phải **đã publish** thì mới được dùng.

Chương này gồm hai nửa:

1. **Phía editor** — lưu "template này áp dụng cho ai" (`PageAssignments`, API `/assignment`).
2. **Phía render** — request của khách đi từ router v1 → rẽ sang v2 → chọn template (`Published.get_assigned`).

Code ở `builderx_api`, branch `feat-builder-v2`, commit `3e3eeacb5`.

---

## 1. Các enum liên quan

Tất cả trong `lib/builderx_api/enum.ex`.

### 1.1 `Enum.PageType` (`:220`) — loại trang, lưu ở `pages.type` (integer)

| key | value | | key | value |
|---|---|---|---|---|
| `main` | 1 | | `product` | **8** |
| `store` | 2 | | `category` | **9** |
| `member` | 3 | | `post` | **10** |
| `blog` | **4** | | `search` | 11 |
| `custom` | 5 | | `cart` | 12 |
| `error` | 6 | | `checkout` | 13 |
| `maintain` | 7 | | `complete` | 14 |

Chỉ 4 loại in đậm là **template** (có thể gán).

### 1.2 `Enum.PageTargetType` (`:149`) — loại đối tượng được gán, lưu ở `editor_v2_page_assignments.target_type` (string)

`product` · `collection` · `post` · `blog`

### 1.3 `Enum.PageApplyType` (`:132`) — chế độ áp dụng, lưu ở `pages.apply_type` (string)

`all` · `category` · `custom`

### 1.4 Bảng nối page type ↔ target type

`lib/builderx_api/editor_v2/page_assignments.ex:19-24`:

```elixir
@resource_by_page_type %{
  product:  "product",      # PageType 8  ↔ target "product"
  category: "collection",   # PageType 9  ↔ target "collection"
  post:     "post",         # PageType 10 ↔ target "post"
  blog:     "blog"          # PageType 4  ↔ target "blog"
}
```

- `resource_of/1` (`:40`): page → target type (hoặc `nil` nếu không phải template).
- `template?/1` (`:42`): `resource_of != nil`.
- `page_type_for/1` (`:192-199`) và alias công khai `page_type_of/1` (`:30`): chiều ngược lại, target type → integer page type.

---

## 2. Dữ liệu

File migration: `priv/citus/migrations/20260824000001_create_editor_v2_page_assignments.exs`

```
pages.apply_type   string        ← thêm cột vào bảng pages dùng chung với v1 (:5-7)
                                   NULL được đọc như "all"

editor_v2_page_assignments
 ├─ site_id      binary_id  PK   ← phân tán Citus, colocate `sites`
 ├─ page_id      binary_id  PK
 ├─ target_type  string     PK   product | collection | post | blog
 ├─ target_id    binary_id  PK   id sản phẩm / danh mục / bài / chuyên mục
 ├─ position     integer NOT NULL DEFAULT 0   ← giữ đúng thứ tự merchant chọn (:15)
 └─ timestamps
    index (site_id, target_type, target_id)  ← tra ngược: "SP này dùng trang nào" (:21-22)
```

Schema: `lib/builderx_api/editor_v2/pages/page_assignment.ex` — 4 cột PK, `changeset` bắt buộc 4 cột và `target_type ∈ Enum.PageTargetType.values()` (`:21`).

**Quy ước quan trọng:** `apply_type = "category"` thì `target_type` luôn là `"collection"` (kể cả với trang product), vì đối tượng được chọn là danh mục chứ không phải sản phẩm. `target_type_for/2` (`page_assignments.ex:44-46`):

```elixir
def target_type_for(_page, "category"), do: "collection"
def target_type_for(%Page{} = page, "custom"), do: resource_of(page)   # product/collection/post/blog
def target_type_for(_page, _apply_type), do: nil                        # "all" → không có target
```

---

## 3. Phía editor: đọc & ghi assignment

### 3.1 Route

`lib/builderx_api_web/router/router.ex` trong scope `/api/v1/editor_v2/sites/:site_id/pages/:id`:

```
GET /assignment   → PageAssignmentController.show
PUT /assignment   → PageAssignmentController.update
```

Controller: `lib/builderx_api_web/controllers/v1/editor_v2/page_assignment_controller.ex`. Cả hai hàm đều mở đầu bằng `PageLoader.load(params)` (`page_loader.ex:11-16`) — không thấy trang thì trả `{:failed, :with_reason, "Page not found"}` → **HTTP 422** (Swagger ghi 404 nhưng FallbackController map `:failed` sang 422).

### 3.2 `PageAssignments.get/1` — đọc (`page_assignments.ex:49-58`)

```elixir
apply_type  = page.apply_type || "all"                   # :50  chưa từng gán = "all"
target_type = target_type_for(page, apply_type)          # :51
target_ids  = target_ids(page.site_id, page.id, target_type)   # :56
```

`target_ids/3` (`:60-68`) đọc bảng assignment theo `(site_id, page_id, target_type)`, `order_by position`. Lọc theo `target_type` hiện hành nên nếu còn row "rác" loại khác (không nên có, vì `put` luôn xoá hết) cũng không bị trả ra.

Controller `render_assignment/2` (`controller:72-78`) **hydrate** id thành object đầy đủ để panel hiển thị luôn:

| target_type | Hàm hydrate |
|---|---|
| `product` | `ProductBindings.list_products_by_ids/2` |
| `collection` | `CategoryBindings.list_categories_by_ids/2` |
| `post` | `PostBindings.list_posts_by_ids/2` |
| `blog` | `BlogBindings.list_blogs_by_ids/2` |

rồi `sort_by_ids/2` (`:89-92`) sắp lại theo thứ tự `position` (comment: chỉ binding product giữ thứ tự id đầu vào). Id đã bị xoá sẽ không hydrate được → **biến mất khỏi response** nhưng vẫn còn trong DB. Chi tiết binding: [05 — Bindings](./05-bindings.md).

Response:

```json
{ "data": { "apply_type": "category", "target_type": "collection", "targets": [ {…}, {…} ] } }
```

### 3.3 `PageAssignments.put/3` — ghi (`page_assignments.ex:71-116`)

Body: `{ "apply_type": "all" | "category" | "custom", "target_ids": [uuid, …] }`. Panel luôn gửi **toàn bộ** lựa chọn, không phải delta.

```
put(page, apply_type, target_ids)                                  :71
 ├─ không phải template?           → {:error, :not_a_template}      → 400 "This page type has nothing to assign"
 ├─ apply_type không thuộc enum?   → {:error, :invalid_apply_type}  → 400 "apply_type must be one of: all, category, custom"
 └─ replace/3                                                        :79-93
      ├─ target_type = target_type_for(page, apply_type)
      ├─ ids = target_type ? uniq(target_ids) : []      ← "all" bỏ qua target_ids
      └─ Repo.transaction
           ├─ Pages.update_page(page, %{"apply_type" => apply_type})
           └─ replace_targets/3                                      :95-116
                ├─ DELETE mọi row của (site_id, page_id)   ← kể cả target_type khác
                └─ INSERT từng id với position = index, on_conflict: :nothing
```

Điểm cần biết:

- **Không validate `target_ids`**: không kiểm tra id có thuộc site, có tồn tại, có đúng là UUID. UUID sai định dạng sẽ làm insert lỗi — lỗi trả về từ `Repo.insert` **bị bỏ qua** (`Enum.each`, không kiểm tra kết quả), transaction vẫn commit. **Chưa xác minh** hành vi chính xác khi cast binary_id thất bại (có thể raise).
- Không có ràng buộc "một sản phẩm chỉ thuộc một template": hai trang cùng `custom` chọn cùng một SP là hợp lệ; khi render, trang có `order` nhỏ hơn (rồi `inserted_at` cũ hơn) thắng (mục 4.2).
- Đổi assignment **không cần publish lại**: render đọc thẳng bảng `pages` + `editor_v2_page_assignments` (bản draft), chỉ riêng *nội dung* template là lấy từ bản publish.

---

## 4. Phía render: chọn template cho một entity

### 4.1 `Published.get_assigned/4` (`lib/builderx_api/editor_v2/published.ex:131-165`)

```elixir
131 def get_assigned(site_id, target_type, target_id, category_ids \\ []) do
132   assigned =
133     case PageAssignments.resolve_page_id(site_id, target_type, target_id, category_ids) do
134       nil -> nil
135       page_id -> get_by_page(site_id, page_id)       # bản PUBLISH của page đó
136     end
138   assigned || fallback_template(site_id, target_type)
139 end
```

- `:133` tìm **page_id** theo luật gán (đọc bảng `pages` draft — mục 4.2).
- `:135` đổi page_id thành bản đã publish (`published_pages`). Page được gán mà **chưa publish** → `nil`.
- `:138` không có → `fallback_template/2` (`:141-146`): đổi target type → page type, rồi `get_template/2` (`:148-150`):
  1. `default_template/2` (`:152-157`): published page cùng `type` có `is_default = true`.
  2. `first_template/2` (`:159-165`): published page cùng `type`, cũ nhất (`inserted_at asc`).
- Trả `nil` nếu site chưa publish template nào loại đó.

> Lưu ý chỗ `@doc` bị lặp ở `published.ex:119-130`: có hai `@doc` liền nhau, cái đầu (mô tả `get_template`) bị cái sau ghi đè — chỉ ảnh hưởng tài liệu sinh tự động.

### 4.2 `PageAssignments.resolve_page_id/4` (`page_assignments.ex:126-130`)

```elixir
match_custom(site_id, target_type, target_id) ||
  match_category(site_id, target_type, category_ids) ||
  match_all(site_id, target_type)
```

Cả ba đều chỉ xét page `version == 2`, `is_deleted == false`, `type == page_type_for(target_type)`.

| Bước | Hàm | Điều kiện | Thứ tự thắng |
|---|---|---|---|
| ① custom | `match_custom/3` `:132-148` | join assignment ↔ pages; `a.target_type == target_type` **và** `a.target_id == target_id`; `p.apply_type == "custom"` | `p.order asc`, `p.inserted_at asc` |
| ② category | `match_category/3` `:150-173` | `category_ids` rỗng → bỏ qua. Nở lên tổ tiên bằng `Products.get_categories_parents/2` (gồm chính nó + mọi cha, bỏ danh mục `is_removed`). Join assignment ↔ pages ↔ `Category`; `a.target_type == "collection"`, `a.target_id in ids`; `p.apply_type == "category"` | **`c.depth desc`** (danh mục sâu nhất / con thắng cha), rồi `order`, `inserted_at` |
| ③ all | `match_all/2` `:175-190` | Chỉ bảng `pages`: `apply_type == "all"` **và `is_default == false`** | `order`, `inserted_at` |

Tại sao ③ loại `is_default`: trang mặc định được xử lý riêng ở fallback (`default_template`), để trang "all" do merchant tự tạo được ưu tiên hơn template mặc định hệ thống.

Chú ý `page.apply_type` NULL (trang chưa từng mở panel gán): `get/1` hiển thị là `all`, nhưng query SQL `p.apply_type == "all"` **không khớp NULL** → trang này **không** được ③ chọn, chỉ có thể được chọn qua fallback (`default` hoặc `first`). **Chưa xác minh** client có luôn PUT assignment khi tạo template hay không.

### 4.3 `category_ids` lấy từ đâu

| Loại trang | Gọi | `category_ids` |
|---|---|---|
| Product | `render_controller.ex:52-55` | `PageAssignments.category_ids_of_product/2` (`page_assignments.ex:33-38`): danh mục **trực tiếp** của SP trong `product_categories`, bỏ `is_removed`. Tổ tiên được nở ở bước ②. |
| Category | `render_controller.ex:67-70` | `[category.id]` — danh mục đang xem (và tổ tiên của nó) |
| Post | `render_controller.ex:85-87` | không truyền → `[]` → bỏ qua bước ② |
| Blog | `render_controller.ex:106-108` | không truyền → `[]` |

Với trang post, `target_type_for(page, "category")` vẫn trả `"collection"` — tức là panel cho phép gán bài viết "theo danh mục" nhưng render **không bao giờ khớp** vì không truyền `category_ids`. **Chưa xác minh** UI có ẩn lựa chọn này cho post/blog.

### 4.4 Sơ đồ quyết định tổng

```
Khách mở URL của 1 sản phẩm X (site v2)
 │
 ├─ ① Có page type=8, apply_type=custom, được gán đúng X ?
 │     └─ có (lấy order nhỏ nhất) → page P
 ├─ ② (chưa có) X thuộc danh mục C; C và tổ tiên của C có page type=8, apply_type=category ?
 │     └─ có (danh mục sâu nhất thắng) → page P
 ├─ ③ (chưa có) Có page type=8, apply_type="all", is_default=false ?
 │     └─ có → page P
 │
 ├─ Có P ? → P đã publish chưa?
 │     ├─ rồi → DÙNG bản publish của P  ✔
 │     └─ chưa → KHÔNG thử bước kế tiếp, nhảy thẳng xuống fallback ↓
 │
 └─ Fallback (published_pages, type=8):
       ├─ is_default = true   → dùng
       ├─ bản publish cũ nhất → dùng        ← không quan tâm apply_type / target của page đó
       └─ không có            → {:error, :not_found}  (v1 chạy tiếp chuỗi route, xem mục 5)
```

Hai hệ quả dễ gây bất ngờ:

- **Trang được gán nhưng chưa publish thì bị bỏ qua hoàn toàn** — ở `published.ex:133-138` resolve chỉ trả *một* page_id; nếu bản publish của nó không có, code không quay lại tìm ứng viên ② / ③ mà rơi thẳng xuống fallback.
- **Fallback `first_template` có thể chọn một template đang gán `custom` cho sản phẩm khác.** `published_pages` không lưu `apply_type`, nên fallback không biết template đó "dành cho ai".

---

## 5. Request public: từ router v1 rẽ sang v2

### 5.1 Site nào là v2

`lib/builderx_api/sites/site.ex:25-26`: cột `sites.version` — `1` = editor v1 (mặc định), `2` = editor_v2. Controller v1 kiểm tra bằng:

```elixir
# lib/builderx_api_web/controllers/v1/pages/page_controller.ex:766-767
defp v2_site?(%{version: v}), do: v in [2, "2"]
defp v2_site?(_), do: false
```

### 5.2 Kỹ thuật `throw` / `catch`

Thay vì sửa từng hàm render v1 dài hàng trăm dòng, dòng **đầu tiên** của mỗi hàm render v1 kiểm tra site và `throw`, rồi mệnh đề `catch` cuối hàm chuyển sang `BuilderxApiWeb.V1.EditorV2.RenderController` (alias `EditorV2Render`, `page_controller.ex:34`):

```elixir
def render_page(conn, params) do
  if v2_site?(conn.assigns[:site]), do: throw({:render_editor_v2, conn, params})   # :770
  ... hàng trăm dòng logic v1 ...
catch
  ...
  {:render_editor_v2, conn, params} -> EditorV2Render.render_page(conn, params)   # :1308
end
```

Vì `throw` xảy ra trước mọi logic v1, site v2 không chạy một dòng v1 nào của hàm đó. Giá trị trả về của hàm v2 trở thành giá trị trả về của hàm v1 — nên hàm v2 có thể trả `{:error, :not_found}` để chuỗi fallback của v1 chạy tiếp.

| Hàm v1 (`page_controller.ex`) | throw ở dòng | catch ở dòng | Hàm v2 (`render_controller.ex`) |
|---|---|---|---|
| `render_page/2` (`:769`) | `:770` | `:1308` ✔ | `render_page/2` `:23` |
| `render_product_page/2` (`:1429`) | `:1430` | **không có trong hàm này** ⚠ | `render_product_page/2` `:47` |
| `render_category_page/2` (`:3023`) | `:3024` | `:3394` ✔ | `render_category_page/2` `:63` |
| `render_blog_page/2` (`:5066`) | `:5067` | `:5444` ✔ | `render_blog_page/2` `:93-113` |
| `render_post_page/2` (`:5447`) | `:5448` | `:5876` ✔ | `render_post_page/2` `:77` |

> ⚠ **Lỗi nghiêm trọng (đọc code, chưa chạy thử request thật):** trong `render_product_page/2`, `throw` ở `:1430` nằm **trước** `try do` (`:1432`), và `try` đó chỉ `catch` `{:is_maintenance, …}` và `_` (`:2095-2105`). Mệnh đề `{:render_editor_v2, …} -> EditorV2Render.render_product_page(…)` ở `:3007` thực ra thuộc hàm **`render_cart_page/2`** (`:2670-3008`) — hàm này không hề throw `:render_editor_v2`. `git log -L` cho thấy mệnh đề này được thêm ở commit `e32084adc add page assignment` vào nhầm hàm. Hệ quả: với site v2, mọi URL khớp pattern sản phẩm → throw không ai bắt → lọt qua `new_render_page(:product)` (chỉ catch `{:redirect, _}`, `:300-302`) → **HTTP 500**. Test `test/builderx_api/editor_v2/render_product_page_test.exs` chỉ test tầng `Published`/`Compile`, không đi qua router nên không bắt được. Sửa: bọc `render_product_page/2` bằng `catch` ở cấp hàm, hoặc chuyển `throw` vào trong `try`.

Các hàm v1 **không** có nhánh v2 (site v2 vẫn chạy logic v1): `render_product_combo_page`, `render_cart_page`, `render_search_page`, `render_complete_page`, `render_order_page`, `render_webcake_page`, trang auth, sitemap, llms.

### 5.3 Routes công khai và chuỗi fallback

`lib/builderx_api_web/router/router.ex:1028-1038` (và các khối tương tự ở `:1064-1072`, `:1091-1098`, `:1184-1193` cho các host khác):

```
GET /                → PageController.render_page        → v2 render_page (path rỗng → trang chủ)
GET /blog            → PageController.render_blog_page   → v2 render_blog_page (không slug → page tĩnh slug "blog")
GET /search|/cart|/complete → v1 (không có nhánh v2)
GET /*path           → PageController.new_render_page/2   (:232-250)
```

`new_render_page/2` tách tiền tố ngôn ngữ (`Tools.get_locale`), xử lý `cart` / `search` / `complete`, còn lại vào chuỗi `new_render_page/3` — mỗi bước khớp pattern URL (custom slug của site), gọi hàm render với `"handle_error" => true`; hàm trả `{:error, :not_found}` thì chuyển bước kế:

```
new_render_page(:product)          pattern mặc định products/:product_slug        :266
   render_product_page  ── v2: ⚠ 500 (mục 5.2)
 → (:product_combo)                 cùng pattern product                          :313   (v1 cho cả site v2)
 → (:category)                      categories/:category_slug                     :353
   render_category_page ── v2: slug không tồn tại → 404 NGAY; không có template → {:error,:not_found} → bước kế
 → (:article)                       blog/post/:article_slug (+ biến thể không category)   :378
   render_post_page     ── v2: slug không tồn tại → 404 NGAY; không có template → bước kế
 → (:search)                        path chứa "search"                            :414
 → (:reset_password)                path chứa "reset-password"                    :435
 → (:page)                          :page_slug (1 đoạn) hoặc slug mặc định        :462
   render_page          ── v2: LUÔN trả conn (200 hoặc 404) → chuỗi DỪNG ở đây
 → (:article_category)              blog/:article_category_slug                   :498
   render_blog_page (không case) ── v2: không có template → {:error,:not_found} ⚠
 → (:order)                         order/:order_id                               :535
 → (:short_link)                                                                   :565
```

Pattern mặc định lấy từ `lib/builderx_api/tools.ex`: product `:1403`, category `:1424`, order `:1463`, article `:1482`, article category `:1550`, page `:1569`. `PageService.check_match/2` (`lib/builderx_api_web/services/page_service.ex:13-35`) chỉ khớp khi **số đoạn bằng nhau**.

Hành vi v2 khác v1 cần biết:

1. **v2 trả 404 ngay khi slug entity không tồn tại** (`serve_404` ở `render_controller.ex:59,73,82,111`) thay vì `{:error, :not_found}`. v1 với `handle_error` thì trả `{:error, :not_found}` để thử bước sau. Nếu merchant đặt custom slug trùng pattern (vd product và page cùng `/:slug`), site v2 sẽ 404 ở bước đầu thay vì thử tiếp.
2. **Bước `:page` trên v2 luôn dừng chuỗi** (`render_page` → `serve_published` → trang hoặc `serve_404`, không bao giờ `{:error, :not_found}`). Với pattern page mặc định `[":page_slug"]` (1 đoạn), mọi URL 1 đoạn không phải trang v2 → 404, **không tới** bước `:short_link`. **Chưa xác minh** bằng request thật; nếu đúng thì short link 1 đoạn không chạy trên site v2.
3. **`render_blog_page` ở bước `:article_category` không `case` kết quả** (`page_controller.ex:525-526`). Nếu site v2 có chuyên mục blog nhưng chưa publish template blog nào → v2 trả `{:error, :not_found}` → action trả tuple này cho `FallbackController`, vốn không có mệnh đề `{:error, :not_found}` (`lib/builderx_api_web/controllers/fallback_controller.ex`) → **lỗi 500** (suy từ code, chưa chạy thử).
4. **Tiền tố ngôn ngữ có thể không được bỏ.** `v2 render_page` ghép slug từ `params["path"]` (`render_controller.ex:26`), nhưng `new_render_page/2` chỉ đặt `params["lang"]`, **không** ghi đè `params["path"]` bằng path đã bỏ tiền tố. Với site đa ngôn ngữ, `/en/about` có thể thành slug `"en/about"` → 404. **Chưa xác minh.**

### 5.4 Bên trong các hàm render động của v2

`lib/builderx_api_web/controllers/v1/editor_v2/render_controller.ex`

```
render_product_page(conn, %{"site_id", "product_slug"})                           :47-61
 ├─ assign_render_context (site_settings)
 ├─ Products.get_product_by_site_id_slug(site, slug)   ── không có → serve_404
 ├─ category_ids = PageAssignments.category_ids_of_product(site_id, product.id)
 └─ Published.get_assigned(site_id, "product", product.id, category_ids)
      └─ serve_dynamic(page, conn, product: product)                               :116-117
           ├─ %PublishedPage{} → serve_published(conn, page, [product: product])
           └─ nil              → {:error, :not_found}

render_category_page  → Categories.get_category_by_site_id_slug → get_assigned("collection", id, [id])   :63-75
render_post_page      → PostBindings.get_post_by_slug          → get_assigned("post", id)               :77-89
render_blog_page
   ├─ không có key "slug"   → render_page(path = ["blog"])          :93-95
   ├─ slug nil hoặc ""      → render_page(path = ["blog"])          :97-99
   └─ có slug → BlogCategories.get_category_by_slug → get_assigned("blog", id)   :101-113
```

Entity (`product:` / `category:` / `article:` / `blog:`) được `struct/2` nhét vào `%QwikV2{}` (`render_controller.ex:186-190`) để các node binding "auto" đọc dữ liệu của entity đang xem. Phần render tiếp theo (SkeletonCache, `Compile.assemble`, template `render_v2.html`) xem [07 — Request render](./07-render-request.md).

### 5.5 Preview draft cũng dùng assignment

`GET /api/v1/editor_v2/sites/:site_id/pages/:id/preview` (`render_controller.ex:125-164`): trang product/post/blog chưa có entity thật, nên `preview_entity/2` lấy `target_ids(page, target_type)` — chỉ khi assignment hiện tại **đúng** target type đó (tức `custom`) — rồi `ProductBindings.sample_product` / `PostBindings.sample_post` / `BlogBindings.sample_blog` chọn một mẫu (ưu tiên id đã gán). Trang category **không** có nhánh preview entity (`preview_entity(_conn, _page) -> []`).

---

## 6. Triệu chứng → chỗ cần kiểm tra

| Triệu chứng | Kiểm tra |
|---|---|
| Site v2: mở trang sản phẩm bị 500 | Mục 5.2 — `throw` ở `page_controller.ex:1430` không có `catch`. Xem log có `** (throw) {:render_editor_v2, …}`. |
| Sản phẩm hiện sai template | Chạy tay theo thứ tự ① custom → ② category (danh mục sâu nhất) → ③ all (`is_default=false`, `apply_type` phải đúng chữ `"all"`, không NULL). Template thắng đã **publish** chưa? (`published_pages` có row `page_id` đó không). |
| Template được gán nhưng web vẫn dùng template mặc định | Template đó chưa publish → `published.ex:135` trả nil → rơi fallback, **không** thử ứng viên tiếp theo. |
| Trang "all" mới tạo không bao giờ được chọn | `pages.apply_type` đang NULL; hoặc trang có `is_default = true` (bị ③ loại, chỉ vào qua fallback). |
| Gán theo danh mục cha không ăn cho SP ở danh mục con | `Products.get_categories_parents/2` — danh mục có `is_removed`? Row `product_categories.is_removed`? |
| Gán theo danh mục cho bài viết không có tác dụng | Render post không truyền `category_ids` (mục 4.3). |
| Panel gán hiển thị thiếu mục đã chọn | Entity đã bị xoá → hydrate không trả về, nhưng id vẫn trong `editor_v2_page_assignments`. |
| `PUT /assignment` trả 400 "nothing to assign" | Trang không thuộc type 4/8/9/10. |
| URL entity trả 404 dù có trang tĩnh cùng slug | v2 404 ngay khi entity không tồn tại (mục 5.3-1); xem custom slug của site. |
| Site đa ngôn ngữ: `/en/...` 404 | Mục 5.3-4 — `params["path"]` còn tiền tố ngôn ngữ. |
| `/blog/<chuyên-mục>` bị 500 | Mục 5.3-3 — chưa publish template blog nào. |
| Short link 1 đoạn không redirect trên site v2 | Mục 5.3-2 — bước `:page` của v2 dừng chuỗi trước `:short_link`. |

Xem thêm: [01 — Data model](./01-data-model.md), [02 — Editor API](./02-editor-api.md), [03 — Global Sections & Nodes](./03-global-sections-nodes.md), [05 — Bindings](./05-bindings.md), [06 — Publish](./06-publish.md), [07 — Request render](./07-render-request.md).
