---
sidebar_position: 1
title: Công nghệ
---

# Công nghệ

**landing_page_backend** là service Phoenix đứng sau mọi landing page đã publish của Webcake/Storecake. Trong khi `builderx_api` phục vụ trải nghiệm editor, service này phụ trách **runtime**: serve trang công khai, capture lead, đẩy dữ liệu sang analytics và các tích hợp khác.

## Khả năng chính

- API công khai cho landing page, form và capture lead.
- Background processing với **Oban** và **GenRMQ** (RabbitMQ).
- Gửi email qua **Bamboo + SMTP**.
- Object storage trên **S3** với xử lý ảnh bằng **Vix** và **Thumbnex**.
- Tích hợp Google Workspace (Sheets, Drive).
- Scheduled job qua **Quantum**.
- Error reporting qua **Sentry**.

## Yêu cầu hệ thống

| Thành phần | Phiên bản |
| --- | --- |
| Elixir | ≥ 1.12.2 |
| Erlang / OTP | ≥ 24 |
| Node.js | ≥ 14 (cho `assets/`) |
| PostgreSQL | Bản 14.x mới nhất |
| Docker · Docker Compose | Bản stable mới nhất (khuyến nghị) |
| Redis · RabbitMQ | Bắt buộc cho đầy đủ tính năng |

## Cấu trúc repository

```
landing_page_backend/
├── lib/
│   ├── landing_page/          # Logic nghiệp vụ — page, lead, tích hợp, worker
│   └── landing_page_web/      # Web layer — controller, router, plug
├── assets/                    # Asset public
├── priv/repo/                 # Migration và seed
├── test/                      # Test suite
├── ansible/                   # Playbook deploy
├── mix.exs
└── Makefile                   # Shortcut dev và deploy
```

## Lệnh Makefile

| Lệnh | Tác dụng |
| --- | --- |
| `make app` | Chạy app trong Docker. |
| `make dev` | Chạy ở chế độ dev với hot reload. |
| `make bash` | Mở shell trong container đang chạy. |
