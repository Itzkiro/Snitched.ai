#!/usr/bin/env npx tsx
/**
 * Social Media Monitoring Daemon
 *
 * Runs continuously, scraping social media posts every POLL_INTERVAL_MINUTES.
 * Designed to run on a persistent machine (Mac mini, VPS, etc.) — NOT on Vercel.
 *
 * Features:
 *   - Continuous polling loop with configurable interval (default 15 min)
 *   - Rotates through politicians so each one gets scraped regularly
 *   - Pushes new posts to Supabase in real-time
 *   - Tracks scrape runs for monitoring/health-checks
 *   - Graceful shutdown on SIGINT/SIGTERM
 *   - Auto-restart on failures with exponential backoff
 *
 * Usage:
 *   npx tsx scripts/social-media-daemon.ts                   # Run with defaults
 *   npx tsx scripts/social-media-daemon.ts --interval 10     # Poll every 10 min
 *   npx tsx scripts/social-media-daemon.ts --batch-size 5    # 5 politicians per cycle
 *   npx tsx scripts/social-media-daemon.ts --platforms twitter,facebook
 *
 * Process management (recommended):
 *   pm2 start scripts/social-media-daemon.ts --interpreter="npx" --interpreter-args="tsx"
 *   # or use the included launcher:
 *   ./scripts/start-social-daemon.sh
 */

import 'dotenv/config';
import { execSync, spawn, ChildProcess } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PROJECT_DIR = resolve(__dirname, '..');
const SCRAPERS_DIR = join(PROJECT_DIR, 'scrapers');
const PYTHON_SCRIPT = join(SCRAPERS_DIR, 'scrape-social-media.py');
const OUTPUT_FILE = join(PROJECT_DIR, 'data-ingestion', 'social-media-posts.json');
const PID_FILE = join(PROJECT_DIR, '.tmp', 'social-daemon.pid');
const STATE_FILE = join(PROJECT_DIR, '.tmp', 'social-daemon-state.json');

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Parse CLI args
const args = process.argv.slice(2);
function getArg(name: string, defaultVal: string): string {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : defaultVal;
}

const POLL_INTERVAL_MIN = parseInt(getArg('interval', '15'), 10);
const BATCH_SIZE = parseInt(getArg('batch-size', '10'), 10);
const PLATFORMS = getArg('platforms', 'twitter,rss,news,press');
const MAX_POSTS_PER_POLITICIAN = parseInt(getArg('max-posts', '20'), 10);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SocialPost {
  id: string;
  politician_id: string;
  politician_name: string;
  platform: string;
  handle: string;
  content: string;
  post_url: string;
  posted_at: string;
  likes_count: number;
  shares_count: number;
  comments_count: number;
  sentiment_score?: number;
  is_deleted: boolean;
  scraped_at: string;
  note?: string;
  views_count?: number;
}

interface ScraperOutput {
  metadata: {
    scraper: string;
    version: string;
    engine: string;
    platforms: string[];
    started_at: string;
    completed_at: string;
    duration_seconds: number;
  };
  statistics: {
    total_politicians: number;
    politicians_with_social: number;
    politicians_scraped: number;
    total_posts: number;
    by_platform: Record<string, number>;
    errors: Array<{ politician: string; platform: string; error: string }>;
  };
  posts: SocialPost[];
}

interface DaemonState {
  lastRunAt: string | null;
  lastRunPosts: number;
  totalRuns: number;
  totalPostsCollected: number;
  consecutiveErrors: number;
  rotationOffset: number; // tracks which batch of politicians to scrape next
}

// ---------------------------------------------------------------------------
// Globals
// ---------------------------------------------------------------------------

let running = true;
let currentProcess: ChildProcess | null = null;
let supabase: SupabaseClient | null = null;

const defaultState: DaemonState = {
  lastRunAt: null,
  lastRunPosts: 0,
  totalRuns: 0,
  totalPostsCollected: 0,
  consecutiveErrors: 0,
  rotationOffset: 0,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg: string) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

function logError(msg: string) {
  const ts = new Date().toISOString();
  console.error(`[${ts}] ERROR: ${msg}`);
}

function loadState(): DaemonState {
  try {
    if (existsSync(STATE_FILE)) {
      return { ...defaultState, ...JSON.parse(readFileSync(STATE_FILE, 'utf-8')) };
    }
  } catch {
    // corrupt state file, start fresh
  }
  return { ...defaultState };
}

