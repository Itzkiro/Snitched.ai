-- Add individual_donor_breakdown JSONB column to politicians table.
-- Stores per-donor cross-reference results against the pro-Israel individual
-- donor registry (data/pro-israel-donors-YYYY.csv). Produced by scripts like
-- crossref-gallrein-pro-israel.ts.
--
-- Shape (see lib/types.ts Politician.individualDonorBreakdown):
--   {
--     itemized_individual_rows: number,
--     matches: number,
--     high_confidence: number,
--     medium_confidence: number,
--     to_candidate: number,
--     these_donors_to_pro_israel_career: number,
--     match_rate_pct: number,
--     top_donors: Array<{
--       name, state, to_candidate, to_pro_israel_career,
--       candidate_cycles: string[], pro_israel_cycles: string[],
--       pacs: string[], confidence: 'high' | 'medium'
--     }>,
--     source: string,
--     generated_at: string
--   }
ALTER TABLE politicians
  ADD COLUMN IF NOT EXISTS individual_donor_breakdown JSONB DEFAULT NULL;

COMMENT ON COLUMN politicians.individual_donor_breakdown IS
  'Per-donor cross-reference vs pro-Israel individual donor registry. Populated by crossref-*-pro-israel.ts scripts.';
