---
sidebar_position: 4
title: Bounded context
---

# Bounded context

Các bounded context trong `lib/landing_page/`. Quy tắc giống `builderx_api`: phía gọi bên ngoài tránh `Repo`, event cross-domain đi qua Outbox + queue.

## Tài khoản và tổ chức

- **`accounts/`** — User của Webcake.
- **`organizations/`** — Tổ chức / agency đa tài khoản.
- **`permissions/`, `access/`** — RBAC, áp dụng qua `LandingPageWeb.Plugs.Access`.
- **`partner_services/`** — Agency / fulfillment / đối tác AI.

## Page builder và nội dung

- **`pages/`** — Landing page (block, version, publish, A/B test).
- **`global_sections/`** — Section dùng chung giữa các trang.
- **`global_tracks/`** — Tracking script toàn cục (GA, GTM, Pixel).
- **`email_templates/`** — Template email transactional.
- **`fonts/`** — Font tự upload + Google Fonts.
- **`images/`** — Thư viện ảnh (S3-backed).
- **`remove_bacgrounds/`** — Xoá nền qua Clipping Magic (lưu ý chính tả).
- **`emoji/`, `abbreviation.ex`** — Tiện ích nội dung.

## Form và dataset

- **`form_data/`** — Capture lead, tích hợp CRM / Sheet.
- **`datasets/`** — Dataset có cấu trúc phục vụ block động.
- **`forbidden_keywords/`** — Lọc từ cấm.
- **`detect_phone_number.ex`, `detect_scam.ex`** — Anti-abuse.

## Thanh toán và thương mại

- **`payments/`** — Cổng thanh toán (Stripe, Paypal, COD).
- **`pos/`** — Tích hợp POS.
- **`commissions/`, `afiliates/`** — Affiliate.
- **`campaigns/`** — Chiến dịch marketing.

## Tích hợp eCommerce

- **`shopify/`, `sapo/`, `haravan/`** — Adapter cho từng nền tảng.
- **`sheets/`** — Đồng bộ Google Sheets.

## Domain và short link

- **`domains/`** — Domain tuỳ chỉnh (verify TXT, SSL).
- **`domains_error.ex`** — Lý do lỗi domain.
- **`short_links/`** — Rút gọn URL (chia sẻ `HOST_PKE`).

## Analytics

- **`analytics/`** — Tổng hợp event.
- **`pixel_tracking/`** — Pixel server-side.
- **`statistics/`** — Báo cáo.
- **`conversion_api.ex`** — Conversion API (Meta / TikTok / Google).
- **`event_streaming/`** (cấp lib gốc) — Producer / consumer Kafka.
- **`questdb/`** — Time-series.

## Địa lý và IP

- **`geo/`** — Tỉnh / huyện / xã + quốc gia.
- **`ip2locations/`, `IpUtils.ex`** — Geo IP.

## Audit và log

- **`changes_log/`** — Log thay đổi dữ liệu.
- **`outbox/`** — Pattern Outbox.
- **`error_sync_logs`** (khi có) — Log lỗi sync.

## Helper hạ tầng

- **`repo.ex`, `custom_ecto.ex`, `ecto_middleware.ex`, `enum.ex`**.
- **`async.ex`, `cache.ex`, `collapser.ex`, `trace.ex`**.
- **`aws_s3.ex`, `image_resizer.ex`**.
- **`redis.ex`, `redis_pubsub.ex`, `redlock.ex`**.
- **`elastic.ex`, `elastic_index.ex`**.
- **`email.ex`, `mailer.ex`, `email_template_suport.ex`**.
- **`manage.ex`, `run.ex`** — Helper vận hành.

## Cầu nối / RPC

- Đồng bộ sang `builderx_api` — payload ký bằng `STORECAKE_SECRET_KEY`.
- RPC sang `webcms` — `WEBCMS_API` + `WEBCMS_SECRET_KEY`.

## Checklist khi thêm domain mới

1. Tạo `lib/landing_page/<domain>/` chứa schema + context.
2. Migration trong `priv/repo/migrations/`.
3. Controller admin ở `lib/landing_page_web/controllers/v1/`.
4. Endpoint public (không cần auth) → đăng ký trong `public_api_router.ex` qua controller riêng.
5. Job nền → `lib/workers/<name>_worker.ex` (Oban).
6. Event cross-domain → Outbox → Rabbit / Kafka.

## Lưu ý

- `integrations/` và `intergrations/` cùng tồn tại do lịch sử — kiểm tra tên đang được compile (`grep -R "LandingPage.Integrations" lib`) trước khi thêm code mới.
- `afiliates/` (thiếu chữ "f") là tên thật của thư mục — không rename khi chưa refactor toàn cục.
- Một số tài liệu cũ vẫn gọi service là "landing_page" — cùng repo, chỉ khác alias.
