---
sidebar_position: 8
title: Cronjob
---

# Cronjobs

`builderx_api` dùng **Quantum** (`:quantum`) làm scheduler. Tài liệu này mô tả nơi định nghĩa job, convention và cách chạy thử cục bộ.

## Vị trí code

* `lib/cronjob/` – Module wrapper, helper.
* `lib/builderx_api/business_cronjobs/` – Job logic theo domain (vd recalc subscription, sync catalog).
* `lib/builderx_api_web/schedule.ex` – Quantum entry: define job + cron expression.

## Cấu hình Quantum

Job được khai báo trong `schedule.ex` (hoặc config `:builderx_api, BuilderxApi.Scheduler`). Mỗi job có:

```elixir
job :reindex_products do
  schedule "*/30 * * * *"             # mỗi 30 phút
  task &BusinessCronjobs.Products.reindex_changed/0
  run_strategy {Quantum.RunStrategy.Local, [node()]}
  overlap false                        # không chạy đè
end
```

> Đặt `overlap false` cho job dài, tránh chạy song song nhiều instance. Với job idempotent có thể bỏ.

## Convention

* Module job đặt ở `BuilderxApi.BusinessCronjobs.<Domain>`.
* Hàm `run/0` (hoặc `run/1`) thực thi 1 lần.
* Log start/end + duration bằng `Logger.info`.
* Job dài (> 5 phút) nên chia batch + commit từng phần (transaction nhỏ).
* Catch error rồi `ErrorTracker.capture/2` để báo Sentry nhưng **vẫn re-raise** để Quantum biết job fail.

## Job tiêu biểu

| Job                            | Mô tả                                                 |
| ------------------------------ | ----------------------------------------------------- |
| `reindex_products`             | Đẩy product thay đổi gần đây vào Elastic.             |
| `expire_subscriptions`         | Đánh dấu subscription hết hạn, gửi mail.              |
| `sync_google_merchant`         | Đẩy feed Google Merchant định kỳ.                     |
| `cleanup_short_links`          | Xoá short link hết hạn.                               |
| `recompute_customer_levels`    | Tính lại hạng khách hàng.                             |
| `recheck_domain_ssl`           | Verify lại domain custom SSL.                         |

> Danh sách thực tế xem trong `schedule.ex`. Khi thêm job, cập nhật bảng trên.

## Chạy thử cục bộ

* Vào iex (`make bash` → `iex -S mix phx.server`).
* Trigger thủ công:

  ```elixir
  BuilderxApi.BusinessCronjobs.Products.reindex_changed()
  ```

* Kiểm tra Quantum đã đăng ký:

  ```elixir
  Quantum.Job.all(BuilderxApi.Scheduler)
  ```

* Tạm dừng job để debug:

  ```elixir
  BuilderxApi.Scheduler.deactivate_job(:reindex_products)
  BuilderxApi.Scheduler.activate_job(:reindex_products)
  ```

## Multi-node behavior

* Quantum mặc định chạy job trên **mọi node** trừ khi `run_strategy` chỉ định node cụ thể.
* Với job ghi DB lớn → ép chạy 1 node bằng cách:

  ```elixir
  run_strategy {Quantum.RunStrategy.Random, [:"app@worker-1"]}
  ```

* Hoặc dùng distributed lock (`BuilderxApi.Redlock`) để chỉ 1 instance chạy.

## Timezone

* Cron expression theo timezone configured trong `config.exs`:

  ```elixir
  config :builderx_api, BuilderxApi.Scheduler,
    timezone: "Asia/Ho_Chi_Minh"
  ```

* Tránh ghi cron theo UTC nếu nghiệp vụ tính theo giờ VN.

## Theo dõi

* Sentry: bắt exception trong job.
* Logger: filter theo metadata `cronjob:<name>`.
* Phoenix LiveDashboard có tab “Quantum” (nếu enabled).

## Khi nào KHÔNG dùng Quantum

* Job theo trigger (event-driven) → dùng Outbox + Rabbit consumer.
* Job ad-hoc (run 1 lần) → dùng `mix run scripts/<name>.exs`.
* Long-running stream → dùng GenServer + `Process.send_after/3` để self-schedule.
