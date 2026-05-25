---
sidebar_position: 8
title: Cronjob
---

# Cronjob

`builderx_api` dùng **Quantum** (`:quantum`) làm scheduler. Tài liệu này mô tả vị trí code, quy ước và cách kiểm thử ở local.

## Vị trí

- `lib/cronjob/` — Wrapper + helper.
- `lib/builderx_api/business_cronjobs/` — Logic business theo domain (ví dụ tính lại subscription, sync catalog).
- `lib/builderx_api_web/schedule.ex` — Khai báo job + cron expression cho Quantum.

## Cấu hình Quantum

Job được khai báo trong `schedule.ex` (hoặc qua config `:builderx_api, BuilderxApi.Scheduler`). Mỗi job có:

```elixir
job :reindex_products do
  schedule "*/30 * * * *"             # 30 phút một lần
  task &BusinessCronjobs.Products.reindex_changed/0
  run_strategy {Quantum.RunStrategy.Local, [node()]}
  overlap false                        # không chạy đè
end
```

> Đặt `overlap false` cho job dài để tránh job chồng chéo. Job idempotent có thể bỏ qua.

## Quy ước

- Module job đặt dưới `BuilderxApi.BusinessCronjobs.<Domain>`.
- Hàm `run/0` (hoặc `run/1`) thực thi một lần chạy.
- Log thời điểm bắt đầu / kết thúc / thời lượng bằng `Logger.info`.
- Job dài (trên 5 phút) nên chia batch và commit từng phần (transaction nhỏ).
- Catch lỗi, gửi Sentry qua `ErrorTracker.capture/2`, sau đó **re-raise** để Quantum đánh dấu job thất bại.

## Một số job tiêu biểu

| Job | Mục đích |
| --- | --- |
| `reindex_products` | Đẩy sản phẩm thay đổi gần đây vào Elasticsearch. |
| `expire_subscriptions` | Đánh dấu subscription hết hạn, gửi email. |
| `sync_google_merchant` | Đẩy feed Google Merchant theo lịch. |
| `cleanup_short_links` | Xoá short link hết hạn. |
| `recompute_customer_levels` | Tính lại hạng khách hàng. |
| `recheck_domain_ssl` | Kiểm tra lại SSL cho domain tuỳ chỉnh. |

> Danh sách chuẩn nằm trong `schedule.ex`. Khi thêm job mới, cập nhật bảng trên.

## Chạy thử ở local

- Vào IEx (`make bash` → `iex -S mix phx.server`).
- Gọi thủ công:

  ```elixir
  BuilderxApi.BusinessCronjobs.Products.reindex_changed()
  ```

- Kiểm tra Quantum đã đăng ký:

  ```elixir
  Quantum.Job.all(BuilderxApi.Scheduler)
  ```

- Tạm dừng / kích hoạt lại:

  ```elixir
  BuilderxApi.Scheduler.deactivate_job(:reindex_products)
  BuilderxApi.Scheduler.activate_job(:reindex_products)
  ```

## Hành vi khi chạy nhiều node

- Quantum mặc định chạy job trên **mọi node** trừ khi `run_strategy` chỉ định cụ thể.
- Với job ghi DB nặng, ép chạy trên một node duy nhất:

  ```elixir
  run_strategy {Quantum.RunStrategy.Random, [:"app@worker-1"]}
  ```

  Hoặc dùng distributed lock (`BuilderxApi.Redlock`).

## Múi giờ

- Cron expression theo timezone trong `config.exs`:

  ```elixir
  config :builderx_api, BuilderxApi.Scheduler,
    timezone: "Asia/Ho_Chi_Minh"
  ```

- Tránh viết cron theo UTC khi business chạy theo giờ Việt Nam.

## Theo dõi

- Sentry bắt exception trong job.
- Logger metadata: lọc theo `cronjob:<name>`.
- Phoenix LiveDashboard có tab Quantum (khi bật).

## Khi nào *không* dùng Quantum

- Job theo trigger (event-driven) → Outbox + Rabbit consumer.
- Task chạy một lần → `mix run scripts/<name>.exs`.
- Stream chạy dài → GenServer tự lên lịch bằng `Process.send_after/3`.
