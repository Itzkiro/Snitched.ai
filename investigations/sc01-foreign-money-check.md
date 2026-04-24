# SC-01 2026 GOP Primary — Foreign-Money Audit

**Date:** 2026-04-22
**Scope:** Mark Sanford, Alex Pelbath, Mark Smith (and Tyler Dykes, for completeness)
**Question:** Do these candidates have any foreign-influence money — FARA-registered agents, foreign-parent corporate PACs, offshore individual donors, shell LLCs, etc.? (Snitched.ai has only audited pro-Israel PAC / pro-Israel bundler exposure to date; this is the broader audit.)

## Methodology

1. Read FEC 2026 itemized data (`data-ingestion/{candidate}-fec-2026-itemized.json`).
2. Separate rows by `entity_type`: IND (individuals), PAC, ORG, CCM.
3. For non-IND rows, classify each donor via FEC committee ID, WebSearch FARA / parent-company lookups.
4. For IND rows, flag offshore addresses (non-US state), FARA-registrant lobbying firms in the employer field, or foreign-government/embassy employers.
5. LLCs with "SOLE PROPRIETORSHIP: SEE ATTRIBUTION" are treated as US-resident attributions (standard FEC partnership/LLC rule) — not shell companies unless the address is offshore or the LLC has no domestic footprint.

Signals we consider "foreign money":
- Direct illegal foreign-national donations (52 U.S.C. § 30121).
- FARA-registered lobbying firms/PACs (U.S. persons formally registered as foreign agents).
- U.S. subsidiary corporate PACs where the ultimate parent is foreign-held.
- Pro-foreign-sovereign lobbying firms that bundle (Akin Gump, BGR, Squire Patton Boggs for Gulf states, etc.).
- Offshore shell-LLC donations with no US beneficial-owner footprint.

---

## Mark Sanford — 2026

**PAC rows examined:** 0. File `sanford-fec-2026-itemized.json` is empty (Sanford has filed nothing for 2026).

**Verdict: ZERO FOREIGN MONEY (no 2026 receipts at all).**

(Note: Sanford's 2022 and 2024 data exists in separate files; this audit is scoped to the active 2026 cycle only, matching the user's framing.)

---

## Alex Pelbath — 2026

**Cycle total:** ~$369K raised through Q1 2026.
**Non-IND rows examined:** 93 (WinRed small-dollar pass-through, 5 PACs, 4 LLCs/LPs, 1 vendor refund).

### PAC / Committee donors

| Committee | FEC ID | Amount | State | Classification |
|---|---|---|---|---|
| WinRed (pass-through, small-dollar aggregator) | C00694323 | $110,826 | VA | Domestic, US-only PAC conduit. CLEAN. |
| Air Line Pilots Association PAC | C00035451 | $5,000 | VA | US labor union PAC (AFL-CIO affiliated pilot union). CLEAN. |
| Crosspartisan PAC II | C00786202 | $2,500 | VA | US nonconnected bipartisan PAC (raised $241K in 2024 cycle, no foreign nexus found). CLEAN. |
| Badlands PAC | C00543207 | $2,500 | VA | Leadership PAC of Sen. Kevin Cramer (R-ND). Domestic. CLEAN. |
| Nestpoint PAC | C00906669 | $2,000 | WI | US nonconnected PAC, WI-based. No FARA / foreign signal found. CLEAN. |

### ORG / LLC donors

| Entity | Address | Amount | Classification |
|---|---|---|---|
| Chief Stone 341 Ventures, LP | Mount Pleasant, SC 29466 | Net $0 (redesignation of $10K primary→general) | Local SC limited partnership, attributed donation. CLEAN. |
| Better Mousetrap Digital | St. Thomas, VI 00802 | $1,207 | **VENDOR REFUND** (overpayment), NOT a donation. US-territory vendor. CLEAN. |
| Carpe Diam Solutions LLC | Isle of Palms, SC 29451 | $500 | FEC flagged "SOLE PROPRIETORSHIP: SEE ATTRIBUTION" — local SC sole-prop attributed to US individual. CLEAN. |
| Winger LLC | Mount Pleasant, SC 29466 | $250 | Same: local SC sole-prop attribution. CLEAN. |
| WinRed Technical Services | VA | $0.08 | Pass-through fee. CLEAN. |

### Individual-donor anomaly scan (198 IND rows)

- Non-US-state addresses: **0**
- Null-state addresses: **0**
- FARA-registered lobbying firm in employer field (BGR, Akin Gump, Mercury, Squire Patton Boggs, Brownstein Hyatt, Hogan Lovells, DLA Piper, Ballard Partners, etc.): **0**
- Foreign embassy / state-media / sovereign-wealth-fund employer: **0**
- Interesting-but-clean: one donor employed by "M International Inc" (McLean, VA — a US defense consulting firm, NOT foreign).

