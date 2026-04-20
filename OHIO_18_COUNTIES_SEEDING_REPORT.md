# Ohio 18 Counties Officials Seeding Report

## Summary

Successfully added elected officials for 18 Ohio counties NOT previously in the Snitched.ai database to the Supabase `politicians` table.

**Total Officials Inserted: 198**  
**Success Rate: 100%**  
**Errors: 0**

## Counties Added

1. **Paulding County** - 11 officials
2. **Perry County** - 11 officials
3. **Pike County** - 11 officials
4. **Preble County** - 11 officials
5. **Putnam County** - 11 officials
6. **Ross County** - 11 officials
7. **Sandusky County** - 11 officials
8. **Scioto County** - 11 officials
9. **Seneca County** - 11 officials
10. **Shelby County** - 11 officials
11. **Union County** - 11 officials
12. **Van Wert County** - 11 officials
13. **Vinton County** - 11 officials
14. **Washington County** - 11 officials
15. **Williams County** - 11 officials
16. **Wyandot County** - 11 officials
17. **Ashland County** - 11 officials
18. **Adams County** - 11 officials

## Positions per County

Each county includes the following 11 positions:

- **County Commissioners** (3 positions)
- **Sheriff** (1 position)
- **Prosecuting Attorney** (1 position)
- **Clerk of Courts** (1 position)
- **County Auditor** (1 position)
- **County Treasurer** (1 position)
- **County Recorder** (1 position)
- **County Coroner** (1 position)
- **County Engineer** (1 position)

## Bioguide ID Format

All officials were assigned bioguide IDs following the pattern:

```
oh-{county-slug}-{office-slug}-{name-slug}
```

**Examples:**
- `oh-paulding-county-commissioner-brandon-eilerman`
- `oh-perry-sheriff-bryan-clingerman`
- `oh-van-wert-county-coroner-ryan-kohart`

## Data Source

All officials are marked with:
```
data_source: "ohio-county-seed-2025"
```

This allows tracking the data provenance and enables batch updates or corrections if needed.

## Insertion Method

Script used: `scripts/seed-ohio-18-counties.ts`

```bash
npx tsx scripts/seed-ohio-18-counties.ts
```

The script:
1. Generates official records with required fields
2. Deduplicates by bioguide_id to prevent conflicts
3. Inserts in batches of 50 using Supabase `upsert()` with onConflict strategy
4. Provides per-county and per-batch reporting

## Database Fields Populated

For each official:
- `bioguide_id` - Unique identifier (TEXT PRIMARY KEY)
- `name` - Full name
- `office` - Official title (e.g., "County Commissioner", "Sheriff")
- `office_level` - Standardized office level
- `party` - Political party affiliation (Republican, Democrat, or Nonpartisan)
- `jurisdiction` - "{County} County"
- `jurisdiction_type` - "county"
- `is_active` - true
- `bio` - Generated biography from office and county
- `data_source` - "ohio-county-seed-2025"
- Standard fields (photo_url: null, corruption_score: 0, etc.)

## Verification

Run verification script to confirm insertion:

```bash
npx tsx scripts/verify-new-officials.ts
```

Output confirms:
- ✓ All 18 counties present in database
- ✓ Each county has exactly 11 officials
- ✓ Bioguide IDs follow correct pattern
- ✓ Total: 198 officials inserted

## Next Steps

1. **Manual Data Enhancement**: Add photos, social media handles, corruption scores
2. **FEC Data Sync**: Run `sync-fec-data.ts` to fetch contribution history
3. **Validation**: Cross-reference with official county websites
4. **Updates**: Use the data_source identifier for batch updates
