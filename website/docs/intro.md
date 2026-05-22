---
slug: /
sidebar_position: 1
title: Webcake Docs
description: Tài liệu kỹ thuật cho nền tảng Webcake / Storecake.
---

# Tài liệu kỹ thuật Storecake

Chào mừng bạn đến với bộ tài liệu dành cho lập trình viên Storecake. Site này tập hợp hướng dẫn cài đặt, quy ước và quy trình vận hành cho ba repository chính, giúp bất kỳ kỹ sư nào cũng có thể nhanh chóng vào việc, đóng góp và phát hành an toàn.

## Ba dự án chính

| Dự án | Repository | Vai trò | Stack |
| --- | --- | --- | --- |
| **builderx_spa** | `pancake-vn/builderx_spa` | Site builder trên web — giao diện editor cho phép người dùng thiết kế trang trực quan. | Vue 3 + Vite, Express SSR shell, Pinia, Ant Design Vue, TailwindCSS |
| **builderx_api** | `pancake-vn/builderx_api` | Backend lõi của builder — sản phẩm, đơn hàng, tài khoản, các tích hợp, real-time channels. | Phoenix (Elixir), PostgreSQL/Citus, Redis, RabbitMQ, Elasticsearch |
| **landing_page_backend** | `pancake-vn/landing_page_backend` | Dịch vụ phục vụ các landing page đã publish — API công khai, render, capture lead, các tích hợp. | Phoenix (Elixir), PostgreSQL, Redis, RabbitMQ |

## Bắt đầu từ đâu

- **Mới vào team?** Đọc [Setup](./setup.md) để cài đặt môi trường máy, rồi xem [Quy trình Git](./git-flow.md).
- **Làm builder UI?** Vào [Storefront → Công nghệ](./storecake-builder/technology.md) và [Cài đặt](./storecake-builder/installation.md).
- **Làm backend API?** Bắt đầu với [Storefront API → Công nghệ](./storecake-api/technology.md) hoặc [Webcake API → Cài đặt](./webcake-api/installation.md).

## Cách tổ chức tài liệu

Mỗi module dự án đều theo cùng dàn ý để bạn luôn biết tìm thông tin ở đâu:

1. **Công nghệ** — tổng quan stack, các dependency chính, yêu cầu hệ thống.
2. **Cài đặt** — clone, build, chạy local bằng Docker hoặc native.
3. **Extension & quy ước code** — quy ước code, extension editor, lint, i18n.
4. **Tài liệu tham khảo** — liên kết tới docs upstream và ghi chú ngắn về các pattern team đang dùng.
5. **Lỗi / Runbook** — quy trình vận hành thường gặp và lỗi đã biết (chỉ ở module backend).

Nếu thấy nội dung thiếu hoặc lỗi thời, bạn có thể chỉnh sửa trực tiếp qua link GitHub ở đầu trang — mọi đóng góp đều được hoan nghênh.
