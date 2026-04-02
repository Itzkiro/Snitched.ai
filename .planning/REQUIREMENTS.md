# Requirements: Snitched.ai

**Defined:** 2026-04-02
**Core Value:** Every politician's funding and financial data must be real, complete, and verifiable — citizens can't make informed decisions from placeholder data.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Federal Data

- [ ] **FED-01**: User can view real, complete FEC funding data for all 30 federal politicians
- [ ] **FED-02**: User can see accurate financial breakdown (PAC, individual, corporate, Israel lobby) per politician
- [ ] **FED-03**: User can view Independent Expenditures (for/against) on politician detail page
- [ ] **FED-04**: Corruption score uses real data for all available factors (no PLACEHOLDER_SCORE)

### State & Local Data

- [ ] **SLD-01**: User can view real funding data for FL state legislators (FL Division of Elections)
- [ ] **SLD-02**: User can view real funding data for county officials (FL Division of Elections)

### UI / Detail Pages

- [ ] **UI-01**: Politician detail page financial tab is fully functional with real data
- [ ] **UI-02**: All "PHASE 2 COMING SOON" placeholders replaced with real features or removed
- [ ] **UI-03**: Fake "LIVE" OSINT feed removed or replaced with real data source
- [ ] **UI-04**: Mobile-responsive layout across all pages

## v2 Requirements

### Notifications

- **NOTF-01**: User receives alerts when new FEC filings appear for tracked politicians
- **NOTF-02**: User can subscribe to politician update notifications

### Moderation / Admin

- **ADMIN-01**: Admin dashboard for data pipeline health monitoring
- **ADMIN-02**: Admin can trigger manual data syncs per politician

### Search & Discovery

- **DISC-01**: User can search politicians by name, district, or party
- **DISC-02**: User can filter/sort politicians by corruption score, funding amount

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real-time chat | Not core to research mission |
| Video content | Storage/bandwidth costs, defer |
| OAuth / user accounts | No accounts needed for public data access |
| Mobile native app | Web-first approach |
| LegiScan voting records | Rate limits (30K/month), defer to v2+ |
| LDA lobbying data | Separate integration, defer to v2+ |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FED-01 | Phase 2: Federal Data Verification & Cleanup | Mapped |
| FED-02 | Phase 3: Financial Breakdown Accuracy | Mapped |
| FED-03 | Phase 4: Independent Expenditures Display | Mapped |
| FED-04 | Phase 5: Corruption Score — Real Data | Mapped |
| SLD-01 | Phase 6: FL State Legislators Pipeline | Mapped |
| SLD-02 | Phase 7: County Officials Pipeline | Mapped |
| UI-01 | Phase 8: Politician Detail Page — Financial Tab | Mapped |
| UI-02 | Phase 9: Placeholder Cleanup & OSINT Feed | Mapped |
| UI-03 | Phase 9: Placeholder Cleanup & OSINT Feed | Mapped |
| UI-04 | Phase 10: Mobile Responsive Layout | Mapped |

**Coverage:**
- v1 requirements: 10 total
- Mapped to phases: 10
- Unmapped: 0

---
*Requirements defined: 2026-04-02*
*Last updated: 2026-04-02 after roadmap creation — traceability fully mapped*
