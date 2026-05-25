---
description: Tài liệu kỹ thuật dành cho dev của nền tảng Webcake / Storecake.
---

# Webcake Docs

## Tổng quan hệ thống

Hệ Storecake / Webcake gồm 3 thành phần chính do dev team duy trì:

| Repo                  | Vai trò                                       | Stack chính                              |
| --------------------- | --------------------------------------------- | ---------------------------------------- |
| `builderx_spa`        | **Storefront** SPA + dashboard quản trị, host BuilderX editor | Vue 3 (Options API), Vite, Pinia, Tailwind, Ant Design Vue, Express SSR proxy |
| `builderx_api`        | **Storefront API** (Storecake commerce)       | Elixir 1.12+, Phoenix 1.5, Ecto + Citus Postgres, Redis, RabbitMQ, Kafka, ElasticSearch, MongoDB |
| `landing_page_backend`| **Webcake API** (landing page / page builder) | Elixir 1.12+, Phoenix 1.5, Ecto + Postgres (logical replication), Oban, Redis, Kafka, RabbitMQ |

Cả 3 repo có thể chạy độc lập, dev tại máy local đều dùng Docker Compose để cô lập service phụ trợ (DB, Redis, RabbitMQ, ElasticSearch, …). Khi liên hệ chéo:

* `builderx_spa` gọi `builderx_api` (chính) và `landing_page_backend` (landing/page builder, CMS file, asset).
* `builderx_api` publish event qua Kafka / RabbitMQ; một số consumer chạy trong `landing_page_backend`.
* `landing_page_backend` cũng có public API riêng cho trang landing đã publish ra ngoài.

## Bắt đầu từ đâu

* **Mới vào team?** Đọc [Cài đặt môi trường](setup.md) rồi xem [Quy trình Git](git-flow.md).
* **Làm Storefront UI?** Vào [Storefront → Công nghệ](storecake-builder/technology.md) và [Cài đặt](installation.md).
* **Làm Storefront API (commerce)?** Bắt đầu với [Storefront API → Công nghệ](storecake-api/technology.md) và [Cài đặt](installation-1.md).
* **Làm Webcake API (landing)?** Bắt đầu với [Webcake API → Công nghệ](webcake-api/technology.md) và [Cài đặt](webcake-api/installation.md).

## Cách dùng docs

* Mỗi repo có một section riêng (**Storefront**, **Storefront API**, **Webcake API**). Mỗi section đều có:
  * **Công nghệ** – stack, version, dependency chính.
  * **Architecture / Project structure** – cách chia layer, vị trí code.
  * **Cài đặt** – setup môi trường dev.
  * **Run / Operations** – các lệnh hay dùng khi vận hành.
  * **Extension & quy ước code** – quy tắc code, lint, đặt tên.
  * **Troubleshooting / Lỗi thường gặp** – các lỗi đã gặp + cách xử.
* Riêng `builderx_spa` có sub-module **Editor V2** – tài liệu sâu về visual editor (kiến trúc, rendering, drag & drop, trait schema, AI page generation…).

## Quy ước trong tài liệu

* Đường dẫn dạng `lib/builderx_api/...` hoặc `src/views/...` là đường dẫn tương đối tính từ root của repo tương ứng.
* Khối `bash` là lệnh chạy ở host, khối `elixir` chạy trong `iex -S mix` (thường vào bằng `make bash` rồi `iex -S mix phx.server`).
* Khi tài liệu nhắc đến `make ...` mà không nói rõ repo thì là Makefile của repo đang được mô tả.

## Repo liên quan (tham chiếu)

* `webcms` – dịch vụ CMS song hành với `builderx_api` cho luồng index Elastic, queue indexing.
* `webcake-ui-kit`, `webcake-data` – package npm dùng chung trong `builderx_spa`.
* `storecake_components` – component library nội bộ kế thừa Ant Design Vue 3.

Khi đụng tới các repo này, tài liệu sẽ chú thích rõ ở chỗ liên quan.

## Đóng góp

Nếu nội dung thiếu hoặc lỗi thời, chỉnh sửa trực tiếp qua link GitHub ở đầu trang — mọi đóng góp đều được hoan nghênh.
