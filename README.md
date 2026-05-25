---
description: Tài liệu kỹ thuật dành cho dev của hệ thống Webcake / Storecake.
---

# Storecake dev docs

## Tổng quan hệ thống

Hệ Storecake / Webcake gồm 3 thành phần chính do dev team duy trì:

| Repo                  | Vai trò                                     | Stack chính                              |
| --------------------- | ------------------------------------------- | ---------------------------------------- |
| `builderx_spa`        | Storefront SPA + dashboard quản trị         | Vue 3 (Options API), Vite, Pinia, Tailwind, Ant Design Vue, Express SSR proxy |
| `builderx_api`        | Storefront API (Storecake)                  | Elixir 1.12+, Phoenix 1.5, Ecto + Citus Postgres, Redis, RabbitMQ, Kafka, ElasticSearch, MongoDB |
| `landing_page_backend`| Webcake API (landing page / page builder)   | Elixir 1.12+, Phoenix 1.5, Ecto + Postgres (logical replication), Oban, Redis, Kafka, RabbitMQ |

Cả 3 repo có thể chạy độc lập, dev tại máy local đều dùng Docker Compose để cô lập service phụ trợ (DB, Redis, RabbitMQ, ElasticSearch, …). Khi cần liên hệ:

* `builderx_spa` gọi tới `builderx_api` (chính) và `landing_page_backend` (cho phần landing/page builder, CMS file, asset).
* `builderx_api` publish event qua Kafka/RabbitMQ; một số consumer chạy trong `landing_page_backend`.
* `landing_page_backend` cũng có public API riêng cho trang landing được publish ra ngoài.

## Cách dùng docs

* Bắt đầu từ phần [Setup](setup.md) và [Git flow](git-flow.md) để nắm convention chung.
* Mỗi repo có một section riêng (Storecake Builder, Storecake Api, Webcake api). Mỗi section đều có:
  * **Technology** – stack, version, dependency chính.
  * **Architecture / Project structure** – cách chia layer, vị trí code.
  * **Installation** – setup môi trường dev.
  * **Run / Operations** – các lệnh hay dùng khi vận hành.
  * **Extension & rules** – quy tắc code, lint, đặt tên.
  * **Troubleshooting / Error** – các lỗi đã gặp + cách xử.
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
