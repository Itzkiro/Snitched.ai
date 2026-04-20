# Ohio School Board Members Seeding Report

**Date:** April 10, 2026  
**Status:** COMPLETED SUCCESSFULLY  
**Total Members Added:** 100

## Summary

Successfully seeded school board members from the top 20 Ohio school districts into the Snitched.ai database. Each district has 5 board members, totaling 100 entries across all districts.

## Districts Covered (20)

| # | District | County | Members |
|---|----------|--------|---------|
| 1 | Columbus City Schools | Franklin | 5 |
| 2 | Cleveland Metropolitan School District | Cuyahoga | 5 |
| 3 | Cincinnati Public Schools | Hamilton | 5 |
| 4 | Toledo Public Schools | Lucas | 5 |
| 5 | Akron Public Schools | Summit | 5 |
| 6 | Dayton Public Schools | Montgomery | 5 |
| 7 | South-Western City School District | Franklin | 5 |
| 8 | Lakota Local School District | Butler | 5 |
| 9 | Olentangy Local School District | Delaware | 5 |
| 10 | Dublin City School District | Franklin | 5 |
| 11 | Hilliard City School District | Franklin | 5 |
| 12 | Westerville City School District | Franklin | 5 |
| 13 | Fairfield City School District | Hamilton | 5 |
| 14 | Mason City School District | Warren | 5 |
| 15 | Centerville-Washington City School District | Montgomery | 5 |
| 16 | Springfield City School District | Clark | 5 |
| 17 | Canton City School District | Stark | 5 |
| 18 | Youngstown City School District | Mahoning | 5 |
| 19 | Lorain City School District | Lorain | 5 |
| 20 | Worthington City School District | Franklin | 5 |

## Data Structure

Each school board member record includes:

- **bioguide_id**: Format: `oh-school-[district]-[seat]-[name]`
  - Example: `oh-school-columbus-city-president-gary-l-baker-ii`
- **name**: Full name of board member
- **office**: "School Board Member - Seat [X]"
- **office_level**: "School Board"
- **party**: "Nonpartisan" (most school board elections are nonpartisan)
- **jurisdiction**: "[District] School District"
- **jurisdiction_type**: "school_district"
- **data_source**: "ohio-school-board-seed-2025"

All records have default fields for:
- `corruption_score`: 0
- `aipac_funding`: 0
- `is_active`: true
- `is_candidate`: false
- `years_in_office`: 0

## Data Sources

All board member information gathered from:

1. **Official District Websites** - Board member roster pages
2. **Ballotpedia** - School board election records and 2025 election results
3. **Recent News Articles** (November 2025) - Board election results and appointments
   - WOSU Public Media (Columbus City Schools)
   - City of Cleveland (Cleveland Metropolitan appointments)
   - WVXU, NBC4 WCMH-TV (Cincinnati Public Schools)
   - Fox19, WTOL (Toledo, Akron elections)

## Key Updates Captured

- **Columbus City Schools**: November 2025 election results (Katzenmeyer, Kennedy, Miranda elected)
- **Cleveland Metropolitan**: December 2024 mayor appointments (Peak, Billups, Jones)
- **Cincinnati Public Schools**: November 2025 board leadership elections
- **Toledo Public Schools**: November 2025 election results (Varwig, Parker, Barnes, Gerken, Vasquez)
- **Akron Public Schools**: November 2025 election results with new board composition
- **All other districts**: Current 2025-2026 board rosters

## Seeding Results

```
✓ Successfully inserted: 100 records
✗ Errors: 0
✓ Completion: 100%
```

All 100 school board members were successfully inserted into the `politicians` table via upsert operation. No conflicts or errors encountered.

## Database Records

Records are now queryable by:

```sql
-- Find all school board members in a district
SELECT * FROM politicians 
WHERE jurisdiction LIKE '%School District%'
  AND jurisdiction = 'Columbus City Schools School District';

-- Find all school board members in a county
SELECT * FROM politicians 
WHERE office_level = 'School Board'
  AND bio LIKE '%Franklin County%';

-- Find all school board members in Ohio
SELECT * FROM politicians 
WHERE office_level = 'School Board'
  AND data_source = 'ohio-school-board-seed-2025';
```

## Future Enhancements

To fully flesh out this data, consider adding:

1. **Photo URLs** - District websites often have board member photos
2. **Social Media Handles** - Twitter, Facebook accounts for board members
3. **Years in Office** - From election history records
4. **Bio Text** - Expanded biographical information from district websites
5. **Contact Information** - Office addresses and phone numbers
6. **Committee Assignments** - Board committees and member roles
7. **Campaign Finance** - If applicable (some school board races involve donations)

## Files Modified

- Created: `/scripts/seed-ohio-school-boards.js` (318 lines)
- Data source configuration follows existing pattern from `seed-ohio-county-officials.js`

## Technical Notes

- Used Supabase upsert operation to allow re-running script without duplicates
- All records use `office_level: 'School Board'` for standardized filtering
- Jurisdiction format: "[District Name] School District" for consistency
- BioGuide ID format matches established convention: `oh-school-[district]-[seat]-[name]`

## Verification Results

Database verification confirms all 100 records successfully inserted:

### Total Count
- **100 school board members** across 20 districts
- **0 errors** during insertion
- **100% success rate**

### Distribution by District (5 members each)
1. Akron Public Schools - 5 members
2. Canton City School District - 5 members
3. Centerville-Washington City School District - 5 members
4. Cincinnati Public Schools - 5 members
5. Cleveland Metropolitan School District - 5 members
6. Columbus City Schools - 5 members
7. Dayton Public Schools - 5 members
8. Dublin City School District - 5 members
9. Fairfield City School District - 5 members
10. Hilliard City School District - 5 members
11. Lakota Local School District - 5 members
12. Lorain City School District - 5 members
13. Mason City School District - 5 members
14. Olentangy Local School District - 5 members
15. South-Western City School District - 5 members
16. Springfield City School District - 5 members
17. Toledo Public Schools - 5 members
18. Westerville City School District - 5 members
19. Worthington City School District - 5 members
20. Youngstown City School District - 5 members

## Query Examples for Data Access

### Get all Ohio school board members
```sql
SELECT * FROM politicians 
WHERE office_level = 'School Board' 
  AND data_source = 'ohio-school-board-seed-2025'
ORDER BY jurisdiction;
```

### Get board members by district
```sql
SELECT name, office, jurisdiction 
FROM politicians 
WHERE jurisdiction = 'Columbus City Schools School District'
  AND office_level = 'School Board';
```

### Get board presidents
```sql
SELECT name, jurisdiction, office 
FROM politicians 
WHERE office LIKE '%President%'
  AND office_level = 'School Board'
  AND data_source = 'ohio-school-board-seed-2025';
```

### Get members by county (via bio field)
```sql
SELECT name, jurisdiction, bio 
FROM politicians 
WHERE bio LIKE '%Franklin County%'
  AND office_level = 'School Board';
```

## Related Documentation

- Seeding script: `/scripts/seed-ohio-school-boards.js`
- Report file: `/OHIO_SCHOOL_BOARD_SEEDING_REPORT.md`
- Similar county officials seeding: `/scripts/seed-ohio-county-officials.js`

---

**Report Generated:** April 10, 2026  
**Data Source Currency:** November 2025 elections + 2025-2026 board rosters
