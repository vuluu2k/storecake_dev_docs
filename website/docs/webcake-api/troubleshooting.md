---
sidebar_position: 12
title: Xử lý sự cố
---

# Xử lý sự cố

Vấn đề thường gặp khi vận hành `landing_page_backend`. Bổ sung khi gặp lỗi mới.

## 1. Container `landing-page` không khởi động

- Đọc log: `docker compose logs landing-page --tail=200`.
- `key :xxx not found` → thiếu env. Đối chiếu [Biến môi trường](./environment.md), bổ sung `.env`, restart.

## 2. Queue Oban bị kẹt

Triệu chứng: số job pending tăng dần, không drain.

- Kiểm tra concurrency của queue > 0 trong config.
- Trong IEx: `Oban.check_queue(:default)`; nếu `paused: true` thì `Oban.resume_queue(queue: :default)`.
- Job fail liên tục: xem trường `errors` trong bảng `oban_jobs`, sửa nguyên nhân gốc hoặc tăng `max_attempts`.

## 3. Logical replication bị lag

- Kiểm tra `select * from pg_stat_replication;` trên primary.
- Lag tăng khi bulk insert: chia batch nhỏ hơn, throttle worker.
- Publication hỏng sau migration: chạy lại `make init-primary` + `make init-replica`.

## 4. Rabbit consumer không nhận message

- Mở Rabbit UI (`http://localhost:15672`) — kiểm tra queue có message và `consumers ≥ 1`.
- Restart supervisor: `LandingPage.Rabbit.Supervisor.restart_consumers()`.
- Lỗi kết nối: kiểm tra lại `R_HOST`, `R_USERNAME`, password.

## 5. Producer Kafka timeout

- `KAFKA1_HOST` / `KAFKA2_HOST` đúng (network Docker?).
- Producer cần topic `metadata` — đảm bảo topic đã được tạo.
- Tăng `request_timeout` trong config nếu cluster chậm.

## 6. Webhook Stripe / Paypal sai chữ ký

- `STRIPE_WEBHOOK_SECRET_KEY` khớp môi trường (test so với live).
- Paypal: kiểm tra `PAYPAL_HOST` (`sandbox.paypal.com` so với `paypal.com`).
- Đồng hồ server lệch — đồng bộ NTP.

## 7. Verify domain mãi không pass

- TXT đã propagate? `dig TXT yourdomain.com`.
- Domain worker (`domain_worker.ex`) có thể đang backoff — `Oban.retry_job/1`.

## 8. SSL Let's Encrypt fail

- Mở port 80 và Nginx forward đúng `/.well-known/acme-challenge/`.
- Giới hạn LE: 5 lần issue mỗi domain mỗi tuần.

## 9. Lead không đến được CRM

- `form_data_worker` lỗi — xem Sentry.
- Endpoint CRM đổi → cập nhật module tích hợp.
- Backoff exponential khiến retry có thể cách nhau hàng giờ.

## 10. Mongo connection refused

- Mongo không bắt buộc cho luồng mặc định, nhưng nếu plugin / job dùng Mongo, đảm bảo container trong `docker-compose-services.yml` đã chạy.

## 11. Migration treo

- Thường do lock bảng lớn. Tách thành: thêm cột nullable, backfill bằng worker, sau đó add constraint.
- Theo dõi `pg_stat_activity` để biết transaction nào đang block.

## 12. Đổi env không có hiệu lực

- Phoenix đọc config khi boot. Sửa `.env` xong cần restart container.

## 13. Cảnh báo Telegram không bắn

- `TELEBOT_ALERT_TOKEN` không hợp lệ hoặc bot đã bị block.
- `TELEGROUP_ALERT` phải là số âm (group / supergroup).

## 14. AI provider 429

- `DEEPINFRA_API_KEY` / `GEMINI_API_KEY` đã hết quota.
- Worker AI nên dùng retry tăng dần + circuit breaker.

## 15. Public API trả 401 ở luồng publish landing

- `public_api_router.ex` không cần JWT user nhưng yêu cầu chữ ký — kiểm tra header (ví dụ `X-Storecake-Signature`).
- `STORECAKE_SECRET_KEY` phải khớp với khoá đang ký bên `builderx_api`.

## 16. File CMS 404 trên storefront

- Asset chưa upload lên bucket public. Kiểm tra `S3_BUCKET_PUBLIC` và CORS bucket cho phép domain storefront.

## 17. `iex --remsh` không kết nối

- Sai cookie Erlang. Dùng cookie của release (`bin/landing_page rpc`).
- EPMD (port 4369) phải reachable giữa host và node.

## 18. Khi nào escalate

- Sự cố prod kéo dài > 5 phút (publish hỏng, mất lead) → mở incident channel, gọi ops.
- Replica drop > 1 phút → ping DBA ngay (mất dữ liệu analytics nhanh).

Mỗi khi xử lý xong một vấn đề mới, **thêm vào đây** để người sau tra cứu được.
