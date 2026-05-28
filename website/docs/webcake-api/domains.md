---
sidebar_position: 4
title: Bounded context
---

# Domains

Liệt kê bounded context chính của `landing_page_backend`. Quy tắc giống `builderx_api`: ngoài context không chạm `Repo`; cross-domain communicate qua Outbox + queue.

## Account & Tổ chức

* **`accounts/`** – User Webcake.
* **`organizations/`** – Tổ chức / agency, multi-account.
* **`permissions/`, `access/`** – RBAC; plug `LandingPageWeb.Plugs.Access` enforce.
* **`partner_services/`** – Đối tác (agency, fulfillment, AI partner).

## Page builder & Content

* **`pages/`** – Landing page (block, version, publish, A/B test).
* **`global_sections/`** – Section dùng chung giữa page.
* **`global_tracks/`** – Tracking script global (GA, GTM, Pixel).
* **`email_templates/`** – Template email transactional.
* **`fonts/`** – Font tự upload / Google Fonts.
* **`images/`** – Image library (S3 backed).
* **`remove_bacgrounds/`** – Tích hợp Clipping Magic xoá nền (lưu ý chính tả).
* **`emoji/`, `abbreviation.ex`** – Util content.

## Form & Dataset

* **`form_data/`** – Form thu lead, integration CRM/Sheet.
* **`datasets/`** – Dataset có cấu trúc cho block dynamic.
* **`forbidden_keywords/`** – Lọc từ cấm.
* **`detect_phone_number.ex`, `detect_scam.ex`** – Anti-abuse.

## Payments & Commerce

* **`payments/`** – Tích hợp cổng (Stripe, Paypal, COD).
* **`pos/`** – Tích hợp POS.
* **`commissions/`, `afiliates/`** – Affiliate.
* **`campaigns/`** – Marketing campaign.

## Tích hợp eCom

* **`shopify/`, `sapo/`, `haravan/`** – Adapter eCom platform.
* **`sheets/`** – Google Sheets sync.

## Domains & Short links

* **`domains/`** – Custom domain (verify TXT, SSL).
* **`domains_error.ex`** – Domain error catalogue.
* **`short_links/`** – URL shortener (sử dụng cùng HOST_PKE).

## Analytics

* **`analytics/`** – Tổng hợp analytic event.
* **`pixel_tracking/`** – Pixel server-side.
* **`statistics/`** – Báo cáo.
* **`conversion_api.ex`** – Conversion API (Meta / TikTok / Google).
* **`event_streaming/`** (root lib) – Kafka producer/consumer.
* **`questdb/`** – Time-series.

## Geo & IP

* **`geo/`** – Tỉnh/huyện/xã + quốc gia.
* **`ip2locations/`, `IpUtils.ex`** – Geo IP detection.

## Audit & Logging

* **`changes_log/`** – Audit log thay đổi data.
* **`outbox/`** – Outbox pattern.
* **`error_sync_logs`** (nếu được dùng) – Log sync error.

## Infra helpers

* **`repo.ex`, `custom_ecto.ex`, `ecto_middleware.ex`, `enum.ex`**.
* **`async.ex`, `cache.ex`, `collapser.ex`, `trace.ex`**.
* **`aws_s3.ex`, `image_resizer.ex`**.
* **`redis.ex`, `redis_pubsub.ex`, `redlock.ex`**.
* **`elastic.ex`, `elastic_index.ex`**.
* **`email.ex`, `mailer.ex`, `email_template_suport.ex`**.
* **`manage.ex`, `run.ex`** – Helper script.

## Bridge / RPC

* Module sync sang `builderx_api`: tích hợp qua `STORECAKE_SECRET_KEY` signed payload.
* RPC sang `webcms`: dùng `WEBCMS_API` + `WEBCMS_SECRET_KEY`.

## Quy tắc khi tạo domain mới

1. Tạo `lib/landing_page/<domain>/` chứa schema + context.
2. Migration ở `priv/repo/migrations/`.
3. Controller (admin) ở `lib/landing_page_web/controllers/v1/`.
4. Controller (public, không auth) đặt vào `public_api_router.ex` qua controller chuyên biệt.
5. Job nền: `lib/workers/<name>_worker.ex` (Oban).
6. Sự kiện cross-domain → Outbox → Rabbit/Kafka.

## Pitfalls

* Folder `integrations/` và `intergrations/` cùng tồn tại do lịch sử. Khi tạo mới: dùng tên đang compile (chạy `grep -R "LandingPage.Integrations" lib`).
* `afiliates/` (1 chữ ‘f’ thiếu) là chính tả thực tế; đừng đổi tên mà không refactor toàn cục.
* Một số tài liệu cũ gọi service này là “landing_page” – cùng repo, chỉ khác alias.
