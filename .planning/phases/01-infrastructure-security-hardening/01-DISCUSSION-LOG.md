# Phase 1: Infrastructure & Security Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-02
**Phase:** 01-infrastructure-security-hardening
**Areas discussed:** Key rotation, Dashboard handling, API design

---

## Key Rotation Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Rotate + scrub git | Rotate key in Supabase dashboard, update env vars, AND scrub from git history | |
| Rotate only | Rotate key and update env vars — skip git history rewrite | |
| You decide | Claude picks the best approach | ✓ |

**User's choice:** You decide
**Notes:** None

---

## Dashboard Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Delete entirely | Remove the file — it's not needed | ✓ |
| Add auth gate | Keep it but require authentication to access | |
| You decide | Claude picks the best approach | |

**User's choice:** Initially asked "what is this file doing?" — after explanation (standalone 23KB HTML, exposes internal details, not connected to app), chose "Yes, delete it"
**Notes:** User wasn't aware of what dashboard.html was. After learning it was a debugging artifact, confirmed deletion.

---

## API Endpoint Design

| Option | Description | Selected |
|--------|-------------|----------|
| Full politician object | Same shape as /api/politicians but for one record | |
| Slim + expandable | Core fields by default, ?include= for extras | |
| You decide | Claude picks based on existing patterns | ✓ |

**User's choice:** You decide
**Notes:** None

---

## Claude's Discretion

- Key rotation approach
- API endpoint response shape and caching
- Env validation strategy
- Input validation scope

## Deferred Ideas

None
