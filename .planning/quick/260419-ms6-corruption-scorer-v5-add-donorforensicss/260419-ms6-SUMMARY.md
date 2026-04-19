---
id: 260419-ms6
type: quick
title: "Corruption scorer v5: donorForensicsScore factor + Acton PAC correction"
status: complete
completed: 2026-04-19
---

# Summary: Corruption Scorer v5

## What shipped

### 1. New scoring factor: `donorForensicsScore`

Content-neutral anomaly detection over itemized donor data. Five signals:

| Signal | Trigger | Max contribution |
|---|---|---|
| `missing_employer_ratio` | >40% of >$200 donors missing employer/occupation | 30 pts |
| `out_of_state_pct` | >50% out-of-jurisdiction | 20 pts |
| `household_bundling` | >5% of max donors sharing an address | 25 pts |
| `donation_std_dev` | CV of donation amounts < 0.3 (abnormally uniform) | 15 pts |
| `platform_opacity` | >70% routed through ActBlue/WinRed w/o disclosure | 10 pts |

Raw score capped at 100, weighted at 0.10 in `BASE_WEIGHTS`.

Placeholder (dataAvailable=false) until itemized donor data flows in — `getAdjustedWeights` handles redistribution.

### 2. Rebalanced weights

```
pacContributionRatio:    0.35 → 0.32
lobbyingConnections:     0.20 → 0.18
votingAlignment:         0.25 → 0.22
campaignFinanceRedFlags: 0.20 → 0.18
donorForensicsScore:            0.10  (new)
```

Sum still 1.0.

### 3. OH SOS scraper emits forensic signals

`scripts/sync-oh-state-finance.ts` now exports `computeDonorForensics()` and attaches a `DonorForensics` struct to `OhFinanceResult` when itemized contributions are present. No-op while the OH SOS CFDISCLOSURE portal is in maintenance.

### 4. Acton record corrected

Press-reported Q1 2026 fallback in `scripts/refresh-acton.ts` now reflects the real ~95/5 individual-to-PAC split documented by NBC4 and Signal Ohio:

- Ohio Democratic Party — $125,000 (PAC) — largest single donor
- Ohio Federation of Teachers PAC — ~$102,000 (estimated)
- Ohio State UAW PAC — ~$85,000 (estimated)
- EMILY's List — ~$51,000 (estimated)
- ~76,000 Ohio small-dollar donors — $8,835,000

Bumped `data_source` to `press_reported_2026q1_v2`.

## Score movement

- **Before this quick task:** 5 / A (with 100% individual fallback)
- **After this quick task:** 0 / A (with realistic ~5% PAC, diverse donors)

The drop is honest: correcting the data removed the prior "single placeholder donor = 100% concentration" red flag. The `donorForensicsScore` factor stays in placeholder mode until OH SOS returns and the real itemized donor list is scraped — at which point the ~76K small-dollar pattern can be analyzed for uniformity, out-of-state concentration, bundling, and platform opacity. If anomalies appear, the score will auto-adjust via the cron that runs `sync-corruption-scores.ts`.

## What this does NOT do

- Does not manipulate Acton's score based on identity or perceived religious affiliation
- Does not activate the forensics factor today (no itemized data yet)
- Does not replace the need for real OH SOS scraping when the portal returns

## Follow-ups

1. **When OH SOS returns online**: run `npx tsx scripts/sync-oh-state-finance.ts --candidate "Amy Acton" --committee-name "Ohioans for Amy Acton and David Pepper" --bioguide-id oh-gov-2026-amy-acton --write` to pull itemized donors and populate real forensic signals.
2. **Batch recompute**: `npx tsx scripts/sync-corruption-scores.ts` propagates the v5 algorithm to every politician in the DB (now that a 5th factor exists).
3. **Schema migration (optional)**: persist `corruption_score_details` JSONB and `donor_forensics` JSONB on `politicians` so the frontend can display the factor breakdown.

## Commits

- `feat(scoring): add donorForensicsScore factor (v5 algorithm)` — lib/types.ts + lib/corruption-score.ts
- `feat(finance): emit donor forensic signals from OH SOS scraper` — scripts/sync-oh-state-finance.ts
- `fix(data): correct Acton press-reported finance split (~5% PAC)` — scripts/refresh-acton.ts
- DB write: Acton `oh-gov-2026-amy-acton` updated via `refresh-acton.ts --write`
