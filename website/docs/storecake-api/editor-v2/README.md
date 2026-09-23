---
sidebar_position: 1
title: Editor V2 & Render V2 (API) — Bắt đầu từ đây
---

# Editor V2 & Render V2 (API) — Bắt đầu từ đây

Bộ tài liệu này mô tả **phía backend** (`builderx_api`) của Editor V2: API mà editor gọi để lưu trang, quy trình **publish**, và cách server **render** trang cho khách xem (Render V2 = engine `QwikV2` bằng Elixir + runtime JS `assets/render_v2`).

Phía frontend (canvas kéo thả, trait panel…) nằm ở [Editor V2 (Storefront)](../../storecake-builder/editor-v2/README.md).

> **Trạng thái**: đồng bộ với branch `feat-builder-v2` của `builderx_api`, commit `3e3eeacb5`, snapshot **2026-09-23**.
> Mọi đường dẫn file trong bộ docs tính từ root repo `builderx_api`.

---

## 1. Cho BA — Editor V2 làm gì, nói bằng lời thường

1. **Chủ shop thiết kế trang** trong editor (kéo thả khối, chữ, ảnh, danh sách sản phẩm…). Mỗi lần bấm lưu, toàn bộ thiết kế được gửi lên server và lưu thành **bản nháp (draft)**. Khách chưa thấy gì.
2. **Bấm Publish** → server chụp lại bản nháp của *mọi trang* trong site, dựng sẵn phần HTML/CSS không đổi, và lưu thành **bản đã xuất bản**. Từ giờ khách mới thấy.
3. **Khách vào shop** → server lấy bản đã xuất bản, **điền dữ liệu mới nhất** (giá, tồn kho, tên sản phẩm, bài viết…) vào các chỗ động, rồi trả trang về. Vì vậy đổi giá sản phẩm **không cần publish lại**, nhưng đổi thiết kế **thì cần**.
4. **Trang động** (trang chi tiết sản phẩm, danh mục, bài viết, blog) dùng chung **một template**. Chủ shop có thể **gán** template riêng cho từng sản phẩm / danh mục; không gán thì dùng template mặc định.
5. **Khối dùng chung** (header, footer…) — sửa một chỗ, mọi trang dùng khối đó đổi theo sau khi publish.
6. Site nào là Editor V2 được đánh dấu bằng cột `version = 2` trên bảng `sites` (`lib/builderx_api/sites/site.ex:26`). Site cũ (v1) vẫn chạy đường render cũ, không bị ảnh hưởng.

| Thao tác của chủ shop | Khách thấy thay đổi khi nào? |
|---|---|
| Sửa thiết kế, bấm Lưu | Chưa thấy (chỉ đổi draft; xem thử được qua Preview) |
| Bấm Publish | Thấy ngay |
| Đổi giá / tên / ảnh sản phẩm trong admin | Thấy ngay, **không cần** publish |
| Sửa header dùng chung | Sau khi Publish |
| Đổi template gán cho một sản phẩm | Thấy ngay (assignment đọc lúc request) — chi tiết [chương 04](./04-page-assignment.md) |

---

## 2. Mô hình tư duy cho dev trong 8 dòng

1. Một trang = **một cây node dạng map phẳng** `%{"nodes" => %{id => node}, "root_node_id" => "ROOT"}`, lưu nguyên JSON trong bảng `page_sources` (draft). Editor V2 **dùng chung** các bảng `pages` / `page_sources` / `page_versions` / `published_pages` với v1, phân biệt bằng cột `version = 2` (`Pages.editor_v2/1`, `lib/builderx_api/editor_v2/pages.ex:19`). Shape y hệt `nodeStore.nodes` phía frontend.
2. Mỗi node có `data.type` (vd `"heading"`); `QwikV2.Registry` (`lib/qwik_v2/registry.ex`) map type → module `QwikV2.Nodes.<Type>.{HTML,CSS,StaticCSS}`.
3. **Draft render** (preview): `QwikV2.build(ctx)` đi đệ quy từ root, sinh ra `{html, css}` trong một lượt.
4. **Publish**: `QwikV2.Compile.compile/1` render cây một lần nhưng **node động bị thay bằng slot** → được `skeleton` (list chuỗi HTML tĩnh xen kẽ `%{"slot" => id}`) + `dynamic_nodes` + `refs` (id sản phẩm/danh mục… cần fetch). CSS được bundle và upload lên Minio.
5. **Public render**: lấy skeleton (qua `QwikV2.SkeletonCache`), fetch dữ liệu theo `refs`, rồi `Compile.assemble/2` chỉ render lại **các slot**. Đây là lý do trang v2 nhanh.
6. Context render (`%QwikV2{}`) được đặt vào **process dictionary** (`Process.put(:qwik_v2_ctx, …)`), mọi node đọc bằng `QwikV2.ctx()` — không truyền tham số qua từng hàm.
7. Global section / global node được lưu dưới dạng **ref** trong cây, chỉ được "ghép" vào lúc đọc (`Pages.composed_source`) hoặc lúc publish.
8. HTML server sinh kèm attribute cho JS; runtime `assets/render_v2` (build bằng Vite, versioned trên Minio) chỉ nạp module cho những node cần tương tác (popup, tab, variant, list-dataset phân trang…).

