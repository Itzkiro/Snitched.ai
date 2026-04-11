import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About & Methodology',
  description: 'How Snitched.ai calculates corruption scores, tracks Israel lobby funding, and sources campaign finance data.',
};

export default function AboutPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--terminal-bg)', color: 'var(--terminal-text)' }}>
      <div className="terminal-title">
        <div>
          <h1>METHODOLOGY & DATA SOURCES</h1>
          <div className="terminal-subtitle">How We Track Corruption & Foreign Lobby Influence</div>
        </div>
      </div>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem' }}>
        {/* Mission */}
        <div className="terminal-card" style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--terminal-amber)', marginBottom: '1rem' }}>
            MISSION
          </h2>
          <p style={{ lineHeight: 1.8, fontSize: '0.9rem' }}>
            Snitched.ai is an America First citizen research platform that tracks corruption and foreign lobby influence
            among American politicians across 11 states. Every data point is sourced from public records — FEC filings,
            state campaign finance databases, lobbying disclosures, and legislative voting records.
            No opinions, no partisan bias. Just data.
          </p>
        </div>

        {/* Corruption Score */}
        <div className="terminal-card" style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--terminal-amber)', marginBottom: '1rem' }}>
            CORRUPTION SCORE (0-100)
          </h2>
          <p style={{ lineHeight: 1.8, fontSize: '0.9rem', marginBottom: '1rem' }}>
            Each politician receives a composite corruption score based on weighted factors:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', background: 'var(--terminal-bg)', border: '1px solid var(--terminal-border)' }}>
              <span style={{ fontWeight: 700 }}>PAC/Lobby Funding Ratio</span>
              <span style={{ color: 'var(--terminal-amber)' }}>30% weight</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', background: 'var(--terminal-bg)', border: '1px solid var(--terminal-border)' }}>
              <span style={{ fontWeight: 700 }}>Lobbying Connections</span>
              <span style={{ color: 'var(--terminal-amber)' }}>20% weight</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', background: 'var(--terminal-bg)', border: '1px solid var(--terminal-border)' }}>
              <span style={{ fontWeight: 700 }}>Voting Alignment with Donors</span>
              <span style={{ color: 'var(--terminal-amber)' }}>25% weight</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', background: 'var(--terminal-bg)', border: '1px solid var(--terminal-border)' }}>
              <span style={{ fontWeight: 700 }}>Transparency & Disclosure</span>
              <span style={{ color: 'var(--terminal-amber)' }}>10% weight</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', background: 'var(--terminal-bg)', border: '1px solid var(--terminal-border)' }}>
              <span style={{ fontWeight: 700 }}>Campaign Finance Red Flags</span>
              <span style={{ color: 'var(--terminal-amber)' }}>15% weight</span>
            </div>
          </div>
          <p style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--terminal-text-dim)' }}>
            Grades: A (0-20), B (21-40), C (41-60), D (61-80), F (81-100).
            Confidence levels (high/medium/low) indicate how much real data is available for each factor.
          </p>
        </div>

        {/* Israel Lobby Tracking */}
        <div className="terminal-card" style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--terminal-red)', marginBottom: '1rem' }}>
            🇮🇱 ISRAEL LOBBY TRACKING
          </h2>
          <p style={{ lineHeight: 1.8, fontSize: '0.9rem', marginBottom: '1rem' }}>
            Israel lobby funding is tracked across three categories:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
            <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              <span style={{ fontWeight: 700, color: 'var(--terminal-red)' }}>PACs</span> — Direct contributions from Israel lobby political action committees (AIPAC PAC, United Democracy Project, DMFI PAC, NORPAC, RJC, etc.)
            </div>
            <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              <span style={{ fontWeight: 700, color: 'var(--terminal-red)' }}>Lobby Donors</span> — Individual contributions from people affiliated with Israel lobby organizations. These are bundled donations organized through AIPAC&apos;s network of donors.
            </div>
            <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              <span style={{ fontWeight: 700, color: 'var(--terminal-red)' }}>Independent Expenditures</span> — Money spent by Israel lobby groups to support or oppose candidates without coordinating with their campaigns.
            </div>
          </div>
          <p style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--terminal-text-dim)' }}>
            Lobby donor data sourced from FEC filings and public disclosure records. PAC and IE data from FEC filings.
          </p>
        </div>

        {/* Data Sources */}
        <div className="terminal-card" style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--terminal-amber)', marginBottom: '1rem' }}>
            DATA SOURCES
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.85rem' }}>
            <div style={{ padding: '0.75rem', borderLeft: '3px solid var(--terminal-blue)' }}>
              <div style={{ fontWeight: 700 }}>Federal Election Commission (FEC)</div>
              <div style={{ color: 'var(--terminal-text-dim)', fontSize: '0.8rem' }}>Campaign contributions, PAC filings, independent expenditures for federal politicians. Updated daily via API.</div>
            </div>
            <div style={{ padding: '0.75rem', borderLeft: '3px solid var(--terminal-blue)' }}>
              <div style={{ fontWeight: 700 }}>FL Division of Elections</div>
              <div style={{ color: 'var(--terminal-text-dim)', fontSize: '0.8rem' }}>State-level campaign finance for 148 FL state legislators. Scraped via Playwright browser automation.</div>
            </div>
            <div style={{ padding: '0.75rem', borderLeft: '3px solid var(--terminal-blue)' }}>
              <div style={{ fontWeight: 700 }}>LDA Senate API</div>
              <div style={{ color: 'var(--terminal-text-dim)', fontSize: '0.8rem' }}>Lobbying Disclosure Act filings — lobbyist contributions, revolving door connections, client relationships.</div>
            </div>
            <div style={{ padding: '0.75rem', borderLeft: '3px solid var(--terminal-blue)' }}>
              <div style={{ fontWeight: 700 }}>LegiScan</div>
              <div style={{ color: 'var(--terminal-text-dim)', fontSize: '0.8rem' }}>State and federal voting records — roll call votes on bills for policy alignment scoring.</div>
            </div>


            <div style={{ padding: '0.75rem', borderLeft: '3px solid var(--terminal-blue)' }}>
              <div style={{ fontWeight: 700 }}>Google News RSS</div>
              <div style={{ color: 'var(--terminal-text-dim)', fontSize: '0.8rem' }}>News mentions and press releases for social intelligence feed.</div>
            </div>
          </div>
        </div>

        {/* Coverage */}
        <div className="terminal-card" style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--terminal-amber)', marginBottom: '1rem' }}>
            COVERAGE
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div style={{ padding: '1rem', background: 'var(--terminal-bg)', border: '1px solid var(--terminal-border)', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--terminal-green)', fontFamily: 'Bebas Neue, sans-serif' }}>6,731+</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--terminal-text-dim)', textTransform: 'uppercase' }}>Politicians Tracked</div>
            </div>
            <div style={{ padding: '1rem', background: 'var(--terminal-bg)', border: '1px solid var(--terminal-border)', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--terminal-green)', fontFamily: 'Bebas Neue, sans-serif' }}>1,644</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--terminal-text-dim)', textTransform: 'uppercase' }}>With Funding Data</div>
            </div>
            <div style={{ padding: '1rem', background: 'var(--terminal-bg)', border: '1px solid var(--terminal-border)', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--terminal-red)', fontFamily: 'Bebas Neue, sans-serif' }}>$20.5M</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--terminal-text-dim)', textTransform: 'uppercase' }}>Israel Lobby Tracked</div>
            </div>
            <div style={{ padding: '1rem', background: 'var(--terminal-bg)', border: '1px solid var(--terminal-border)', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--terminal-amber)', fontFamily: 'Bebas Neue, sans-serif' }}>11</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--terminal-text-dim)', textTransform: 'uppercase' }}>States Covered</div>
            </div>
          </div>
        </div>

        {/* Open Source */}
        <div className="terminal-card">
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--terminal-amber)', marginBottom: '1rem' }}>
            TRANSPARENCY
          </h2>
          <p style={{ lineHeight: 1.8, fontSize: '0.9rem' }}>
            All data is sourced from public records. No proprietary data is used.
            The corruption score algorithm is deterministic — the same inputs always produce the same output.
            We do not accept funding from any political party, PAC, or lobby group.
          </p>
        </div>
      </div>

      <div className="classified-footer">
        PUBLIC RECORDS: FEC // STATE ELECTION DATABASES // LDA SENATE // LEGISCAN // COURTLISTENER
      </div>
    </div>
  );
}
