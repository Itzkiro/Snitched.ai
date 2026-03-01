
# Example cURL command to insert politicians into Supabase
# Replace YOUR_PROJECT_URL and YOUR_ANON_KEY with actual values

curl -X POST 'https://YOUR_PROJECT_URL.supabase.co/rest/v1/politicians' \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  --data '[
  {
    "politician_id": "c2ec59ab-0063-489b-b61b-81de1b7e934c",
    "name": "Gus M. Bilirakis",
    "office": "U.S. House of Representatives",
    "office_level": "federal",
    "party": "Republican",
    "district": "FL-12",
    "jurisdiction": "Florida",
    "jurisdiction_type": "state",
    "photo_url": "https://theunitedstates.io/images/congress/225x275/B001257.jpg",
    "twitter_handle": "RepGusBilirakis",
    "twitter_user_id": 26051676,
    "facebook_page_id": "GusBilirakis",
    "facebook_page_url": "https://www.facebook.com/GusBilirakis",
    "instagram_handle": "gusbilirakis",
    "youtube_channel_id": "UC2z1uu1n4-60xXs5x1mvLJw",
    "term_start": "2025-01-03",
    "term_end": "2027-01-03",
    "years_in_office": 1,
    "is_active": true,
    "juice_box_tier": "none",
    "aipac_funding_total": 0.0,
    "last_scraped": "2026-02-22T10:55:43.077713"
  }
]'

# For bulk insert, use the batch files:
# cat politicians_batch_01.json | curl -X POST ...

# Python Supabase client example:
# from supabase import create_client
# supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
# response = supabase.table('politicians').insert(records).execute()