---

## 3. Bức tranh tổng

```
  EDITOR (builderx_spa)                         KHÁCH (trình duyệt)
        │  /api/v1/editor_v2/sites/:site_id/…           │  https://shop.com/<path>
        ▼                                               ▼
 ┌─────────────────────────────┐          ┌─────────────────────────────────┐
 │ EditorV2.* controllers      │          │ V1 PageController               │
 │ (Page, Node, Version, Site, │          │  v2_site?(site) → throw         │
 │  GlobalSection/Node, Style, │          │  {:render_editor_v2, conn, p}   │
 │  Assignment, Bindings)      │          └───────────────┬─────────────────┘
 └──────────────┬──────────────┘                          ▼
                ▼                           ┌─────────────────────────────────┐
 ┌─────────────────────────────┐            │ EditorV2.RenderController       │
 │ BuilderxApi.EditorV2.*      │  publish   │  render_page / product / …      │
 │  Pages, PageVersions, Nodes │──────────▶ │  preview (draft)                │
 │  GlobalSections/Nodes       │            └───────┬───────────────┬─────────┘
 │  PageAssignments, Published │                    │ published     │ draft
 └──────────────┬──────────────┘                    ▼               ▼
                │                         SkeletonCache +      QwikV2.build
                ▼                         Compile.assemble     (HTML + CSS)
 Citus: pages / page_sources / page_versions /   │               │
        published_pages (version = 2)             └──────┬────────┘
        editor_v2_style_globals / _global_sections       ▼
        _global_nodes / _page_assignments        template render_v2.html
                                                 + CSS bundle (Minio)
                                                 + runtime JS render_v2 (Minio)
```

---

## 4. Bản đồ code

| Khu vực | Đường dẫn | Chương |
|---|---|---|
| Schema, migration, shape JSON | `lib/builderx_api/editor_v2/**/*` (schema), `priv/citus/migrations/2026*` | [01](./01-data-model.md) |
| Route & controller cho editor | `lib/builderx_api_web/router/router.ex` (scope `/editor_v2`), `lib/builderx_api_web/controllers/v1/editor_v2/*` | [02](./02-editor-api.md) |
| Global sections / nodes | `lib/builderx_api/editor_v2/global_{sections,nodes}*` | [03](./03-global-sections-nodes.md) |
| Gán template, trang động | `lib/builderx_api/editor_v2/page_assignments.ex`, `controllers/v1/pages/page_controller.ex` | [04](./04-page-assignment.md) |
| Dữ liệu động (bindings, refs) | `lib/builderx_api/editor_v2/bindings/*`, `lib/qwik_v2/data/*` | [05](./05-bindings.md) |
| Publish | `lib/builderx_api/editor_v2/published.ex`, `lib/qwik_v2/compile.ex`, `lib/qwik_v2/assets.ex` | [06](./06-publish.md) |
| Render request public | `controllers/v1/editor_v2/render_controller.ex`, `renders.ex` | [07](./07-render-request.md) |
| Engine HTML | `lib/qwik_v2/{html,registry,common,scope,…}.ex`, `lib/qwik_v2/nodes/*/html.ex` | [08](./08-qwik-html.md) |
| Engine CSS | `lib/qwik_v2/css.ex`, `lib/qwik_v2/style/*`, `lib/qwik_v2/nodes/*/{css,static_css}.ex` | [09](./09-qwik-css.md) |
| Runtime JS trình duyệt | `assets/render_v2/**`, `lib/qwik_v2/runtime.ex`, `lib/mix/tasks/qwik_v2_*` | [10](./10-render-v2-js.md) |
| Thêm element mới | tổng hợp | [11](./11-add-element.md) |
| Test, debug, troubleshooting | `test/builderx_api/editor_v2/*`, `test/qwik_v2/*` | [12](./12-testing-troubleshooting.md) |

Swagger UI cho toàn bộ API editor_v2: `GET /api/v1/swaggerui` (spec ở `/api/v1/openapi`).

---

## 5. Thứ tự đọc gợi ý

- **BA / PM**: mục 1 ở trên → khung "Cho BA" đầu mỗi chương → [04](./04-page-assignment.md) (template nào hiện cho URL nào) → [06](./06-publish.md) → bảng troubleshooting [12](./12-testing-troubleshooting.md).
- **Dev mới vào**: 01 → 02 → 06 → 07 → 08. Khi cần sửa style đọc 09, sửa tương tác phía trình duyệt đọc 10.
- **Thêm element mới**: [11](./11-add-element.md) (kèm chương 05 của frontend).
- **Đang debug**: [12](./12-testing-troubleshooting.md) trước, rồi bảng "Triệu chứng → chỗ cần kiểm tra" cuối từng chương.

