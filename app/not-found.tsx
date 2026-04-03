import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{
      minHeight: '80vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--terminal-bg)',
    }}>
      <div className="terminal-card" style={{ textAlign: 'center', padding: '3rem', maxWidth: '500px' }}>
        <div style={{ fontSize: '4rem', marginBottom: '1rem', color: 'var(--terminal-red)' }}>
          404
        </div>
        <div style={{
          fontSize: '1.25rem',
          fontWeight: 700,
          marginBottom: '0.5rem',
          color: 'var(--terminal-text)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}>
          TARGET NOT FOUND
        </div>
        <div style={{ color: 'var(--terminal-text-dim)', marginBottom: '2rem', fontSize: '0.875rem' }}>
          The requested intelligence file does not exist in our database.
        </div>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/browse">
            <button className="terminal-btn">SEARCH DATABASE</button>
          </Link>
          <Link href="/">
            <button className="terminal-btn">RETURN TO HQ</button>
          </Link>
        </div>
      </div>
    </div>
  );
}
