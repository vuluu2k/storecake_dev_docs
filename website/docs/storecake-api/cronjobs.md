---
sidebar_position: 8
title: Cronjobs
---

# Cronjobs

`builderx_api` uses **Quantum** (`:quantum`) as its scheduler. This page covers where jobs live, our conventions, and how to test locally.

## Where

- `lib/cronjob/` — Wrapper + helpers.
- `lib/builderx_api/business_cronjobs/` — Business logic per domain (e.g. recompute subscription, sync catalog).
- `lib/builderx_api_web/schedule.ex` — Quantum entry: declare jobs + cron expressions.

## Quantum config

Jobs are declared in `schedule.ex` (or via `:builderx_api, BuilderxApi.Scheduler` config). Each job sets:

```elixir
job :reindex_products do
  schedule "*/30 * * * *"             # every 30 minutes
  task &BusinessCronjobs.Products.reindex_changed/0
  run_strategy {Quantum.RunStrategy.Local, [node()]}
  overlap false                        # don't run on top of itself
end
```

> Use `overlap false` for long-running jobs to avoid pile-ups. Idempotent jobs may skip it.

## Conventions

- Job modules live under `BuilderxApi.BusinessCronjobs.<Domain>`.
- `run/0` (or `run/1`) executes one round.
- Log start / end / duration with `Logger.info`.
- Long jobs (over 5 minutes) should batch + commit in chunks (small transactions).
- Catch errors, send to Sentry via `ErrorTracker.capture/2`, then re-raise so Quantum marks the job failed.

## Notable jobs

| Job | Purpose |
| --- | --- |
| `reindex_products` | Push recently-changed products into Elastic. |
| `expire_subscriptions` | Mark expired subscriptions, send emails. |
| `sync_google_merchant` | Push Google Merchant feeds. |
| `cleanup_short_links` | Purge expired short links. |
| `recompute_customer_levels` | Recompute loyalty tiers. |
| `recheck_domain_ssl` | Reverify custom-domain SSL. |

> The authoritative list lives in `schedule.ex`. Update the table above when you add a job.

## Local testing

- Enter IEx (`make bash` → `iex -S mix phx.server`).
- Trigger manually:

  ```elixir
  BuilderxApi.BusinessCronjobs.Products.reindex_changed()
  ```

- Inspect Quantum registration:

  ```elixir
  Quantum.Job.all(BuilderxApi.Scheduler)
  ```

- Pause / resume:

  ```elixir
  BuilderxApi.Scheduler.deactivate_job(:reindex_products)
  BuilderxApi.Scheduler.activate_job(:reindex_products)
  ```

## Multi-node behavior

- Quantum runs jobs on **every node** by default unless `run_strategy` says otherwise.
- For jobs with heavy writes, pin to a single node:

  ```elixir
  run_strategy {Quantum.RunStrategy.Random, [:"app@worker-1"]}
  ```

  …or use the distributed lock (`BuilderxApi.Redlock`).

## Timezone

- Cron expressions follow the timezone in `config.exs`:

  ```elixir
  config :builderx_api, BuilderxApi.Scheduler,
    timezone: "Asia/Ho_Chi_Minh"
  ```

- Avoid writing UTC expressions when the business logic runs in VN time.

## Monitoring

- Sentry captures exceptions raised inside jobs.
- Logger metadata: filter by `cronjob:<name>`.
- Phoenix LiveDashboard exposes a Quantum tab (when enabled).

## When *not* to use Quantum

- Event-driven work → Outbox + Rabbit consumer.
- One-shot tasks → `mix run scripts/<name>.exs`.
- Long-running streams → GenServer that self-schedules with `Process.send_after/3`.
