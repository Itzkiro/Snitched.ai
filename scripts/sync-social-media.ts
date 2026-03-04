#!/usr/bin/env npx tsx
/**
 * Sync Social Media Posts — TypeScript Wrapper
 *
 * Runs the Python social media scraper and optionally pushes results
 * to Supabase. Designed to be called from cron jobs or manual runs.
 *
 * Usage:
 *   npx tsx scripts/sync-social-media.ts                    # Full scrape
 *   npx tsx scripts/sync-social-media.ts --dry-run           # Validate only
 *   npx tsx scripts/sync-social-media.ts --limit 5           # Scrape 5 politicians
 *   npx tsx scripts/sync-social-media.ts --platforms twitter  # Twitter only
 *   npx tsx scripts/sync-social-media.ts --push              # Push results to Supabase
 */

import { execSync, spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { resolve, join } from 'path';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PROJECT_DIR = resolve(__dirname, '..');
const SCRAPERS_DIR = join(PROJECT_DIR, 'scrapers');
const PYTHON_SCRIPT = join(SCRAPERS_DIR, 'scrape-social-media.py');
const OUTPUT_FILE = join(PROJECT_DIR, 'data-ingestion', 'social-media-posts.json');

const SUPABASE_URL = 'https://uqjfxhpyitleeleazzow.supabase.co';
const SUPABASE_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxamZ4aHB5aXRsZWVsZWF6em93Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTc2NzQzOCwiZXhwIjoyMDg3MzQzNDM4fQ.abK_AJ-qataXyYn59I2w2rTxP4dIyl1UjCAMkw_6JPw';

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findPython(): string {
  // Try common Python 3 paths
  const candidates = ['python3', 'python'];
  for (const cmd of candidates) {
    try {
      const version = execSync(`${cmd} --version 2>&1`, { encoding: 'utf-8' }).trim();
      if (version.includes('Python 3')) {
        return cmd;
      }
    } catch {
      continue;
    }
  }
  throw new Error(
    'Python 3 not found. Install Python 3 and ensure it is on your PATH.'
  );
}

function runPythonScraper(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const python = findPython();
    console.log(`Running: ${python} ${PYTHON_SCRIPT} ${args.join(' ')}`);
    console.log('-'.repeat(70));

    let stdout = '';
    let stderr = '';

    const proc = spawn(python, [PYTHON_SCRIPT, ...args], {
      cwd: SCRAPERS_DIR,
      env: {
        ...process.env,
        SUPABASE_URL,
        SUPABASE_SERVICE_KEY,
        PYTHONUNBUFFERED: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    proc.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      process.stdout.write(text);
    });

    proc.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      process.stderr.write(text);
    });

    proc.on('close', (code: number | null) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });

    proc.on('error', (err: Error) => {
      console.error(`Failed to start Python process: ${err.message}`);
      resolve({ exitCode: 1, stdout, stderr: err.message });
    });
  });
}

// ---------------------------------------------------------------------------
// Supabase push (optional)
// ---------------------------------------------------------------------------

