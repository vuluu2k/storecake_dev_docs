---
sidebar_position: 7
title: Workers (Oban) & Queue
---

# Workers (Oban) & Queue

`landing_page_backend` runs background work with **Oban** (DB-backed) alongside **RabbitMQ** for cross-service jobs and **Kafka** for event streaming. Oban worker modules live in `lib/workers/`.

## Oban

### Config

- Queues + plugins are declared in `config/*.exs` (`:landing_page, Oban`).
- Oban migration is already present in `priv/repo/migrations/`.
- DB-backed means jobs survive node restarts.

Example config:

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

### Each worker

```elixir
defmodule LandingPage.Workers.EmailWorker do
  use Oban.Worker, queue: :email, max_attempts: 5

  @impl true
  def perform(%Oban.Job{args: %{"to" => to, "template" => template} = args}) do
    LandingPage.Email.send_template(to, template, args)
  end
end
```

- Long jobs: tune `max_attempts` + backoff.
- Idempotent jobs: add `unique: [period: 60]` to avoid duplicates.
- Enqueue: `Oban.insert(EmailWorker.new(%{...}))`.

### Inventory

| File | Purpose |
| --- | --- |
| `analytics_worker.ex` | Aggregates analytics events, writes to QuestDB / Postgres. |
| `botcake_worker.ex` | Bridges into Botcake (chatbot). |
| `domain_worker.ex` | Verifies domain TXT + SSL. |
| `draft_form_worker.ex` | Processes draft form leads. |
| `email_worker.ex` | Sends transactional email. |
| `form_data_worker.ex` | Pushes leads into CRM / Sheets / webhooks. |
| `google_worker.ex` | Google Ads / Sheets / Drive jobs. |
| `indexing_worker.ex` | Updates Elastic indexes. |
| `main_worker.ex` | Generic fallback. |
| `partner_service_worker.ex` | Sync partner services. |
| `susa_worker.ex` | Susa sync. |
| `task_pool_worker.ex` | Sequential generic tasks. |
| `transactions_worker.ex` | Transaction reconciliation. |

Add new workers to this table when you create them.

### Cron via Oban

```elixir
{Oban.Plugins.Cron, crontab: [
  {"*/15 * * * *", LandingPage.Workers.AnalyticsWorker, args: %{type: :aggregate}},
  {"0 * * * *", LandingPage.Workers.DomainWorker, args: %{action: :recheck}},
]}
```

### Quantum (`LandingPage.Scheduler`)

- A few cron jobs use Quantum (`lib/landing_page/scheduler.ex`, `schedules/`) for legacy or branching workflows.
- Rule of thumb:
  - Simple, idempotent cron → Oban Cron plugin.
  - Branching workflow → Quantum with its own module.

## Queue abstraction (`lib/queue/`)

A wrapper around Rabbit / Oban / Kafka. Controllers should not call `AMQP.Basic.publish` directly — go through `LandingPage.Queue.publish/3`.

## RabbitMQ

- Consumers live in `lib/rabbit/` (`use GenRMQ.Consumer`).
- Topology declared in `LandingPage.Rabbit.Topology`.
- New consumers must register in `Rabbit.Supervisor`.

## Kafka

- Producers + consumers in `lib/event_streaming/`.
- Consumer group naming: `webcake.<service>.<topic>`.
- Producer helper: `EventStreaming.publish/3`.

## Outbox

- `lib/outbox/`: writes outbox rows inside a transaction, background dispatcher fans out to queues / webhooks.
- Use for at-least-once flows (lead → CRM, transaction → bank).

## Monitoring

- **Oban Web UI** (if installed): browse queues, retry, kill.
- `Oban.check_queue(:default)` for runtime state.
- `Oban.retry_job(job_id)` / `Oban.cancel_job(job_id)`.

In IEx:

```elixir
import Ecto.Query

from(j in Oban.Job, group_by: j.queue, select: {j.queue, count(j.id)})
|> LandingPage.Repo.all()
```

## Best practices

- Workers must be **idempotent** — running twice should not create duplicates.
- Pass the minimum payload (`%{form_id: id}`) and re-fetch state in `perform/1`.
- Catch, log, then re-raise so Sentry captures the stacktrace.
- A queue that's permanently pending usually has `concurrency: 0` — check config when an alert fires.

## See also

- [Architecture](./architecture.md)
- [Database](./database.md)
- [Integrations](./integrations.md)
- [Environment](./environment.md)
