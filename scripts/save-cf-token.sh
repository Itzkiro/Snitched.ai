#!/bin/bash
# save-cf-token.sh — Validate a Cloudflare API token and persist it to ~/.zshrc.local
# Usage: ./save-cf-token.sh
#   You'll be prompted to paste the token. It is never echoed or logged.

set -e

ZONE_ID="2e1dcd9aa3a5bd72eb9f43960163b6eb"   # snitched.ai
RC_FILE="$HOME/.zshrc.local"

printf "Paste the new Cloudflare API token (input hidden): "
read -s TOKEN
echo
echo

if [ -z "$TOKEN" ]; then
  echo "ERROR: empty token"; exit 1
fi

if [ "${#TOKEN}" -lt 40 ]; then
  echo "ERROR: token too short (got ${#TOKEN} chars, expected ~53). You may have pasted a partial copy."
  exit 1
fi

echo "Token length: ${#TOKEN} chars"
echo

echo "Test 1: list zones (requires Zone:Read)…"
CODE=$(curl -s -o /tmp/cf_t1.json -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID")
if [ "$CODE" != "200" ]; then
  echo "  FAIL HTTP $CODE"; cat /tmp/cf_t1.json; echo
  echo "→ Token is invalid or scope lacks Zone:Read for snitched.ai. Fix at https://dash.cloudflare.com/profile/api-tokens"
  exit 1
fi
echo "  OK HTTP 200"

echo "Test 2: list DNS records (requires Zone:DNS:Read)…"
CODE=$(curl -s -o /tmp/cf_t2.json -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?per_page=1")
if [ "$CODE" != "200" ]; then
  echo "  FAIL HTTP $CODE"; cat /tmp/cf_t2.json; echo
  echo "→ Token missing 'Zone:DNS:Edit' (or wrong zone scope). In the token editor:"
  echo "   - Add permission: Zone / DNS / Edit"
  echo "   - Zone Resources: Include → Specific zone → snitched.ai"
  exit 1
fi
echo "  OK HTTP 200"

echo "Test 3: read zone settings (requires Zone:Zone Settings:Edit)…"
CODE=$(curl -s -o /tmp/cf_t3.json -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/settings/security_level")
if [ "$CODE" != "200" ]; then
  echo "  FAIL HTTP $CODE"; cat /tmp/cf_t3.json; echo
  echo "→ Token missing 'Zone:Zone Settings:Edit'. Add it in the token editor."
  exit 1
fi
echo "  OK HTTP 200"

echo "Test 4: list firewall/ruleset (requires Zone:Firewall Services:Edit)…"
CODE=$(curl -s -o /tmp/cf_t4.json -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/rulesets")
if [ "$CODE" != "200" ]; then
  echo "  FAIL HTTP $CODE"; cat /tmp/cf_t4.json; echo
  echo "→ Token missing 'Zone:Firewall Services:Edit'. Add it in the token editor."
  exit 1
fi
echo "  OK HTTP 200"

echo
echo "✅ All 4 permission checks passed."
echo

# Remove any old CF_API_TOKEN lines and append the new one
if [ -f "$RC_FILE" ]; then
  cp "$RC_FILE" "${RC_FILE}.bak.$(date +%s)"
  /usr/bin/sed -i '' '/CF_API_TOKEN/d' "$RC_FILE"
fi
echo "export CF_API_TOKEN=\"$TOKEN\"" >> "$RC_FILE"

# Cleanup
rm -f /tmp/cf_t1.json /tmp/cf_t2.json /tmp/cf_t3.json /tmp/cf_t4.json
unset TOKEN

echo "Saved to $RC_FILE (old file backed up with timestamp)."
echo "Run: source ~/.zshrc.local   then tell Claude 'verified'."
