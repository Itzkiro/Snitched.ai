'use client';

import SocialFeed from '@/components/SocialFeed';

export default function SocialPage() {
  return (
    <main className="p-3 sm:p-6 lg:p-8" style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1
          className="text-2xl sm:text-[28px] lg:text-[32px] uppercase tracking-[0.08em] mb-4"
          style={{
            fontWeight: 700,
            color: 'var(--terminal-cyan)',
          }}
        >
          Social Intelligence Feed
        </h1>
        <p
          style={{
            fontSize: '11px',
            color: 'var(--terminal-text-dimmer)',
            textTransform: 'uppercase',
          }}
        >
          Real-time monitoring of Florida politician social media activity
        </p>
      </div>
      <SocialFeed />
    </main>
  );
}
