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

## Deployment

1. Push this project to GitHub.
2. Create a new project on Vercel and import the repo.
3. In Vercel project settings, add `GROQ_API_KEY` as an environment variable.
4. Point the `aegis-hq.com` domain at the Vercel project.

