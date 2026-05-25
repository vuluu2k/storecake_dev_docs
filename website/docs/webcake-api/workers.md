---
sidebar_position: 7
title: Worker (Oban) và Queue
---

# Worker (Oban) và Queue

`landing_page_backend` chạy job nền bằng **Oban** (DB-backed), kết hợp **RabbitMQ** cho job cross-service và **Kafka** cho event stream. Module worker Oban nằm trong `lib/workers/`.

## Oban

### Cấu hình

- Khai báo queue + plugin ở `config/*.exs` (`:landing_page, Oban`).
- Migration của Oban đã có sẵn trong `priv/repo/migrations/`.
- DB-backed nên job vẫn còn sau khi restart node.

Ví dụ cấu hình:

```elixir
config :landing_page, Oban,
  repo: LandingPage.Repo,
  queues: [
    default: 20,
    email: 10,
    indexing: 10,
    analytics: 30,
    google: 5,
    domain: 5,
    transactions: 10,
    susa: 5,
    partner_service: 5
  ],
  plugins: [
    Oban.Plugins.Pruner,
    {Oban.Plugins.Cron, crontab: [...]}
  ]
```

### Mẫu worker

```elixir
defmodule LandingPage.Workers.EmailWorker do
  use Oban.Worker, queue: :email, max_attempts: 5

  @impl true
  def perform(%Oban.Job{args: %{"to" => to, "template" => template} = args}) do
    LandingPage.Email.send_template(to, template, args)
  end
end
```

- Job dài: tinh chỉnh `max_attempts` + backoff.
- Job idempotent: thêm `unique: [period: 60]` để tránh trùng lặp.
- Enqueue: `Oban.insert(EmailWorker.new(%{...}))`.

### Danh mục worker

| Tệp | Mục đích |
| --- | --- |
| `analytics_worker.ex` | Gộp event analytics, ghi vào QuestDB / Postgres. |
| `botcake_worker.ex` | Cầu nối tới Botcake (chatbot). |
| `domain_worker.ex` | Verify domain TXT + SSL. |
| `draft_form_worker.ex` | Xử lý lead dạng draft. |
| `email_worker.ex` | Gửi email transactional. |
| `form_data_worker.ex` | Đẩy lead sang CRM / Sheet / webhook. |
| `google_worker.ex` | Job Google Ads / Sheet / Drive. |
| `indexing_worker.ex` | Cập nhật index Elasticsearch. |
| `main_worker.ex` | Fallback tổng quát. |
| `partner_service_worker.ex` | Đồng bộ partner service. |
| `susa_worker.ex` | Đồng bộ Susa. |
| `task_pool_worker.ex` | Task tuần tự tổng quát. |
| `transactions_worker.ex` | Đối soát giao dịch. |

Khi tạo worker mới, bổ sung vào bảng trên.

### Cron qua Oban

```elixir
{Oban.Plugins.Cron, crontab: [
  {"*/15 * * * *", LandingPage.Workers.AnalyticsWorker, args: %{type: :aggregate}},
  {"0 * * * *", LandingPage.Workers.DomainWorker, args: %{action: :recheck}},
]}
```

### Quantum (`LandingPage.Scheduler`)

- Một vài cron dùng Quantum (`lib/landing_page/scheduler.ex`, `schedules/`) cho legacy hoặc workflow có nhánh.
- Quy tắc chọn:
  - Cron đơn giản, idempotent → Oban Cron plugin.
  - Workflow phân nhánh → Quantum với module riêng.

## Abstraction queue (`lib/queue/`)

Lớp wrap cho Rabbit / Oban / Kafka. Controller không nên gọi `AMQP.Basic.publish` trực tiếp — dùng `LandingPage.Queue.publish/3`.

## RabbitMQ

- Consumer ở `lib/rabbit/` (`use GenRMQ.Consumer`).
- Topology khai báo trong `LandingPage.Rabbit.Topology`.
- Consumer mới phải đăng ký trong `Rabbit.Supervisor`.

## Kafka

- Producer + consumer trong `lib/event_streaming/`.
- Đặt tên consumer group: `webcake.<service>.<topic>`.
- Helper producer: `EventStreaming.publish/3`.

## Outbox

- `lib/outbox/`: ghi dòng outbox trong cùng transaction; dispatcher nền sẽ đẩy ra queue / webhook.
- Dùng cho các luồng cần at-least-once (lead → CRM, transaction → bank).

## Theo dõi

- **Oban Web UI** (nếu cài): xem queue, retry, kill.
- `Oban.check_queue(:default)` cho trạng thái runtime.
- `Oban.retry_job(job_id)` / `Oban.cancel_job(job_id)`.

Trong IEx:

```elixir
import Ecto.Query

from(j in Oban.Job, group_by: j.queue, select: {j.queue, count(j.id)})
|> LandingPage.Repo.all()
```

## Best practice

- Worker phải **idempotent** — chạy hai lần không tạo dữ liệu trùng.
- Truyền payload tối thiểu (`%{form_id: id}`) và load lại state trong `perform/1`.
- Catch lỗi, log, sau đó re-raise để Sentry có stacktrace.
- Queue luôn pending thường do `concurrency: 0` — kiểm tra config khi cảnh báo nổi lên.

## Xem thêm

- [Kiến trúc](./architecture.md)
- [Cơ sở dữ liệu](./database.md)
- [Tích hợp](./integrations.md)
- [Biến môi trường](./environment.md)
