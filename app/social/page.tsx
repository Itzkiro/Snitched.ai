'use client';

import SocialFeed from '@/components/SocialFeed';

export default function SocialPage() {
  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: '1.5rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1
          style={{
            fontSize: '16px',
            fontWeight: 700,
            color: 'var(--terminal-cyan)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            marginBottom: '0.25rem',
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
