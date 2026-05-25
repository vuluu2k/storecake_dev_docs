# Error catalogue

Tổng hợp lỗi đã gặp khi vận hành `builderx_api` và cách xử nhanh. Khi gặp lỗi mới, **ghi lại đây** (kèm version, ngày, người gặp) để team sau dùng lại.

## 1. Publish hoặc save builder lỗi do thiếu folder

Triệu chứng: action publish/save site/page fail, log báo không ghi được file vào `priv/static/css`.

Cách xử:

```bash
# Trong container app
mkdir -p priv/static/css priv/static/js priv/static/uploads
```

Nguyên nhân: container mới hoặc volume mount mới chưa có folder. Ghi đè permission nếu cần (`chown app:app`).

## 2. Phoenix không boot vì thiếu env

Log mẫu: `** (KeyError) key :stripe_sk not found`.

Cách xử:

* Mở `.env` (hoặc `.dev.env`) → bổ sung biến thiếu (xem [Environment](storecake-api/environment.md)).
* Restart container: `docker compose restart builderx_api`.

## 3. Citus migration fail "table is not distributed"

Triệu chứng: tạo migration thêm cột nhưng báo bảng chưa distribute.

Cách xử:

* Kiểm tra migration trước đó có `SELECT create_distributed_table('table', 'site_id')` không.
* Nếu là bảng mới: chạy lại migration tạo bảng + distribute.
* Nếu bảng đã có ở prod nhưng dev chưa distribute → script lại bằng `mix ecto.rollback -r BuilderxApi.Citus` rồi migrate lại.

## 4. Rabbit consumer không nhận message

* Kiểm tra `BuilderxApi.DynamicApp.start_rabbit` đã chạy chưa (trong dev có thể phải tự start).
* Mở Rabbit UI (`http://localhost:15672`) → kiểm tra queue có message hay không, consumer count ≥ 1.
* Reset connection:

  ```elixir
  AMQP.Connection.close(:my_conn)
  BuilderxApi.DynamicApp.start_rabbit
  ```

## 5. Elastic 429 / circuit breaker

* Bulk index quá nhanh. Giảm batch size trong `Rabbit.IndexingConsumer` hoặc bật backoff.
* Nếu prod, mở Kibana / Elastic monitoring để tìm shard nóng.

## 6. Stripe webhook signature invalid

* `STRIPE_WEBHOOK_SECRET_KEY` không khớp giữa Stripe dashboard và env.
* Thời gian server lệch quá lớn → đồng bộ NTP.

## 7. JWT invalid / expired sau khi đổi `JWT_KEY`

* Đổi `JWT_KEY` sẽ invalidate token cũ – mọi user phải login lại.
* Trong dev: clear `localStorage` / cookie trên `builderx_spa`.

## 8. Memory leak ETS

* Dấu hiệu: RAM tăng dần, ETS table khổng lồ (`:ets.info(table, :size)`).
* Kiểm tra job cache theo site có gọi `:ets.delete(table)` khi site bị xoá.
* Tạm thời restart node để dọn.

## 9. Outbox dispatcher dừng

* Outbox row tăng nhưng không drain → consumer fail.
* Kiểm tra Sentry tìm lỗi gốc.
* Restart dispatcher:

  ```elixir
  Outbox.Dispatcher.restart()
  ```

## 10. Mix deps.get fail vì git package

* Một số dep dùng git ref cụ thể (vd `slugger`, `html_sanitize_ex`). Nếu repo không reachable → kiểm tra mạng / proxy.
* Có thể đặt `MIX_REBAR_PATH` / `HEX_HTTP_TIMEOUT` nếu chậm.

## 11. Lỗi build Vix (libvips)

* Thiếu thư viện libvips trong image. Đảm bảo Dockerfile cài: `apt-get install -y libvips-dev`.

## 12. Phoenix LiveReload không reload

* Port WDS bị block. Set `WDS_SOCKET_HOST=0.0.0.0`, `WDS_SOCKET_PORT=0` (auto).
* Cần chạy `cd assets && npm run watch`.

## 13. Mongo connection refused trong CI

* Service mongo chưa healthcheck. Thêm wait-for-it trong CI step hoặc retry trong test setup.

## 14. Test fail vì sandbox lock

* Test dùng `Ecto.Adapters.SQL.Sandbox` – đảm bảo mỗi test boot setup `Sandbox.checkout(BuilderxApi.Repo)` và `Sandbox.mode/2` đúng.

## 15. Khi nào escalate

* Lỗi không tìm được trong tài liệu **và** không tìm thấy commit liên quan trong 30 phút → đăng lên `#backend-help`.
* Lỗi prod kéo dài > 5 phút ảnh hưởng khách → bật incident channel + thông báo manager.

> Khi giải quyết, **cập nhật mục mới** vào file này thay vì để kiến thức lẩn vào chat.
