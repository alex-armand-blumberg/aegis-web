# AEGIS Impact — Vercel cron jobs

## Active (Vercel Hobby — max 2 crons)

These are defined in `vercel.json`:

| Schedule (UTC) | Path | Purpose |
|----------------|------|---------|
| `0 0 * * *` | `/api/internal/warm?scope=map` | Warm map caches for ranges 1h, 6h, 24h, 7d, 30d |
| `0 5 * * *` | `/api/internal/impact/ingest?source=ucdp` | Daily UCDP ingest into Neon `impact_events` |

Both routes require `CRON_SECRET` in production. Vercel cron invocations automatically send `Authorization: Bearer $CRON_SECRET`.

Manual test (production):

```
GET /api/internal/impact/ingest?source=ucdp&secret=<CRON_SECRET>
GET /api/internal/warm?scope=map&secret=<CRON_SECRET>
```

## Pro upgrade — escalation cache warming (disabled on Hobby)

When moving to Vercel Pro (or any plan that allows more than 2 crons), add these four batch entries to the `crons` array in `vercel.json`. Escalation warming is split into batches to stay under serverless memory/time limits.

```json
{
  "path": "/api/internal/warm?scope=escalation&batch=1&batches=4",
  "schedule": "0 1 * * *"
},
{
  "path": "/api/internal/warm?scope=escalation&batch=2&batches=4",
  "schedule": "0 2 * * *"
},
{
  "path": "/api/internal/warm?scope=escalation&batch=3&batches=4",
  "schedule": "0 3 * * *"
},
{
  "path": "/api/internal/warm?scope=escalation&batch=4&batches=4",
  "schedule": "0 4 * * *"
}
```

Optional env: `WARM_ESCALATION_COUNTRIES` (comma-separated or `all`), `WARM_MAX_CONCURRENCY` (default 4).
