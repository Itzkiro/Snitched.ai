#!/bin/bash
# Research FL candidates using AFUnitedAI agent
# Usage: ./scripts/research-fl-candidates.sh [--limit N] [--offset N] [--dry-run]
#
# Pulls FL officials from Supabase, runs AFUnitedAI on each one,
# and stores results back in the DB via a companion TypeScript script.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
AFUNITED_DIR="$HOME/AFUnitedAI"
WORKSPACE="$PROJECT_DIR/investigations"

LIMIT="${LIMIT:-10}"
OFFSET="${OFFSET:-0}"
DRY_RUN="${DRY_RUN:-false}"

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --limit) LIMIT="$2"; shift 2 ;;
    --offset) OFFSET="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

mkdir -p "$WORKSPACE"

echo "=== AFUnitedAI FL Candidate Research ==="
echo "Limit: $LIMIT | Offset: $OFFSET | Dry run: $DRY_RUN"
echo ""

# Export Supabase env for the TypeScript helper
export SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY
source "$PROJECT_DIR/.env" 2>/dev/null || true

# Get candidate list from Supabase
echo "Fetching FL candidates from Supabase..."
CANDIDATES=$(cd "$PROJECT_DIR" && npx tsx -e "
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const all = [];
  let offset = 0;
  while (true) {
    const { data } = await s.from('politicians')
      .select('bioguide_id, name, office, party, jurisdiction')
      .or('bioguide_id.like.fl-%,jurisdiction.eq.Florida')
      .is('bio', null)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    all.push(...data);
    offset += 1000;
    if (data.length < 1000) break;
  }
  // Also get those with very short bios
  offset = 0;
  while (true) {
    const { data } = await s.from('politicians')
      .select('bioguide_id, name, office, party, jurisdiction')
      .or('bioguide_id.like.fl-%,jurisdiction.eq.Florida')
      .not('bio', 'is', null)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    const shortBio = data.filter(p => (p.bio || '').length <= 50);
    all.push(...shortBio);
    offset += 1000;
    if (data.length < 1000) break;
  }
  // Deduplicate
  const seen = new Set();
  const deduped = all.filter(p => { if (seen.has(p.bioguide_id)) return false; seen.add(p.bioguide_id); return true; });
  // Apply offset and limit
  const batch = deduped.slice(${OFFSET}, ${OFFSET} + ${LIMIT});
  batch.forEach(p => console.log(JSON.stringify(p)));
}
run();
")

if [ -z "$CANDIDATES" ]; then
  echo "No candidates to research."
  exit 0
fi

TOTAL=$(echo "$CANDIDATES" | wc -l | tr -d ' ')
echo "Processing $TOTAL candidates..."
echo ""

COUNT=0
ERRORS=0

while IFS= read -r line; do
  COUNT=$((COUNT + 1))
  ID=$(echo "$line" | python3.11 -c "import sys, json; print(json.load(sys.stdin)['bioguide_id'])")
  NAME=$(echo "$line" | python3.11 -c "import sys, json; print(json.load(sys.stdin)['name'])")
  OFFICE=$(echo "$line" | python3.11 -c "import sys, json; print(json.load(sys.stdin).get('office', 'Unknown'))")
  PARTY=$(echo "$line" | python3.11 -c "import sys, json; print(json.load(sys.stdin).get('party', 'Unknown'))")
  JURISDICTION=$(echo "$line" | python3.11 -c "import sys, json; print(json.load(sys.stdin).get('jurisdiction', 'Florida'))")

  echo "[$COUNT/$TOTAL] Researching: $NAME ($OFFICE, $PARTY, $JURISDICTION)"

  if [ "$DRY_RUN" = "true" ]; then
    echo "  [DRY RUN] Would research $NAME"
    continue
  fi

  OUTPUT_DIR="$WORKSPACE/$ID"
  mkdir -p "$OUTPUT_DIR"

  TASK="Investigate Florida official $NAME. They hold the office of $OFFICE ($PARTY) in $JURISDICTION.

Research and produce a comprehensive profile including:
1. Background and career history
2. Campaign finance analysis — total raised, top donors, PAC vs individual, any foreign-affiliated PAC money (especially AIPAC/Israel lobby)
3. Voting record highlights on key issues (border security, foreign aid, trade, sovereignty)
4. Lobbying connections
5. Any court cases, ethics complaints, or controversies
6. Faith profile if publicly known
7. America First Score with evidence-backed grading

Write findings to a file called findings.md in the workspace. Be thorough but factual — cite sources."

  # Run AFUnitedAI in headless mode
  # Source AFUnitedAI .env for ANTHROPIC_API_KEY
  source "$AFUNITED_DIR/.env" 2>/dev/null || true
  cd "$AFUNITED_DIR"
  python3.11 -m agent \
    --workspace "$OUTPUT_DIR" \
    --provider anthropic \
    --model claude-sonnet-4-5-20250514 \
    --anthropic-api-key "$ANTHROPIC_API_KEY" \
    --task "$TASK" \
    --headless \
    --max-depth 2 \
    --max-steps 30 \
    2>"$OUTPUT_DIR/agent-stderr.log" || {
      echo "  ✗ Agent failed or timed out for $NAME"
      ERRORS=$((ERRORS + 1))
      continue
    }

  # Check if findings were produced
  if [ -f "$OUTPUT_DIR/findings.md" ]; then
    FINDINGS_SIZE=$(wc -c < "$OUTPUT_DIR/findings.md" | tr -d ' ')
    echo "  ✓ Findings: ${FINDINGS_SIZE} bytes"

    # Store bio back in Supabase
    cd "$PROJECT_DIR"
    npx tsx -e "
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const findings = readFileSync('$OUTPUT_DIR/findings.md', 'utf-8');
  // Extract a bio summary (first ~500 chars of findings)
  const bio = findings.substring(0, 2000);
  const { error } = await s.from('politicians').update({
    bio: bio,
    updated_at: new Date().toISOString(),
  }).eq('bioguide_id', '$ID');
  if (error) console.error('DB error:', error.message);
  else console.log('  ✓ Stored in DB');
}
run();
" 2>&1 || echo "  ✗ DB update failed"
  else
    echo "  ✗ No findings.md produced"
    ERRORS=$((ERRORS + 1))
  fi

done <<< "$CANDIDATES"

echo ""
echo "=== Summary ==="
echo "Processed: $COUNT"
echo "Errors:    $ERRORS"
echo "Success:   $((COUNT - ERRORS))"
