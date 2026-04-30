AEGIS Web — Escalation & Geostrategic Intelligence
==================================================

This is the Next.js implementation of **AEGIS — Advanced Early-Warning & Geostrategic Intelligence System**, rebuilt from the original Streamlit demo.

It exposes:

- A Palantir-style landing page with video background.
- An **Escalation Index** page backed by ACLED data and TypeScript index computation.
- An **Interactive Map** view using ACLED’s public ArcGIS layer.
- AI analysis endpoints backed by Groq (Llama 3).

## Running locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

### Environment variables

Copy `.env.example` to `.env.local` and set:

- `GROQ_API_KEY` — Groq API key for AI insight endpoints.
- `TAVILY_API_KEY` or `SERPER_API_KEY` — optional; enables web search snippets before Groq answers (Tavily preferred if both set).
- `ACLED_EMAIL` — ACLED account email (for research-tier API).
- `ACLED_PASSWORD` — ACLED account password (for research-tier API).
- `RESEND_API_KEY` — Resend API key for contact form (emails to alex.armandblumberg@gmail.com). Get at resend.com.
- `SAM_GOV_API_KEY` — optional free API key for strategic procurement signals from SAM.gov opportunities.
- `ENABLE_STRATEGIC_PACK` — optional toggle (`true`/`false`) for the strategic escalation source pack (defaults to enabled through source packs).
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — strongly recommended for instant map and escalation loads in production. Without shared Redis, cache hits are limited to one serverless instance.
- `WARM_ESCALATION_COUNTRIES` — comma-separated country list warmed by `/api/internal/warm`; set to `all` to batch through every country in the local autocomplete list.
- `MAP_FAST_CACHE_STALE_MS` — optional map stale-cache window. Defaults to seven days so users get an immediate cached map while live feeds refresh.
- `ESCALATION_FAST_CACHE_STALE_MS` — optional escalation stale-cache window. Defaults to thirty days for canonical ACLED country artifacts.

**ACLED (full-history data):** If `ACLED_EMAIL` and `ACLED_PASSWORD` are set, the escalation index uses ACLED’s authenticated API for data from 2018 up to one year ago. If missing, the app falls back to the public ArcGIS layer (limited history).

### Strategic escalation source pack (free/open + free-key)

The map API now includes a strategic source pack that augments `news` and escalation-risk modeling with:

- OFAC Sanctions List Service (open XML)
- UN Security Council consolidated sanctions XML
- DoD / UK MOD official release feeds (with resilient Google News RSS fallback)
- USAspending DoD contract pulse (open API)
- SAM.gov opportunities (optional free API key)

To enable SAM.gov ingestion:

1. Create a free account at [SAM.gov](https://sam.gov/).
2. Generate a personal API key in your profile.
3. Set `SAM_GOV_API_KEY` in `.env.local`.

If the key is missing, the adapter degrades gracefully and the rest of the map pipeline still runs.

## Deployment

1. Push this project to GitHub.
2. Create a new project on Vercel and import the repo.
3. In Vercel project settings, add `GROQ_API_KEY` as an environment variable.
4. Point the `aegis-hq.com` domain at the Vercel project.

