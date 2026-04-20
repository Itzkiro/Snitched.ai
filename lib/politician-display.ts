/**
 * Single source of truth for politician display values.
 *
 * Use these helpers — not direct field access — when rendering corruption
 * score or pro-Israel-lobby amount anywhere in the UI. Keeps every surface
 * consistent with the DB.
 */

import type { Politician } from './types';

/**
 * Minimal shape the helpers need. Accepts both the full Politician and a
 * loosely-typed row from a Supabase select.
 */
export interface PoliticianLike {
  corruptionScore?: number | null;
  corruption_score?: number | null;
  aipacFunding?: number | null;
  aipac_funding?: number | null;
  israelLobbyTotal?: number | null;
  israel_lobby_total?: number | null;
}

/**
 * Authoritative corruption score reader. Always returns the DB-stored value.
 * NEVER recompute client-side — the stored value reflects the full algorithm
 * including v6.3 multi-cycle multiplier + juice_box_tier floors which require
 * fields we don't always ship to the client.
 */
export function getCorruptionScore(p: PoliticianLike | Politician): number {
  const camelCase = (p as PoliticianLike).corruptionScore;
  const snakeCase = (p as PoliticianLike).corruption_score;
  return Number(camelCase ?? snakeCase ?? 0) || 0;
}

/**
 * Authoritative Pro-Israel-Lobby amount reader.
 *
 * Returns israel_lobby_total (the full figure including PACs + IE + bundlers)
 * when available, falling back to aipac_funding (PAC-only subset) when
 * lifetime lobby data hasn't been populated yet.
 */
export function getProIsraelLobbyAmount(p: PoliticianLike | Politician): number {
  const lobbyCamel = (p as PoliticianLike).israelLobbyTotal;
  const lobbySnake = (p as PoliticianLike).israel_lobby_total;
  const lobby = Number(lobbyCamel ?? lobbySnake ?? 0) || 0;
  if (lobby > 0) return lobby;
  const aipacCamel = (p as PoliticianLike).aipacFunding;
  const aipacSnake = (p as PoliticianLike).aipac_funding;
  return Number(aipacCamel ?? aipacSnake ?? 0) || 0;
}

/**
 * Format a dollar amount as raw dollars with comma separators — no K/M/B
 * abbreviation. Product decision (2026-04-20): citizens verifying claims
 * against FEC need exact figures, not rounded summaries.
 */
export function formatLobbyAmount(amount: number): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '$0';
  const r = Math.round(n);
  return `${r < 0 ? '-' : ''}$${Math.abs(r).toLocaleString('en-US')}`;
}

/**
 * Canonical labels for the pro-Israel-lobby metric and its breakdown. Use
 * these constants in headings / labels so the copy stays consistent.
 *
 * The v2 UI (after 2026-04-20 dual-source rewrite) shows four figures on the
 * politician detail page:
 *   1. Total Funding                                (total_funds)
 *   2. Total Pro-Israel Lobby                       (israel_lobby_total)
 *   3. Pro-Israel Lobby-Tied Donors (bundlers)      (breakdown.bundlers) —
 *        individuals who gave to this politician AND have a history of
 *        heavy donation to pro-Israel lobby PACs.
 *   4. Pro-Israel Lobby PACs                        (breakdown.pacs) —
 *        direct PAC contributions.
 */
export const PRO_ISRAEL_LOBBY_LABEL = 'Pro-Israel Lobby' as const;
export const PRO_ISRAEL_LOBBY_TOTAL_LABEL = 'Pro-Israel Lobby Total' as const;
export const PRO_ISRAEL_LOBBY_PACS_LABEL = 'Pro-Israel Lobby PACs' as const;
export const PRO_ISRAEL_LOBBY_BUNDLERS_LABEL = 'Pro-Israel Lobby-Tied Donors' as const;
export const PRO_ISRAEL_LOBBY_IE_LABEL = 'Pro-Israel Lobby IE' as const;
