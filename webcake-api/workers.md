# Workers (Oban) & Queue

`landing_page_backend` chạy job nền bằng **Oban** (DB-backed) kết hợp **RabbitMQ** (cross-service) và **Kafka** (event stream). Module Oban worker đặt ở `lib/workers/`.

## Oban

### Cấu hình

* Queue & plugin khai báo trong `config/*.exs` (key `:landing_page, Oban`).
* Migration Oban đã có sẵn ở `priv/repo/migrations/` (`*_create_oban_jobs.exs`).
* DB-backed → job persistent ngay cả khi node restart.

Cấu trúc cấu hình ví dụ:

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

### Mỗi worker

```elixir
defmodule LandingPage.Workers.EmailWorker do
  use Oban.Worker, queue: :email, max_attempts: 5

  @impl true
  def perform(%Oban.Job{args: %{"to" => to, "template" => template} = args}) do
    LandingPage.Email.send_template(to, template, args)
  end
end
```

* Cho job dài: dùng `max_attempts` + `backoff` để retry.
* Job idempotent: thêm `unique: [period: 60]` để tránh duplicate.
* Đẩy job: `Oban.insert(EmailWorker.new(%{...}))`.

### Danh sách workers chính

| File                          | Worker                                                              |
| ----------------------------- | ------------------------------------------------------------------- |
| `analytics_worker.ex`         | Tổng hợp event analytics, ghi questdb / Postgres.                   |
| `botcake_worker.ex`           | Bridge sang Botcake (chatbot).                                      |
| `domain_worker.ex`            | Verify domain TXT, SSL.                                             |
| `draft_form_worker.ex`        | Xử lý draft form lead.                                              |
| `email_worker.ex`             | Gửi mail transactional.                                             |
| `form_data_worker.ex`         | Đẩy lead sang CRM / Sheet / webhook.                                |
| `google_worker.ex`            | Job Google Ads / Sheet / Drive.                                     |
| `indexing_worker.ex`          | Index Elastic.                                                      |
| `main_worker.ex`              | Generic fallback (job nhỏ).                                         |
| `partner_service_worker.ex`   | Sync partner service.                                               |
| `susa_worker.ex`              | Sync Susa.                                                          |
| `task_pool_worker.ex`         | Worker generic tuần tự.                                             |
| `transactions_worker.ex`      | Đối soát giao dịch.                                                 |

Khi thêm worker mới, cập nhật bảng trên + tài liệu hoá use-case.

### Cron job qua Oban Cron Plugin

Một số job lặp lại định kỳ:

```elixir
{Oban.Plugins.Cron, crontab: [
  {"*/15 * * * *", LandingPage.Workers.AnalyticsWorker, args: %{type: :aggregate}},
  {"0 * * * *", LandingPage.Workers.DomainWorker, args: %{action: :recheck}},
]}
```

### Quantum (`LandingPage.Scheduler`)

* Một số cron không qua Oban mà qua Quantum (legacy hoặc job phức tạp). File `lib/landing_page/scheduler.ex`, `schedules/`.
* Khi nào dùng cái nào?
  * Cron đơn giản, idempotent → Oban Cron.
  * Workflow logic, branching → Quantum + module riêng.

## Queue abstraction (`lib/queue/`)

* Module wrap chung cho Rabbit/Oban/Kafka.
* Tránh để controller gọi trực tiếp `AMQP.Basic.publish` – sử dụng `LandingPage.Queue.publish/3`.

## RabbitMQ

* `lib/rabbit/` chứa consumer (`use GenRMQ.Consumer`).
* Queue được khai báo trong `LandingPage.Rabbit.Topology`.
* Khi thêm consumer mới: đăng ký vào supervisor (`Rabbit.Supervisor`).

## Kafka

* `lib/event_streaming/` chứa producer + consumer Brod.
* Consumer group đặt theo service: `webcake.<service>.<topic>`.
* Producer dùng `EventStreaming.publish/3`.

## Outbox

* `lib/outbox/`: domain ghi outbox cùng transaction; dispatcher background đẩy event sang queue/webhook.
* Dùng cho luồng cần đảm bảo at-least-once (lead → CRM, transaction → bank).

## Theo dõi & vận hành

* **Oban Web UI** (nếu cài) – tab "Jobs", lọc theo queue, retry, kill.
* `Oban.check_queue(:default)` – kiểm tra trạng thái runtime.
* `Oban.retry_job(job_id)` – retry job thất bại.
* `Oban.cancel_job(job_id)` – huỷ job pending.

Trong iex:

```elixir
import Ecto.Query

# Số job pending mỗi queue
from(j in Oban.Job, group_by: j.queue, select: {j.queue, count(j.id)})
|> LandingPage.Repo.all()
```

## Best practice

* Worker nên **idempotent**: nếu chạy 2 lần không tạo data trùng.
* Truyền data tối thiểu (`%{form_id: id}`) thay vì payload lớn → load lại trong perform.
* Catch & log lỗi trước khi raise → Sentry sẽ thấy stacktrace.
* Tránh job “mãi mãi pending” do queue concurrency = 0; check config khi alert pending tăng.

## Tham chiếu

* [Architecture](architecture.md)
* [Database](database.md)
* [Integrations](integrations.md)
* [Environment](environment.md)