---

## 6. Thuật ngữ nhanh

| Thuật ngữ | Nghĩa |
|---|---|
| **Draft / page source** | Cây node đang chỉnh, bảng `page_sources`. |
| **Version** | Snapshot cây node để khôi phục, bảng `page_versions`. |
| **Published page** | Kết quả publish của một page: skeleton + dynamic nodes + refs + CSS link, bảng `published_pages`. |
| **Skeleton** | List các đoạn HTML tĩnh đã render sẵn, xen giữa là slot `%{"slot" => node_id}`. |
| **Dynamic node / slot** | Node phụ thuộc dữ liệu lúc request (dataset, binding…) — không render lúc publish mà để chỗ trống. |
| **Refs** | Danh sách id theo loại (`product`, `category`, `post`, `blog`…) mà trang cần fetch khi render. |
| **ctx (`%QwikV2{}`)** | Context render: nodes, style global, entity hiện tại (product/category/article/blog), refs, lang, currency. |
| **Entity** | Đối tượng của trang động: sản phẩm đang xem, danh mục đang xem… |
| **Assignment** | Luật "sản phẩm/danh mục nào dùng template page nào". |
| **Global section / global node** | Khối dùng chung nhiều trang; trong cây chỉ lưu ref, ghép vào khi đọc/publish. |
| **Style global** | Bộ màu/font/preset chung của site → biến CSS. |
| **Seed** | Dữ liệu JSON server nhúng vào trang để runtime JS dùng ngay, không phải gọi API lại. |
| **Runtime version** | Phiên bản bundle JS `render_v2` trên Minio, đọc từ `js/editor_v2/current.json`. |

---

## 7. Vấn đề đã phát hiện khi viết docs

Các điểm dưới đây tìm thấy khi đọc code để viết docs (snapshot `3e3eeacb5`), chưa sửa trong code. Chi tiết và file:dòng ở chương tương ứng. "Đã xác minh" = đã đối chiếu trực tiếp luồng gọi; còn lại là suy ra từ code, chưa chạy request thật.

| # | Vấn đề | Ảnh hưởng | Trạng thái | Chương |
|---|---|---|---|---|
| 1 | `throw({:render_editor_v2,…})` trong `render_product_page` (`page_controller.ex:1430`) nằm ngoài `try`; mệnh đề `catch` tương ứng lại nằm nhầm trong `render_cart_page` (`:3007`) | Trang chi tiết sản phẩm của site v2 → 500 | Đã xác minh | [04](./04-page-assignment.md) |
| 2 | Xoá trang chỉ đặt `is_deleted: true`, không gỡ dòng `published_pages` | URL của trang đã xoá vẫn mở được | Đã grep toàn `lib/` | [05](./05-bindings.md), [06](./06-publish.md) |
| 3 | `publish_site` không `rescue` từng trang | Một trang raise → request 500, các trang trước đã ghi DB, các trang sau không được publish, `published_at` **không** cập nhật (dòng cập nhật `published.ex:27-28` nằm sau `Enum.map`). Trang lỗi changeset (`{:error, _}`) thì không raise → publish vẫn chạy tiếp | Suy ra từ code | [06](./06-publish.md) |
| 4 | Sửa global section/node chỉ lên web sau khi **publish lại**; invalidate cache không đổi nội dung | Merchant tưởng đã sửa header nhưng khách chưa thấy | Suy ra từ code | [03](./03-global-sections-nodes.md) |
| 5 | Nhánh v2 rẽ ra trước khi v1 gán `:lang`; slug lấy nguyên `params["path"]` | Site đa ngôn ngữ: `lang` luôn `"en"`, `/en/about` có thể 404 | Chưa xác minh | [07](./07-render-request.md) |
| 6 | Breakpoint mobile là `max-width: 360px` | Điện thoại 375–430px ăn style tablet | Suy ra từ code | [09](./09-qwik-css.md) |
| 7 | `QwikV2.Runtime` cache version JS trong `persistent_term`, không nơi nào gọi `reload/0` | Upload JS mới xong vẫn publish với version cũ đến khi restart | Suy ra từ code | [10](./10-render-v2-js.md) |
| 8 | Export / duplicate site đọc field style global đã đổi tên | Export/duplicate site có style → 500 (`KeyError`) | Suy ra từ code | [01](./01-data-model.md), [02](./02-editor-api.md) |
| 9 | Lỗi "not found" của Page/Node/Version/Assignment trả **422**, spec OpenAPI ghi 404 | Client xử lý lỗi theo spec sẽ sai | Suy ra từ code | [02](./02-editor-api.md) |
| 10 | Template `render_v2.html.eex` có chỗ cho `meta_tags` nhưng `render_doc` không truyền | Trang v2 không có meta SEO | Suy ra từ code | [07](./07-render-request.md) |