function saveState(state: DaemonState) {
  try {
    const dir = join(PROJECT_DIR, '.tmp');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    logError(`Failed to save state: ${e}`);
  }
}

function writePidFile() {
  const dir = join(PROJECT_DIR, '.tmp');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(PID_FILE, String(process.pid));
}

function removePidFile() {
  try {
    if (existsSync(PID_FILE)) {
      const fs = require('fs');
      fs.unlinkSync(PID_FILE);
    }
  } catch {
    // ignore
  }
}

function findPython(): string {
  for (const cmd of ['python3', 'python']) {
    try {
      const ver = execSync(`${cmd} --version 2>&1`, { encoding: 'utf-8' }).trim();
      if (ver.includes('Python 3')) return cmd;
    } catch {
      continue;
    }
  }
  throw new Error('Python 3 not found');
}

function initSupabase(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    log('Supabase not configured — posts will only be saved locally');
    return null;
  }
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ---------------------------------------------------------------------------
// Scraper execution
// ---------------------------------------------------------------------------

function runScraper(
  offset: number,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const python = findPython();
    const scraperArgs = [
      PYTHON_SCRIPT,
      '--batch',
      '--limit', String(BATCH_SIZE),
      '--offset', String(offset),
      '--platforms', PLATFORMS,
      '--max-posts', String(MAX_POSTS_PER_POLITICIAN),
    ];

    log(`Spawning: ${python} ${scraperArgs.join(' ')}`);

    let stdout = '';
    let stderr = '';

    const proc = spawn(python, scraperArgs, {
      cwd: SCRAPERS_DIR,
      env: {
        ...process.env,
        SUPABASE_URL,
        SUPABASE_SERVICE_KEY: SUPABASE_KEY,
        PYTHONUNBUFFERED: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    currentProcess = proc;

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code: number | null) => {
      currentProcess = null;
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });

    proc.on('error', (err: Error) => {
      currentProcess = null;
      resolve({ exitCode: 1, stdout, stderr: err.message });
    });
  });
}

// ---------------------------------------------------------------------------
// Push posts to Supabase
// ---------------------------------------------------------------------------

async function pushPosts(posts: SocialPost[]): Promise<{ inserted: number; errors: number }> {
  if (!supabase || posts.length === 0) return { inserted: 0, errors: 0 };

  let inserted = 0;
  let errors = 0;
  const batchSize = 50;

  for (let i = 0; i < posts.length; i += batchSize) {
    const batch = posts.slice(i, i + batchSize).map((post) => ({
      id: post.id,
      politician_id: post.politician_id,
      politician_name: post.politician_name,
      platform: post.platform,
      handle: post.handle,
      content: post.content,
      post_url: post.post_url,
      posted_at: post.posted_at,
      likes_count: post.likes_count || 0,
      shares_count: post.shares_count || 0,
      comments_count: post.comments_count || 0,
      views_count: post.views_count || 0,
      sentiment_score: post.sentiment_score ?? null,
      is_deleted: post.is_deleted || false,
      scraped_at: post.scraped_at,
      note: post.note || null,
    }));

    const { error } = await supabase
      .from('social_posts')
      .upsert(batch, { onConflict: 'id' });

    if (error) {
      logError(`Batch upsert error: ${error.message}`);
      errors += batch.length;
    } else {
      inserted += batch.length;
    }
  }

  return { inserted, errors };
}

// ---------------------------------------------------------------------------
// Record scrape run for monitoring
// ---------------------------------------------------------------------------

async function recordRun(
  startedAt: string,
  postsFound: number,
  postsNew: number,
  errorCount: number,
  runLog: string[],
) {
  if (!supabase) return;

  try {
    await supabase.from('scrape_runs').insert({
      run_type: 'social_media',
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      status: errorCount > 0 ? 'partial' : 'success',
      posts_found: postsFound,
      posts_new: postsNew,
      errors: errorCount,
      log: runLog.slice(-50), // keep last 50 log lines
      metadata: {
        batch_size: BATCH_SIZE,
        platforms: PLATFORMS,
        interval_min: POLL_INTERVAL_MIN,
      },
    });
  } catch (e) {
    logError(`Failed to record scrape run: ${e}`);
  }
}

// ---------------------------------------------------------------------------
// Single scrape cycle
// ---------------------------------------------------------------------------