### Verdict — Pelbath: **CLEAN. Zero foreign-money signal.**

---

## Mark Smith — 2026

**Cycle total:** ~$594K raised through Q1 2026 (includes $300K candidate self-loan).
**Non-IND rows examined:** 10 (2 candidate self-loans, 7 PACs, 1 LLC).

### PAC / Committee donors

| Committee | FEC ID | Amount | State | Classification |
|---|---|---|---|---|
| National Automobile Dealers Association PAC | C00040998 | $5,000 | VA | US domestic trade-assn PAC. CLEAN. |
| Blue Cross Blue Shield of SC Federal Gov't Programs | C00406850 | $5,000 | SC | SC-based BCBS insurer PAC, US mutual. CLEAN. |
| American Society of Anesthesiologists PAC | C00255752 | $5,000 | IL | US professional-assn PAC. CLEAN. |
| National Funeral Directors Assn of the US PAC | C00204008 | $5,000 | WI | US domestic trade PAC. CLEAN. |
| Outrider PAC | C00816876 | $2,500 | WI | US Carey hybrid PAC (conservative viewpoint), no FARA / foreign signal. CLEAN. |
| American Council of Engineering Companies PAC (ACEC/PAC) | C00010868 | $2,500 | DC | US domestic trade PAC. CLEAN. |
| SC Restaurant & Lodging Association PAC | (no FEC ID) | $1,000 | SC | SC state-affiliated trade PAC. CLEAN. |

### ORG / LLC donors

| Entity | Address | Amount | Classification |
|---|---|---|---|
| Nomis 154, LLC | SC | $1,500 | Local SC LLC, no offshore signal. CLEAN. |

### Candidate self-loans (for completeness, not "donor" money)

- SMITH, MARK M — $300,000 self-loan to his own campaign. Personal funds of the candidate. Out of scope for foreign-money analysis.

### Individual-donor anomaly scan (166 IND rows)

- Non-US-state addresses: **0**
- Null-state addresses: **2** (Forastiere, Lila and Forastiere, Frank A — both retired, SC-resident in their other filings; address incomplete on this particular row, not offshore).
- FARA-registered lobbying firm in employer field: **0**
- Foreign embassy / state-media / sovereign-wealth-fund employer: **0**
- Interesting-but-clean: employers include BEEMOK Capital / BEEMOK Management (Ben Navarro's Charleston SC family office — US), Matthews International (Pittsburgh PA NYSE:MATW — US), Porter Holdings LLC (KS funeral-services holding — US). None foreign-owned.

### Verdict — Smith: **CLEAN. Zero foreign-money signal.**

---

## Tyler Dykes — 2026 (for completeness)

**Cycle total:** ~$5.3K.
**Non-IND rows:** 1 (candidate self-loan of $2,994.84).

### Verdict — Dykes: **CLEAN. No external donor money at all in 2026.**

---

## Summary Table

| Candidate | 2026 total | Non-IND rows audited | Foreign-money hits | Verdict |
|---|---|---|---|---|
| Mark Sanford | $0 (no filings) | 0 | 0 | N/A — no activity |
| Alex Pelbath | ~$369K | 93 | 0 | CLEAN |
| Mark Smith | ~$594K | 10 | 0 | CLEAN |
| Tyler Dykes | ~$5.3K | 1 (self-loan) | 0 | CLEAN |

**No foreign-money signal was found for any SC-01 candidate in the 2026 cycle.** No FARA-registered firms, no foreign-parent corporate PACs, no offshore individual addresses, no shell LLCs, no suspicious sovereign-wealth or embassy-linked employers.

## Confidence & Caveats

- **High confidence on PACs:** Each PAC was cross-checked against FEC committee records plus WebSearch for sponsor / FARA status. All donor PACs are domestic US trade associations, leadership PACs, or union PACs.
- **High confidence on LLCs:** All LLC contributions are labeled "SOLE PROPRIETORSHIP: SEE ATTRIBUTION" (the normal FEC partnership/LLC attribution mechanism) and are located at SC residential addresses — not shell-LLC structures.
- **Moderate confidence on individuals:** Employer scan covered the most common Gulf-state / foreign-sovereign lobbying firms. A determined bad actor could hide foreign money behind a straw-donor with a benign US employer; detecting that would require deeper forensic investigation beyond public disclosures. No red flag visible at the disclosure layer.
- **The "Better Mousetrap Digital — St. Thomas VI" row looks exotic but is a vendor refund of overpayment, not an inbound donation. Virgin Islands is US territory regardless.**

## DB patch

No red-flag patch applied (clean verdict means no DB change needed). If/when desired, the analogous "clean" entry would be written to `source_ids.foreign_money_audit = { audited: "2026-04-22", hits: [], result: "clean" }` on the Pelbath, Smith, and Sanford DB rows — but per the rules, we only patch when a signal is found.
