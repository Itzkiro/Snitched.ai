# Snitched.ai

**Florida Political Transparency Platform**
Every Politician. Every Dollar. Every Lie. Exposed.

Live at [snitched.ai](https://snitched.ai)

## What It Does

Snitched.ai aggregates publicly available data on every elected official and political candidate in Florida — AIPAC/PAC funding, voting records, social media activity, and legal records — into a single intelligence dashboard.

- **200+ politicians** tracked (federal, state, county)
- **Corruption scores** computed from public funding data
- **Juice Box system** tagging AIPAC-funded politicians by tier
- **Voting records** via Congress.gov API
- **DOGE-style hierarchy** drill-down navigation
- **Terminal/Bloomberg aesthetic** dark intelligence UI

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Runtime | React 19 |
| Database | Supabase (PostgreSQL) — falls back to JSON |
| Styling | CSS custom properties + inline styles |
| Deployment | Vercel |
| Data Pipeline | Python scrapers (FEC, social media, legal) |

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | No | Supabase project URL (falls back to JSON data) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | No | Supabase anonymous key |
| `NEXT_PUBLIC_CONGRESS_API_KEY` | No | Congress.gov API key for voting records |

## Project Structure

```
app/                    Pages (App Router)
  browse/               Database search with filters
  candidates/           Inactive politicians
  hierarchy/            DOGE-style drill-down navigation
  juicebox/             AIPAC funding leaderboard
  officials/            Seated officials by level
  politician/[id]/      Full politician dossier
  tasks/                Internal roadmap
components/             Reusable UI components
lib/                    Data layer (Supabase, types, JSON fallback)
scrapers/               Python data collection scripts
data-ingestion/         Raw + processed politician data
public/politicians/     Headshot images
```

## Deploying

```bash
vercel --prod
```

## License

Private — The AI Dudes, 2026.
