---
slug: /
sidebar_position: 1
title: Webcake Docs
description: Tài liệu kỹ thuật cho nền tảng Webcake / Storecake.
---

# Tài liệu kỹ thuật Storecake

Chào mừng bạn đến với bộ tài liệu dành cho lập trình viên Storecake / Webcake. Site này tập hợp hướng dẫn cài đặt, kiến trúc, runbook và quy ước cho ba repository chính của hệ thống, giúp bất kỳ kỹ sư nào cũng có thể nhanh chóng vào việc, đóng góp và phát hành an toàn.

## Ba dự án chính

| Dự án | Repository | Vai trò | Stack |
| --- | --- | --- | --- |
| **builderx_spa** | `pancake-vn/builderx_spa` | Storefront SPA + admin dashboard, đồng thời host visual editor BuilderX. | Vue 3 + Vite, Express SSR shell, Pinia, Ant Design Vue, TailwindCSS |
| **builderx_api** | `pancake-vn/builderx_api` | Backend lõi của Storefront — sản phẩm, đơn hàng, tài khoản, tích hợp, real-time channels. | Phoenix (Elixir), PostgreSQL + Citus, Redis, RabbitMQ, Kafka, ElasticSearch, MongoDB |
| **landing_page_backend** | `pancake-vn/landing_page_backend` | Webcake API — page builder, publish, analytics, capture lead. | Phoenix (Elixir), PostgreSQL (logical replication), Oban, Redis, RabbitMQ, Kafka |

`builderx_spa` gọi cả hai backend; `builderx_api` và `landing_page_backend` dùng chung cụm Rabbit/Kafka nhưng mỗi service có database riêng.

## Bắt đầu từ đâu

- **Mới vào team?** Đọc [Setup](./setup.md) để cài môi trường, rồi xem [Quy trình Git](./git-flow.md).
- **Làm Storefront (UI)?** Bắt đầu với [Storefront → Công nghệ](./storecake-builder/technology.md) và [Architecture](./storecake-builder/architecture.md).
- **Backend Storefront (commerce)?** Vào [Storefront API → Công nghệ](./storecake-api/technology.md), [Architecture](./storecake-api/architecture.md), [Domains](./storecake-api/domains.md).
- **Backend Webcake (landing)?** Bắt đầu với [Webcake API → Công nghệ](./webcake-api/technology.md), [Architecture](./webcake-api/architecture.md), [Workers & Queue](./webcake-api/workers.md).

## Cách tổ chức tài liệu

Mỗi module dự án đều theo cùng dàn ý, giúp bạn luôn biết tìm gì ở đâu:

1. **Công nghệ** — tổng quan stack, dependency chính, yêu cầu hệ thống.
2. **Architecture** — phân lớp, supervision tree, vòng đời request.
3. **Project structure** — bản đồ thư mục, quy ước đặt tên.
4. **Domain-specific guides** — stores / routing / database / workers / integrations tuỳ dự án.
5. **Cài đặt** — clone, build, chạy local bằng Docker hoặc native.
6. **Environment variables** — mọi key, công dụng, nguồn cấp.
7. **Build & Deploy** — pipeline release, Ansible, rollback.
8. **Runbook / Troubleshooting** — thao tác vận hành thường gặp và lỗi đã biết.

Nếu nội dung thiếu hoặc lỗi thời, click **Edit this page** ở cuối trang — mọi đóng góp đều được hoan nghênh.
