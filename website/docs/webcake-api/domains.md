---
sidebar_position: 4
title: Domains
---

# Domains

Bounded contexts inside `lib/landing_page/`. Same rule as `builderx_api`: outside callers stay out of `Repo`, cross-domain events go through Outbox + queue.

## Accounts & Organizations

- **`accounts/`** — Webcake users.
- **`organizations/`** — Agencies / multi-account groups.
- **`permissions/`, `access/`** — RBAC; enforced by `LandingPageWeb.Plugs.Access`.
- **`partner_services/`** — Agencies / fulfillment / AI partners.

## Page builder & content

- **`pages/`** — Landing pages (blocks, versions, publish, A/B test).
- **`global_sections/`** — Shared sections across pages.
- **`global_tracks/`** — Global tracking scripts (GA, GTM, pixel).
- **`email_templates/`** — Transactional email templates.
- **`fonts/`** — Uploaded fonts + Google Fonts.
- **`images/`** — Image library (S3-backed).
- **`remove_bacgrounds/`** — Clipping Magic background removal (note the spelling).
- **`emoji/`, `abbreviation.ex`** — Content utilities.

## Forms & datasets

- **`form_data/`** — Lead capture, CRM/Sheet integration.
- **`datasets/`** — Structured datasets for dynamic blocks.
- **`forbidden_keywords/`** — Word filtering.
- **`detect_phone_number.ex`, `detect_scam.ex`** — Anti-abuse.

## Payments & commerce

- **`payments/`** — Payment gateways (Stripe, Paypal, COD).
- **`pos/`** — POS integrations.
- **`commissions/`, `afiliates/`** — Affiliate logic.
- **`campaigns/`** — Marketing campaigns.

## eCommerce integrations

- **`shopify/`, `sapo/`, `haravan/`** — Platform adapters.
- **`sheets/`** — Google Sheets sync.

## Domains & short links

- **`domains/`** — Custom domains (TXT verify, SSL).
- **`domains_error.ex`** — Domain error reasons.
- **`short_links/`** — URL shortener (shares `HOST_PKE`).

## Analytics

- **`analytics/`** — Event aggregation.
- **`pixel_tracking/`** — Server-side pixel.
- **`statistics/`** — Reporting.
- **`conversion_api.ex`** — Conversion APIs (Meta / TikTok / Google).
- **`event_streaming/`** (root lib) — Kafka producers/consumers.
- **`questdb/`** — Time-series.

## Geo & IP

- **`geo/`** — Vietnamese provinces / districts / communes + countries.
- **`ip2locations/`, `IpUtils.ex`** — IP geolocation.

## Audit & logging

- **`changes_log/`** — Data-change audit log.
- **`outbox/`** — Outbox pattern.
- **`error_sync_logs`** (when present) — Sync error log.

## Infra helpers

- **`repo.ex`, `custom_ecto.ex`, `ecto_middleware.ex`, `enum.ex`**.
- **`async.ex`, `cache.ex`, `collapser.ex`, `trace.ex`**.
- **`aws_s3.ex`, `image_resizer.ex`**.
- **`redis.ex`, `redis_pubsub.ex`, `redlock.ex`**.
- **`elastic.ex`, `elastic_index.ex`**.
- **`email.ex`, `mailer.ex`, `email_template_suport.ex`**.
- **`manage.ex`, `run.ex`** — Operations helpers.

## Bridges / RPC

- Sync into `builderx_api` — Signed payloads using `STORECAKE_SECRET_KEY`.
- RPC into `webcms` — `WEBCMS_API` + `WEBCMS_SECRET_KEY`.

## New-domain checklist

1. Create `lib/landing_page/<domain>/` with schema + context.
2. Add a migration to `priv/repo/migrations/`.
3. Admin controller in `lib/landing_page_web/controllers/v1/`.
4. For public (unauthenticated) endpoints, register in `public_api_router.ex` with a dedicated controller.
5. Background work → `lib/workers/<name>_worker.ex` (Oban).
6. Cross-domain events → Outbox → Rabbit / Kafka.

## Gotchas

- `integrations/` and `intergrations/` both exist for historical reasons — confirm which one compiles before adding code (`grep -R "LandingPage.Integrations" lib`).
- `afiliates/` (single "f") is the actual folder name — don't rename without a full refactor.
- The service is sometimes still referred to as "landing_page" in older docs — same repo, just an alias.
