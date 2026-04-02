-- Add contribution_breakdown JSONB column to politicians table
-- Stores: {aipac, otherPACs, individuals, corporate} computed from FEC Schedule A data
ALTER TABLE politicians
  ADD COLUMN IF NOT EXISTS contribution_breakdown JSONB DEFAULT NULL;

COMMENT ON COLUMN politicians.contribution_breakdown IS
  'Financial breakdown by donor type: {aipac, otherPACs, individuals, corporate}. Populated by sync-fec cron.';
