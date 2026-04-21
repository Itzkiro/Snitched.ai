# Disabled Cron Schedule (for reference)

All cron jobs disabled 2026-04-20 while the public dataset is trimmed to 7
audited candidates. To re-enable selectively, add entries back to `crons` in
`vercel.json`.

Previous schedule:

| Path | Schedule (UTC) |
|---|---|
| `/api/cron/sync-fec` | `0 3 * * *` — daily 3 AM |
| `/api/cron/sync-congress` | `0 4 * * *` — daily 4 AM |
| `/api/cron/sync-legiscan` | `0 5 * * *` — daily 5 AM |
| `/api/cron/sync-social-media` | `0 */6 * * *` — every 6h |
| `/api/cron/sync-court-records` | `5 * * * *` — every hour at :05 |
| `/api/cron/research-candidates` | `0 6 * * *` — daily 6 AM |
| `/api/cron/sync-stats` | `0 */12 * * *` — every 12h |
| `/api/cron/monitor-news` | `0 2,8,14,20 * * *` — 4×/day |
| `/api/cron/track-fec-filings` | `0 3,9,15,21 * * *` — 4×/day |
| `/api/cron/refresh-gallrein-roster` | `0 2 * * 1` — weekly Monday 2 AM |

## Before re-enabling `sync-fec`

It overwrote `israel_lobby_breakdown` wholesale (hardcoded `bundlers: 0`) and
wiped the roster-match individual-donor data. Fixed in 2026-04-20 patch —
now preserves `bundlers`, `bundlers_by_source`, `individual_bundlers`,
`pac_details`, `pacs_by_cycle`, `scoring_rule` from the existing row and
takes `max(incoming, existing)` on `pacs`/`aipac_funding` so single-cycle
pulls don't regress career-sum figures. Verify preservation before re-enable.
