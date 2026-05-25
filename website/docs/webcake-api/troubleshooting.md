---
sidebar_position: 12
title: Troubleshooting
---

# Troubleshooting

Common issues when operating `landing_page_backend`. Add new ones as you encounter them.

## 1. `landing-page` container won't boot

- Read the log: `docker compose logs landing-page --tail=200`.
- `key :xxx not found` → an env is missing. Check [Environment](./environment.md), update `.env`, restart.

## 2. Oban queue stuck

Symptom: pending count grows, queue does not drain.

- Verify queue concurrency > 0 in config.
- IEx: `Oban.check_queue(:default)`; if `paused: true`, run `Oban.resume_queue(queue: :default)`.
- Jobs failing repeatedly: inspect `errors` in `oban_jobs`, fix root cause or bump `max_attempts`.

## 3. Logical replication lag

- Check `select * from pg_stat_replication;` on the primary.
- Lag rising during bulk inserts: smaller batches + throttle workers.
- Publication broken after a migration: re-run `make init-primary` + `make init-replica`.

## 4. Rabbit consumer not consuming

- Rabbit UI (`http://localhost:15672`) — verify queue messages + `consumers ≥ 1`.
- Restart the supervisor: `LandingPage.Rabbit.Supervisor.restart_consumers()`.
- Connection issue: re-check `R_HOST`, `R_USERNAME`, password.

## 5. Kafka producer timeout

- `KAFKA1_HOST` / `KAFKA2_HOST` correct (Docker network?).
- Producer needs `metadata` topic — make sure topics are created.
- Bump `request_timeout` in config if the cluster is slow.

## 6. Stripe / Paypal webhook signature mismatch

- `STRIPE_WEBHOOK_SECRET_KEY` matches the env (test vs live).
- Paypal: confirm `PAYPAL_HOST` (`sandbox.paypal.com` vs `paypal.com`).
- Server clock skewed? Sync NTP.

## 7. Domain verify keeps failing

- TXT record propagated? `dig TXT yourdomain.com`.
- The domain worker (`domain_worker.ex`) may be in backoff — `Oban.retry_job/1`.

## 8. Let's Encrypt SSL failing

- Make sure port 80 is open and Nginx forwards `/.well-known/acme-challenge/`.
- LE rate limit: 5 issuances per domain per week.

## 9. Leads not reaching CRM

- `form_data_worker` failing — check Sentry.
- CRM endpoint changed → update the integration module.
- Exponential backoff means retries can be ~1 hour apart.

## 10. Mongo connection refused

- Mongo not required for default flows, but if a plugin / job touches Mongo, ensure the container in `docker-compose-services.yml` is up.

## 11. Migration hangs

- Likely a lock on a large table. Split: add a nullable column, backfill via a worker, then add constraint.
- Inspect `pg_stat_activity` to see which transaction is blocking.

## 12. Env reload does not take effect

- Phoenix reads `Application` config at boot. Edit `.env`, restart the container.

## 13. Telegram alerts not firing

- `TELEBOT_ALERT_TOKEN` invalid or the bot was blocked.
- `TELEGROUP_ALERT` is a negative number (group / supergroup).

## 14. AI provider 429s

- `DEEPINFRA_API_KEY` / `GEMINI_API_KEY` exhausted.
- AI workers should use exponential retry + circuit breaker.

## 15. Public API returns 401 on landing publish

- `public_api_router.ex` does not require a user JWT but does verify a signed key — check the header (e.g. `X-Storecake-Signature`).
- Confirm `STORECAKE_SECRET_KEY` matches what `builderx_api` is signing with.

## 16. CMS file 404 on the storefront

- Asset was not uploaded to the public bucket. Verify `S3_BUCKET_PUBLIC` and that the bucket CORS allows the storefront domain.

## 17. `iex --remsh` cannot connect

- Wrong Erlang cookie. Use the release cookie (`bin/landing_page rpc`).
- EPMD (port 4369) must be reachable between host and node.

## 18. When to escalate

- Prod incident > 5 minutes (publish failing, leads dropping) → open the incident channel + page ops.
- Replication drop > 1 minute → page the DBA immediately (analytics data loss compounds quickly).

When you solve a new issue, **add it here** so the next person finds it.