async function pushToSupabase(posts: SocialPost[]): Promise<void> {
  if (posts.length === 0) {
    console.log('No posts to push to Supabase.');
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // First, check if the social_posts table exists
  // If not, create it
  console.log(`\nPushing ${posts.length} posts to Supabase...`);

  // Create social_posts table if it doesn't exist
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS social_posts (
      id TEXT PRIMARY KEY,
      politician_id TEXT REFERENCES politicians(bioguide_id),
      politician_name TEXT,
      platform TEXT NOT NULL,
      handle TEXT,
      content TEXT,
      post_url TEXT,
      posted_at TIMESTAMPTZ,
      likes_count INTEGER DEFAULT 0,
      shares_count INTEGER DEFAULT 0,
      comments_count INTEGER DEFAULT 0,
      views_count INTEGER DEFAULT 0,
      sentiment_score NUMERIC,
      is_deleted BOOLEAN DEFAULT false,
      scraped_at TIMESTAMPTZ DEFAULT NOW(),
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_social_posts_politician ON social_posts(politician_id);
    CREATE INDEX IF NOT EXISTS idx_social_posts_platform ON social_posts(platform);
    CREATE INDEX IF NOT EXISTS idx_social_posts_posted_at ON social_posts(posted_at);
  `;

  // Try to create the table via RPC
  try {
    const { error: rpcError } = await supabase.rpc('exec_sql', { sql: createTableSQL });
    if (rpcError) {
      console.log(
        `Note: Could not auto-create social_posts table (${rpcError.message}). ` +
        `You may need to create it manually via the Supabase SQL Editor.`
      );
    }
  } catch {
    // RPC might not exist, that's OK
  }

  // Upsert posts in batches of 50
  const batchSize = 50;
  let inserted = 0;
  let errors = 0;

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
      sentiment_score: post.sentiment_score || null,
      is_deleted: post.is_deleted || false,
      scraped_at: post.scraped_at,
      note: post.note || null,
    }));

    const { error: upsertError } = await supabase
      .from('social_posts')
      .upsert(batch, { onConflict: 'id' });

    if (upsertError) {
      console.error(`  Batch ${Math.floor(i / batchSize) + 1} error: ${upsertError.message}`);
      errors += batch.length;
    } else {
      inserted += batch.length;
    }
  }

  console.log(`  Pushed: ${inserted} posts, ${errors} errors`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const push = args.includes('--push');

  // Parse arguments to pass to Python
  const pythonArgs: string[] = [];

  if (dryRun) {
    pythonArgs.push('--dry-run');
  } else {
    pythonArgs.push('--batch');
  }

  // Forward --limit
  const limitIdx = args.indexOf('--limit');
  if (limitIdx >= 0 && args[limitIdx + 1]) {
    pythonArgs.push('--limit', args[limitIdx + 1]);
  }

  // Forward --platforms
  const platformIdx = args.indexOf('--platforms');
  if (platformIdx >= 0 && args[platformIdx + 1]) {
    pythonArgs.push('--platforms', args[platformIdx + 1]);
  }

  // Forward --max-posts
  const maxPostsIdx = args.indexOf('--max-posts');
  if (maxPostsIdx >= 0 && args[maxPostsIdx + 1]) {
    pythonArgs.push('--max-posts', args[maxPostsIdx + 1]);
  }

  // Forward --politician
  const polIdx = args.indexOf('--politician');
  if (polIdx >= 0 && args[polIdx + 1]) {
    // Override --batch with --politician
    const batchArgIdx = pythonArgs.indexOf('--batch');
    if (batchArgIdx >= 0) {
      pythonArgs.splice(batchArgIdx, 1);
    }
    pythonArgs.push('--politician', args[polIdx + 1]);
  }

  console.log('='.repeat(70));
  console.log('  Snitched.ai - Social Media Sync');
  console.log('='.repeat(70));
  console.log(`  Mode:       ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  Push to DB: ${push ? 'Yes' : 'No (use --push to enable)'}`);
  console.log(`  Output:     ${OUTPUT_FILE}`);
  console.log('');

  // Verify Python script exists
  if (!existsSync(PYTHON_SCRIPT)) {
    console.error(`ERROR: Python scraper not found at ${PYTHON_SCRIPT}`);
    process.exit(1);
  }

  // Run the Python scraper
  const result = await runPythonScraper(pythonArgs);
  console.log('-'.repeat(70));

  if (result.exitCode !== 0) {
    console.error(`\nPython scraper exited with code ${result.exitCode}`);
    process.exit(result.exitCode);
  }

  // If not a dry run, read and optionally push results
  if (!dryRun && push) {
    if (existsSync(OUTPUT_FILE)) {
      try {
        const raw = readFileSync(OUTPUT_FILE, 'utf-8');
        const data: ScraperOutput = JSON.parse(raw);

        console.log(`\nLoaded ${data.posts.length} posts from ${OUTPUT_FILE}`);
        await pushToSupabase(data.posts);
      } catch (e: any) {
        console.error(`Error reading/pushing results: ${e.message}`);
      }
    } else {
      console.log(`Output file not found at ${OUTPUT_FILE}`);
    }
  }

  // Final summary
  if (!dryRun && existsSync(OUTPUT_FILE)) {
    try {
      const raw = readFileSync(OUTPUT_FILE, 'utf-8');
      const data: ScraperOutput = JSON.parse(raw);

      console.log('\n' + '='.repeat(70));
      console.log('  SYNC COMPLETE');
      console.log('='.repeat(70));
      console.log(`  Posts collected: ${data.statistics.total_posts}`);
      console.log(`  Politicians:    ${data.statistics.politicians_scraped}`);
      console.log(`  Duration:       ${data.metadata.duration_seconds}s`);

      if (Object.keys(data.statistics.by_platform).length > 0) {
        console.log('  By platform:');
        for (const [platform, count] of Object.entries(data.statistics.by_platform)) {
          console.log(`    ${platform.padEnd(12)} ${count} posts`);
        }
      }

      if (data.statistics.errors.length > 0) {
        console.log(`  Errors:         ${data.statistics.errors.length}`);
      }

      console.log(`  Output:         ${OUTPUT_FILE}`);
      console.log('='.repeat(70));
    } catch {
      // Ignore parse errors for summary
    }
  }
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
