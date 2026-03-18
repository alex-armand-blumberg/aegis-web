# Intel Infrastructure Setup

This project now supports a World Monitor-style ingestion pattern:

- `RSS network adapter` (direct RSS + domain fallback)
- optional `relay seed digest` for high-volume pre-aggregated points
- optional Redis tiered cache for feed digests

## Required for baseline

No additional infrastructure is required for baseline operation. The map API will run using direct provider calls.

## Optional: Relay seed digest

Set `INTEL_RELAY_DIGEST_URL` to an endpoint that returns:

```json
{
  "points": [
    {
      "id": "string",
      "title": "string",
      "subtitle": "string",
      "lat": 0,
      "lon": 0,
      "country": "string",
      "source": "string",
      "timestamp": "ISO date",
      "url": "https://...",
      "snippet": "string",
      "imageUrl": "https://...",
      "severity": "low|medium|high|critical",
      "eventType": "string"
    }
  ]
}
```

## Optional: Redis cache (Upstash REST)

Set:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

When configured, network digest cache is persisted across server instances. Without Redis, in-memory cache is used.

## Health checks

Use:

- `/api/map/health`
- `/api/map/sources`

These endpoints show env coverage, source families, and map-source registry metadata.

