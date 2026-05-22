---
description: Tài liệu dành cho lập trình viên Webcake / Storecake.
---

# Webcake Docs

Chào mừng bạn đến với bộ tài liệu kỹ thuật của nền tảng **Webcake / Storecake**. Tài liệu này tập hợp hướng dẫn cài đặt, quy ước, và quy trình vận hành cho ba repository chính, giúp bất kỳ kỹ sư nào cũng có thể nhanh chóng vào việc, đóng góp và phát hành an toàn.

## Ba dự án chính

| Dự án | Repository | Vai trò | Stack |
| --- | --- | --- | --- |
| **builderx_spa** | `pancake-vn/builderx_spa` | Site builder trên web — giao diện editor cho phép người dùng thiết kế trang trực quan. | Vue 3 + Vite, Express SSR shell, Pinia, Ant Design Vue, TailwindCSS |
| **builderx_api** | `pancake-vn/builderx_api` | Backend lõi của builder — sản phẩm, đơn hàng, tài khoản, tích hợp, real-time channels. | Phoenix (Elixir), PostgreSQL/Citus, Redis, RabbitMQ, Elasticsearch |
| **landing_page_backend** | `pancake-vn/landing_page_backend` | Dịch vụ phục vụ các landing page đã publish — API public, render trang, capture lead, các tích hợp. | Phoenix (Elixir), PostgreSQL, Redis, RabbitMQ |

## Bắt đầu từ đâu

- **Mới gia nhập team?** Đọc [Setup](setup.md) để cài đặt môi trường máy, rồi xem [Git flow](git-flow.md) cho quy trình branching và review.
- **Làm builder UI?** Vào [Storefront → Technology](storecake-builder/technology.md) và [Installation](installation.md).
- **Làm backend API?** Bắt đầu với [Storefront API → Technology](storecake-api/technology.md) hoặc [Webcake API → Installation](webcake-api/installation.md).

## Cách tổ chức tài liệu

Mỗi module dự án đều theo cùng một dàn ý để bạn luôn biết tìm thông tin ở đâu:

1. **Technology** — tổng quan stack, dependency chính và yêu cầu hệ thống.
2. **Installation** — clone, build, chạy local bằng Docker hoặc native.
3. **Extension and rules** — quy ước code, extension editor, lint, i18n.
4. **Docs research** — liên kết tới tài liệu upstream và ghi chú ngắn về các pattern team đang dùng.
5. **Error / Run** — runbook cho thao tác vận hành thường gặp và lỗi đã biết (chỉ có ở module backend).

Nếu thấy nội dung thiếu hoặc lỗi thời, bạn có thể chỉnh sửa trực tiếp qua link GitHub ở đầu trang — mọi đóng góp đều được hoan nghênh.
