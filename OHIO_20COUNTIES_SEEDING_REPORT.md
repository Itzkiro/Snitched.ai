# Ohio 20 Counties - Elected Officials Seeding Report

## Summary

Successfully seeded 220 elected officials across 20 Ohio counties to the Snitched.ai database.

**Date:** April 10, 2026  
**Status:** COMPLETE ✓  
**Total Officials Inserted:** 220  
**Counties Covered:** 20  

## Counties Added

1. Henry County
2. Highland County
3. Hocking County
4. Holmes County
5. Huron County
6. Jackson County
7. Jefferson County
8. Knox County
9. Lawrence County
10. Logan County
11. Madison County
12. Marion County
13. Meigs County
14. Mercer County
15. Monroe County
16. Morgan County
17. Morrow County
18. Muskingum County
19. Noble County
20. Ottawa County

## Data Structure

Each county includes **11 elected officials**:

- **County Commissioners** (3)
- Sheriff (1)
- Prosecuting Attorney (1)
- Clerk of Courts (1)
- County Auditor (1)
- County Treasurer (1)
- County Recorder (1)
- County Coroner (1)
- County Engineer (1)

## Database Schema

All officials were inserted into the `politicians` table with the following key fields:

| Field | Example | Notes |
|-------|---------|-------|
| bioguide_id | `oh-henry-county-commissioner-curt-spindler` | Format: `oh-[county]-[office]-[name]` |
| name | Curt Spindler | Full name |
| office | County Commissioner | Official title |
| office_level | County Commissioner | Office level classification |
| party | Republican | Political party affiliation |
| jurisdiction | Henry County | County + "County" |
| jurisdiction_type | county | Type of jurisdiction |
| is_active | true | All marked as active officials |
| data_source | ohio-county-seed-2025 | Data source attribution |

## Political Party Breakdown

- **Republican:** Majority of counties (Henry, Highland, Hocking, Holmes, Huron, Knox, Logan, Madison, Marion, Meigs, Mercer, Morgan, Morrow, Muskingum, Noble, Ottawa)
- **Democrat:** Jackson, Jefferson, Lawrence
- **Mixed:** Some commissioners in a few counties are from different parties

## Sample Official Records

Example records for Henry County:

```
oh-henry-county-commissioner-curt-spindler | Curt Spindler | County Commissioner | Republican
oh-henry-county-commissioner-mike-schroeder | Mike Schroeder | County Commissioner | Republican
oh-henry-county-commissioner-tim-ruckel | Tim Ruckel | County Commissioner | Republican
oh-henry-sheriff-tim-kubeny | Tim Kubeny | Sheriff | Republican
oh-henry-prosecuting-attorney-aaron-herrig | Aaron Herrig | Prosecuting Attorney | Republican
oh-henry-clerk-of-courts-paige-theobald | Paige Theobald | Clerk of Courts | Republican
oh-henry-county-auditor-tiffany-strickland | Tiffany Strickland | County Auditor | Republican
oh-henry-county-treasurer-jennifer-harris | Jennifer Harris | County Treasurer | Republican
oh-henry-county-recorder-ann-hammersley | Ann Hammersley | County Recorder | Republican
oh-henry-county-coroner-mark-woebkenberg | Mark Woebkenberg | County Coroner | Republican
oh-henry-county-engineer-jeff-schroeder | Jeff Schroeder | County Engineer | Republican
```

## Seeding Script

**File:** `/Users/kirolosabdalla/Snitched.ai/scripts/seed-ohio-20counties.ts`

**Execution:**
```bash
npx tsx scripts/seed-ohio-20counties.ts
```

**Method:** Upsert via Supabase service role with conflict resolution on `bioguide_id`

## Verification

Run verification script to confirm seeding:

```bash
npx tsx scripts/verify-ohio-20-final.ts
```

**Output:**
- All 220 officials confirmed in database
- All bioguide_ids properly formatted as `oh-*`
- All 9 required office types present per county
- All jurisdictions set to "[County] County"

## Notes

- All officials are marked as `is_active: true`
- No photo URLs provided (null)
- Corruption score initialized to 0
- Party affiliations based on public voting records
- No aipac_funding or israel_lobby_total values (initialized to 0)

## Previous Seeding

This seeding adds 20 additional counties NOT previously in the database.  
Previously seeded Ohio counties (28): Allen, Butler, Clermont, Columbiana, Delaware, Fairfield, Franklin, Geauga, Greene, Hamilton, Hancock, Lake, Licking, Lorain, Lucas, Mahoning, Medina, Miami, Montgomery, Pickaway, Portage, Richland, Stark, Trumbull, Tuscarawas, Warren, Wayne, Wood

## Total Ohio Coverage

After this seeding: **48 out of 88 Ohio counties** have been added to the database.

---

**Verified:** April 10, 2026
**Database:** Supabase (xwaejtxqhwendbbdiowa)
