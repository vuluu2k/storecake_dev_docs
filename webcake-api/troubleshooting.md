# Troubleshooting

Tổng hợp lỗi hay gặp khi vận hành `landing_page_backend`. Khi gặp lỗi mới, ghi lại đây.

## 1. Container `landing-page` không boot

* Đọc log: `docker compose logs landing-page --tail=200`.
* Lỗi `key :xxx not found` → thiếu env. Đối chiếu [Environment](environment.md), bổ sung `.env` và restart.

## 2. Oban queue stuck

Triệu chứng: số job pending tăng dần, không drain.

* Kiểm tra config queue concurrency > 0.
* Trong iex: `Oban.check_queue(:default)` – nếu `paused: true` → `Oban.resume_queue(queue: :default)`.
* Job liên tục fail: xem `errors` field trong `oban_jobs`, fix root cause hoặc tăng `max_attempts`.

## 3. Logical replication lag

* Kiểm tra: `select * from pg_stat_replication;` trên primary.
* Nếu lag tăng do bulk insert: chia batch nhỏ hơn, throttle worker.
* Nếu publication bị broken sau migration → `make init-primary` + `make init-replica` lại.

## 4. Rabbit consumer không nhận message

* UI Rabbit (`http://localhost:15672`) – check queue có message và `consumers` ≥ 1.
* Restart supervisor: `LandingPage.Rabbit.Supervisor.restart_consumers()`.
* Connection issue: kiểm tra `R_HOST`, `R_USERNAME`, password đúng.

## 5. Kafka producer timeout

* `KAFKA1_HOST` / `KAFKA2_HOST` đúng (network docker?).
* Producer kafka cần `metadata` topic – đảm bảo topic đã được tạo (`kafka-topics.sh --create`).
* Tăng `request_timeout` trong config nếu cluster chậm.

## 6. Stripe / Paypal webhook signature mismatch

* `STRIPE_WEBHOOK_SECRET_KEY` đúng môi trường (test vs live).
* Paypal: kiểm tra `PAYPAL_HOST` (`sandbox.paypal.com` vs `paypal.com`).
* Lệch giờ server → đồng bộ NTP.

## 7. Domain verify mãi không pass

* Kiểm tra TXT record đã propagate: `dig TXT yourdomain.com`.
* Domain worker (`domain_worker.ex`) có thể đang backoff – `Oban.retry_job/1`.

## 8. SSL Let's Encrypt fail

* Đảm bảo port 80 open + Nginx forward đúng path challenge.
* Rate limit của LE: 5 lần / domain / tuần.

## 9. Lead không vào CRM

* `form_data_worker` fail – check log Sentry.
* CRM endpoint thay đổi → cập nhật module integration tương ứng.
* Backoff dài, retry sau 1 giờ.

## 10. Mongo connection refused

* Project chính không bắt buộc Mongo, nhưng nếu mở plugin hoặc job đụng Mongo: kiểm tra container Mongo trong `docker-compose-services.yml` đã chạy chưa.

## 11. Migration treo

* Nhiều khả năng do lock bảng lớn. Tách migration ra: tạo cột nullable, backfill bằng worker, rồi add constraint sau.
* Theo dõi qua `pg_stat_activity` để xác định transaction nào block.

## 12. ENV reload không hiệu lực

* Phoenix chỉ đọc `Application` lúc boot. Đổi `.env` → restart container.

## 13. Telebot alert không bắn

* `TELEBOT_ALERT_TOKEN` không hợp lệ hoặc bot bị block.
* Group id `TELEGROUP_ALERT` phải là số âm (group/supergroup).

## 14. AI provider lỗi 429

* `DEEPINFRA_API_KEY` / `GEMINI_API_KEY` hết quota.
* Worker AI nên có retry exponential + circuit breaker.

## 15. Public API trả 401 ở landing publish

* `public_api_router.ex` không yêu cầu JWT user, nhưng có verify signed key. Kiểm tra header (vd `X-Storecake-Signature`).
* Token nội bộ (`STORECAKE_SECRET_KEY`) đồng bộ với `builderx_api`.

## 16. CMS file 404 trên storefront

* Asset chưa được upload lên bucket public. Kiểm tra `S3_BUCKET_PUBLIC` đúng + bucket CORS cho phép domain storefront.

## 17. iex `--remsh` không kết nối

* Cookie node sai. Đảm bảo dùng đúng cookie từ release (`bin/landing_page rpc`).
* Network giữa host và node mở cổng EPMD (4369).

## 18. Khi nào escalate

* Lỗi prod kéo dài > 5 phút (publish fail, lead drop) → mở incident channel, gọi ops.
* Replication drop > 1 phút → ping DBA ngay (mất dữ liệu analytics nếu kéo dài).

Khi giải quyết xong: **cập nhật mục mới** vào file này.
