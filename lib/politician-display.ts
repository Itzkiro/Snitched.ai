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

/** Format a dollar amount as $XK or $X.XM. */
export function formatLobbyAmount(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${Math.round(amount)}`;
}

/**
 * Canonical label for the pro-Israel-lobby metric. Use this constant in
 * headings / labels so the copy stays consistent.
 */
export const PRO_ISRAEL_LOBBY_LABEL = 'Pro-Israel Lobby' as const;