async function scrapeCycle(state: DaemonState): Promise<DaemonState> {
  const cycleStart = new Date().toISOString();
  const runLog: string[] = [];

  log(`--- Scrape cycle #${state.totalRuns + 1} (offset=${state.rotationOffset}) ---`);
  runLog.push(`Cycle #${state.totalRuns + 1}, offset=${state.rotationOffset}`);

  try {
    const result = await runScraper(state.rotationOffset);

    if (result.exitCode !== 0) {
      logError(`Scraper exited with code ${result.exitCode}`);
      runLog.push(`Scraper exit code: ${result.exitCode}`);
      if (result.stderr) runLog.push(result.stderr.slice(0, 500));

      state.consecutiveErrors++;
      await recordRun(cycleStart, 0, 0, 1, runLog);
      return state;
    }

    // Read output
    let posts: SocialPost[] = [];
    if (existsSync(OUTPUT_FILE)) {
      try {
        const data: ScraperOutput = JSON.parse(readFileSync(OUTPUT_FILE, 'utf-8'));
        posts = data.posts || [];
        log(`Collected ${posts.length} posts from ${data.statistics.politicians_scraped} politicians`);
        runLog.push(`Posts: ${posts.length}, Politicians: ${data.statistics.politicians_scraped}`);

        if (data.statistics.errors.length > 0) {
          runLog.push(`Scraper errors: ${data.statistics.errors.length}`);
        }
      } catch (e) {
        logError(`Failed to parse output: ${e}`);
        runLog.push(`Parse error: ${e}`);
      }
    }

    // Push to Supabase
    const { inserted, errors } = await pushPosts(posts);
    log(`Pushed to Supabase: ${inserted} inserted, ${errors} errors`);
    runLog.push(`DB: ${inserted} inserted, ${errors} errors`);

    // Record run
    await recordRun(cycleStart, posts.length, inserted, errors, runLog);

    // Update state
    state.lastRunAt = cycleStart;
    state.lastRunPosts = posts.length;
    state.totalRuns++;
    state.totalPostsCollected += posts.length;
    state.consecutiveErrors = 0;

    // Advance rotation — cycle through all politicians
    state.rotationOffset += BATCH_SIZE;
    // The Python scraper will reset to 0 if offset exceeds politician count

    return state;
  } catch (e) {
    logError(`Cycle failed: ${e}`);
    runLog.push(`Fatal: ${e}`);
    state.consecutiveErrors++;
    await recordRun(cycleStart, 0, 0, 1, runLog);
    return state;
  }
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

async function main() {
  log('='.repeat(60));
  log('  Snitched.ai Social Media Monitoring Daemon');
  log('='.repeat(60));
  log(`  Poll interval:  ${POLL_INTERVAL_MIN} minutes`);
  log(`  Batch size:     ${BATCH_SIZE} politicians per cycle`);
  log(`  Platforms:      ${PLATFORMS}`);
  log(`  Max posts:      ${MAX_POSTS_PER_POLITICIAN} per politician`);
  log(`  PID:            ${process.pid}`);
  log(`  Supabase:       ${SUPABASE_URL ? 'configured' : 'NOT configured'}`);
  log('');

  // Write PID file
  writePidFile();

  // Init Supabase
  supabase = initSupabase();

  // Load state
  let state = loadState();
  if (state.lastRunAt) {
    log(`Resuming from previous state — ${state.totalRuns} runs, ${state.totalPostsCollected} posts total`);
  }

  // Graceful shutdown
  const shutdown = () => {
    log('Shutting down gracefully...');
    running = false;
    if (currentProcess) {
      currentProcess.kill('SIGTERM');
    }
    saveState(state);
    removePidFile();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Main polling loop
  while (running) {
    state = await scrapeCycle(state);
    saveState(state);

    if (!running) break;

    // Exponential backoff on consecutive errors (max 60 min)
    let waitMinutes = POLL_INTERVAL_MIN;
    if (state.consecutiveErrors > 0) {
      waitMinutes = Math.min(60, POLL_INTERVAL_MIN * Math.pow(2, state.consecutiveErrors - 1));
      log(`Backing off: ${waitMinutes} min (${state.consecutiveErrors} consecutive errors)`);
    }

    log(`Next cycle in ${waitMinutes} minutes...`);
    log('');

    // Sleep in 10-second chunks so we can respond to SIGINT quickly
    const sleepMs = waitMinutes * 60 * 1000;
    const sleepEnd = Date.now() + sleepMs;
    while (running && Date.now() < sleepEnd) {
      await new Promise((r) => setTimeout(r, 10_000));
    }
  }

  log('Daemon stopped.');
}

main().catch((e) => {
  logError(`Fatal: ${e}`);
  removePidFile();
  process.exit(1);
});
