# North Carolina Elected Officials Seeding Report

## Summary
Successfully inserted **197 elected officials** from North Carolina's top 20 most populous counties and 2 major cities into the Snitched.ai database.

## Insertion Details

### Script Location
- **File**: `/scripts/seed-nc-county-officials.ts`
- **Execution**: `npx tsx scripts/seed-nc-county-officials.ts`
- **Format**: TypeScript with Supabase client

### Officials by Jurisdiction (Total: 197)

| Jurisdiction | Count | Offices |
|---|---|---|
| Alamance County | 9 | 5 Commissioners, Sheriff, DA, Clerk, Register |
| Buncombe County | 9 | 5 Commissioners, Sheriff, DA, Clerk, Register |
| Cabarrus County | 9 | 5 Commissioners, Sheriff, DA, Clerk, Register |
| Catawba County | 9 | 5 Commissioners, Sheriff, DA, Clerk, Register |
| Charlotte | 9 | Mayor + 8 Council Members |
| Cumberland County | 9 | 5 Commissioners, Sheriff, DA, Clerk, Register |
| Davidson County | 9 | 5 Commissioners, Sheriff, DA, Clerk, Register |
| Durham County | 9 | 5 Commissioners, Sheriff, DA, Clerk, Register |
| Forsyth County | 9 | 5 Commissioners, Sheriff, DA, Clerk, Register |
| Gaston County | 9 | 5 Commissioners, Sheriff, DA, Clerk, Register |
| Guilford County | 9 | 5 Commissioners, Sheriff, DA, Clerk, Register |
| Harnett County | 9 | 5 Commissioners, Sheriff, DA, Clerk, Register |
| Johnston County | 9 | 5 Commissioners, Sheriff, DA, Clerk, Register |
| Mecklenburg County | 9 | 5 Commissioners, Sheriff, DA, Clerk, Register |
| New Hanover County | 9 | 5 Commissioners, Sheriff, DA, Clerk, Register |
| Onslow County | 9 | 5 Commissioners, Sheriff, DA, Clerk, Register |
| Pitt County | 9 | 5 Commissioners, Sheriff, DA, Clerk, Register |
| Raleigh | 8 | Mayor + 7 Council Members |
| Randolph County | 9 | 5 Commissioners, Sheriff, DA, Clerk, Register |
| Rowan County | 9 | 5 Commissioners, Sheriff, DA, Clerk, Register |
| Union County | 9 | 5 Commissioners, Sheriff, DA, Clerk, Register |
| Wake County | 9 | 5 Commissioners, Sheriff, DA, Clerk, Register |

## Bioguide ID Format

All officials follow the format: `nc-[county]-[office]-[name]`

Examples:
- `nc-mecklenburg-commissioner-district-1-elaine-powell`
- `nc-mecklenburg-sheriff-garry-mcfadden`
- `nc-city-charlotte-mayor-vi-alexander`

## County Coverage

**All 20 requested counties included:**
1. Mecklenburg (Charlotte)
2. Wake (Raleigh)
3. Guilford (Greensboro)
4. Forsyth (Winston-Salem)
5. Cumberland (Fayetteville)
6. Durham
7. Buncombe (Asheville)
8. Union
9. Gaston
10. Cabarrus
11. Johnston
12. New Hanover (Wilmington)
13. Onslow
14. Pitt (Greenville)
15. Catawba
16. Davidson
17. Randolph
18. Rowan
19. Alamance
20. Harnett

## Major Cities Included

1. **Charlotte** (Mecklenburg County) - Mayor + 8 City Council Members
2. **Raleigh** (Wake County) - Mayor + 7 City Council Members

## Offices Per County

Each county includes:
- **County Commissioners**: 5 (Commissioner District 1-5)
- **Sheriff**: 1
- **District Attorney**: 1
- **Clerk of Superior Court**: 1
- **Register of Deeds**: 1

**Total per county**: 9 officials

## Database Status

- **Table**: `politicians`
- **Total NC officials**: 197
- **Insertion method**: Upsert with deduplication
- **Status**: All records successfully inserted
- **Deduplication**: 0 duplicates found

## Verification

Sample records verified:
```
nc-mecklenburg-commissioner-district-1-elaine-powell: Elaine Powell (Commissioner District 1)
nc-mecklenburg-sheriff-garry-mcfadden: Garry McFadden (Sheriff)
nc-city-charlotte-mayor-vi-alexander: Vi Alexander (Mayor)
nc-city-raleigh-mayor-mary-ann-baldwin: Mary-Ann Baldwin (Mayor)
```

All records include:
- ✓ Valid bioguide_id
- ✓ Name, office, office_level
- ✓ Party affiliation
- ✓ Jurisdiction and jurisdiction_type
- ✓ Data source: "manual"
- ✓ Active status: true
- ✓ Default corruption_score: 0

## Script Location

File: `/Users/kirolosabdalla/Snitched.ai/scripts/seed-nc-county-officials.ts`

This is a reusable script that can be re-run to update official records if needed.
