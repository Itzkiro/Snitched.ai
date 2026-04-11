'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { Politician } from '@/lib/types';
import { getStateName } from '@/lib/state-utils';

const ZipMap = dynamic(() => import('@/components/ZipMap'), { ssr: false });

export default function ZipPage() {
  return <Suspense fallback={<div style={{ padding: '2rem', color: 'var(--terminal-green)' }}>Loading...</div>}><ZipContent /></Suspense>;
}

function ZipContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const zipParam = searchParams.get('zip') || '';
  const [zip, setZip] = useState(zipParam);
  const [results, setResults] = useState<{
    zip?: string;
    state: string;
    districtInfo?: {
      state: string; stateName: string;
      congressionalDistrict: string | null; stateSenateDistrict: string | null;
      stateHouseDistrict: string | null; county: string | null;
      city: string | null; schoolDistrict: string | null;
      lat: number | null; lng: number | null;
    } | null;
    officials: Politician[];
    candidates: Politician[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'officials' | 'candidates'>('officials');

  useEffect(() => {
    if (zipParam && zipParam.length === 5) {
      doSearch(zipParam);
    }
  }, [zipParam]);

  async function doSearch(z: string) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/zip-lookup?zip=${z}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Lookup failed'); setResults(null); }
      else setResults(data);
    } catch { setError('Network error'); }
    setLoading(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (zip.length === 5) {
      router.push(`/zip?zip=${zip}`);
      doSearch(zip);
    }
  }

  function PoliticianRow({ pol }: { pol: Politician }) {
    return (
      <Link href={`/politician/${pol.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '0.75rem 1rem', borderBottom: '1px solid var(--terminal-border)',
          transition: 'background 0.15s',
        }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,255,65,0.04)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
            <span style={{
              fontSize: '0.6rem', padding: '0.15rem 0.4rem', fontWeight: 700,
              background: pol.party === 'Republican' ? 'rgba(255,8,68,0.15)' : 'rgba(0,255,65,0.1)',
              color: pol.party === 'Republican' ? 'var(--terminal-red)' : 'var(--terminal-green)',
            }}>{pol.party === 'Republican' ? 'R' : pol.party === 'Democrat' ? 'D' : 'I'}</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{pol.name}</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--terminal-text-dim)', marginTop: '0.1rem' }}>
                {pol.office} {pol.district ? `| District ${pol.district}` : ''} {pol.jurisdiction ? `| ${pol.jurisdiction}` : ''}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.55rem', color: 'var(--terminal-text-dim)' }}>SCORE</div>
              <div style={{
                fontSize: '1.1rem', fontWeight: 700,
                color: pol.corruptionScore >= 60 ? 'var(--terminal-red)' : pol.corruptionScore >= 40 ? 'var(--terminal-amber)' : 'var(--terminal-green)',
              }}>{pol.corruptionScore}</div>
            </div>
            {(pol.israelLobbyTotal || pol.aipacFunding || 0) > 0 && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.55rem', color: 'var(--terminal-text-dim)' }}>LOBBY</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--terminal-red)', fontFamily: 'Bebas Neue, sans-serif' }}>
                  {(() => { const a = pol.israelLobbyTotal || pol.aipacFunding || 0; return a >= 1e6 ? `$${(a/1e6).toFixed(1)}M` : `$${(a/1e3).toFixed(0)}K`; })()}
                </div>
              </div>
            )}
          </div>
        </div>
      </Link>
    );
  }

  const stateName = results ? getStateName(results.state) : '';

  return (
    <div style={{ minHeight: '100vh', paddingBottom: '4rem' }}>
      {/* Header */}
      <div style={{ padding: '2rem', borderBottom: '1px solid var(--terminal-border)' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 400, letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
          ZIP CODE LOOKUP
        </h1>
        <div style={{ color: 'var(--terminal-text-dim)', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Find all officials and candidates in your area
        </div>
      </div>

      {/* Search bar */}
      <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--terminal-border)', background: 'var(--terminal-surface)' }}>
        <form onSubmit={handleSubmit} style={{ maxWidth: '400px', display: 'flex', gap: '0.5rem' }}>
          <div style={{ flex: 1, display: 'flex', background: 'var(--terminal-card)', border: '1px solid var(--terminal-border)' }}>
            <span style={{ padding: '0.7rem 0.75rem', color: 'var(--terminal-green)', fontSize: '0.8rem' }}>#</span>
            <input type="text" placeholder="Enter ZIP code (e.g. 33101)" value={zip}
              onChange={e => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
              maxLength={5} inputMode="numeric"
              style={{
                flex: 1, padding: '0.7rem 0.5rem', background: 'transparent', border: 'none',
                color: 'var(--terminal-green)', fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.9rem', outline: 'none', letterSpacing: '0.15em', caretColor: 'var(--terminal-green)',
              }} />
          </div>
          <button type="submit" disabled={zip.length !== 5} style={{
            padding: '0.7rem 1.5rem', background: zip.length === 5 ? 'var(--terminal-green)' : 'var(--terminal-border)',
            border: 'none', color: '#000', fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.75rem', fontWeight: 700, cursor: zip.length === 5 ? 'pointer' : 'not-allowed',
          }}>LOOKUP</button>
        </form>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ padding: '3rem 2rem', textAlign: 'center' }}>
          <div style={{ color: 'var(--terminal-green)', fontSize: '0.8rem', animation: 'pulse 2s infinite' }}>
            $ querying database for ZIP {zip}...
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <div style={{ color: 'var(--terminal-red)', fontSize: '0.85rem' }}>[ERROR] {error}</div>
        </div>
      )}

      {/* Results */}
      {results && !loading && (
        <div style={{ display: 'flex', gap: '0', minHeight: 'calc(100vh - 200px)' }}>
          {/* Left: results */}
          <div style={{ flex: '1 1 0', padding: '0 2rem', minWidth: 0, overflowY: 'auto' }}>
          {/* Result header */}
          <div style={{
            padding: '1.5rem 0', borderBottom: '1px solid var(--terminal-border)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '0.75rem' }}>
              <div>
                <div style={{ fontSize: '0.6rem', color: 'var(--terminal-text-dim)', letterSpacing: '0.15em', marginBottom: '0.2rem' }}>RESULTS FOR ZIP {results.zip || zip}</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--terminal-green)' }}>
                  {stateName} &mdash; {results.officials.length + results.candidates.length} Politicians Found
                </div>
              </div>
              <Link href={`/dashboard?state=${results.state}`} style={{
                padding: '0.4rem 0.8rem', border: '1px solid var(--terminal-border)',
                color: 'var(--terminal-green)', fontSize: '0.7rem', textDecoration: 'none',
                textTransform: 'uppercase', letterSpacing: '0.1em',
              }}>
                VIEW {results.state} DASHBOARD
              </Link>
            </div>

            {/* District info badges */}
            {results.districtInfo && (
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.65rem' }}>
                {results.districtInfo.congressionalDistrict && (
                  <div style={{ padding: '0.4rem 0.6rem', background: 'rgba(0,255,65,0.06)', border: '1px solid var(--terminal-border)' }}>
                    <span style={{ color: 'var(--terminal-text-dim)' }}>US HOUSE </span>
                    <span style={{ color: 'var(--terminal-green)', fontWeight: 700 }}>{results.state}-{results.districtInfo.congressionalDistrict}</span>
                  </div>
                )}
                {results.districtInfo.stateSenateDistrict && (
                  <div style={{ padding: '0.4rem 0.6rem', background: 'rgba(0,255,65,0.06)', border: '1px solid var(--terminal-border)' }}>
                    <span style={{ color: 'var(--terminal-text-dim)' }}>STATE SENATE </span>
                    <span style={{ color: 'var(--terminal-green)', fontWeight: 700 }}>District {results.districtInfo.stateSenateDistrict}</span>
                  </div>
                )}
                {results.districtInfo.stateHouseDistrict && (
                  <div style={{ padding: '0.4rem 0.6rem', background: 'rgba(0,255,65,0.06)', border: '1px solid var(--terminal-border)' }}>
                    <span style={{ color: 'var(--terminal-text-dim)' }}>STATE HOUSE </span>
                    <span style={{ color: 'var(--terminal-green)', fontWeight: 700 }}>District {results.districtInfo.stateHouseDistrict}</span>
                  </div>
                )}
                {results.districtInfo.county && (
                  <div style={{ padding: '0.4rem 0.6rem', background: 'rgba(0,255,65,0.06)', border: '1px solid var(--terminal-border)' }}>
                    <span style={{ color: 'var(--terminal-text-dim)' }}>COUNTY </span>
                    <span style={{ color: 'var(--terminal-green)', fontWeight: 700 }}>{results.districtInfo.county}</span>
                  </div>
                )}
                {results.districtInfo.city && (
                  <div style={{ padding: '0.4rem 0.6rem', background: 'rgba(0,255,65,0.06)', border: '1px solid var(--terminal-border)' }}>
                    <span style={{ color: 'var(--terminal-text-dim)' }}>CITY </span>
                    <span style={{ color: 'var(--terminal-green)', fontWeight: 700 }}>{results.districtInfo.city}</span>
                  </div>
                )}
                {results.districtInfo.schoolDistrict && (
                  <div style={{ padding: '0.4rem 0.6rem', background: 'rgba(0,255,65,0.06)', border: '1px solid var(--terminal-border)' }}>
                    <span style={{ color: 'var(--terminal-text-dim)' }}>SCHOOL </span>
                    <span style={{ color: 'var(--terminal-green)', fontWeight: 700 }}>{results.districtInfo.schoolDistrict}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tabs */}
          <div style={{
            display: 'flex', gap: '0', marginTop: '1.5rem',
            borderBottom: '1px solid var(--terminal-border)',
          }}>
            <button
              onClick={() => setActiveTab('officials')}
              style={{
                padding: '0.75rem 1.5rem', background: 'none', border: 'none',
                borderBottom: activeTab === 'officials' ? '2px solid var(--terminal-green)' : '2px solid transparent',
                color: activeTab === 'officials' ? 'var(--terminal-green)' : 'var(--terminal-text-dim)',
                fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem',
                fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase',
                letterSpacing: '0.1em', transition: 'all 0.2s',
              }}
            >
              SEATED OFFICIALS ({results.officials.length})
            </button>
            <button
              onClick={() => setActiveTab('candidates')}
              style={{
                padding: '0.75rem 1.5rem', background: 'none', border: 'none',
                borderBottom: activeTab === 'candidates' ? '2px solid var(--terminal-amber)' : '2px solid transparent',
                color: activeTab === 'candidates' ? 'var(--terminal-amber)' : 'var(--terminal-text-dim)',
                fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem',
                fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase',
                letterSpacing: '0.1em', transition: 'all 0.2s',
              }}
            >
              CANDIDATES ({results.candidates.length})
            </button>
          </div>

          {/* Officials Tab */}
          {activeTab === 'officials' && (
            <div style={{ marginTop: '1rem' }}>
              {results.officials.length > 0 ? (
                <div style={{ border: '1px solid var(--terminal-border)', background: 'var(--terminal-card)' }}>
                  {(() => {
                    const fed = results.officials.filter(p => p.officeLevel === 'US Senator' || p.officeLevel === 'US Representative');
                    const stateLevel = results.officials.filter(p => p.officeLevel === 'Governor' || p.officeLevel === 'State Senator' || p.officeLevel === 'State Representative');
                    const local = results.officials.filter(p => !['US Senator', 'US Representative', 'Governor', 'State Senator', 'State Representative'].includes(p.officeLevel));
                    return (
                      <>
                        {fed.length > 0 && (
                          <>
                            <div style={{ padding: '0.5rem 1rem', background: 'rgba(0,255,65,0.04)', fontSize: '0.6rem', color: 'var(--terminal-text-dim)', letterSpacing: '0.15em', fontWeight: 700, borderBottom: '1px solid var(--terminal-border)' }}>
                              FEDERAL ({fed.length})
                            </div>
                            {fed.map(p => <PoliticianRow key={p.id} pol={p} />)}
                          </>
                        )}
                        {stateLevel.length > 0 && (
                          <>
                            <div style={{ padding: '0.5rem 1rem', background: 'rgba(0,255,65,0.04)', fontSize: '0.6rem', color: 'var(--terminal-text-dim)', letterSpacing: '0.15em', fontWeight: 700, borderBottom: '1px solid var(--terminal-border)' }}>
                              STATE ({stateLevel.length})
                            </div>
                            {stateLevel.map(p => <PoliticianRow key={p.id} pol={p} />)}
                          </>
                        )}
                        {local.length > 0 && (
                          <>
                            <div style={{ padding: '0.5rem 1rem', background: 'rgba(0,255,65,0.04)', fontSize: '0.6rem', color: 'var(--terminal-text-dim)', letterSpacing: '0.15em', fontWeight: 700, borderBottom: '1px solid var(--terminal-border)' }}>
                              COUNTY & LOCAL ({local.length})
                            </div>
                            {local.map(p => <PoliticianRow key={p.id} pol={p} />)}
                          </>
                        )}
                      </>
                    );
                  })()}
                </div>
              ) : (
                <div style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--terminal-text-dim)', fontSize: '0.8rem' }}>
                  No seated officials found for this ZIP code.
                </div>
              )}
            </div>
          )}

          {/* Candidates Tab */}
          {activeTab === 'candidates' && (
            <div style={{ marginTop: '1rem' }}>
              {results.candidates.length > 0 ? (
                <div style={{ border: '1px solid var(--terminal-border)', background: 'var(--terminal-card)' }}>
                  {results.candidates.map(p => <PoliticianRow key={p.id} pol={p} />)}
                </div>
              ) : (
                <div style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--terminal-text-dim)', fontSize: '0.8rem' }}>
                  No active candidates found for this district. Candidate data will appear when the 2026 filing period opens.
                </div>
              )}
            </div>
          )}
          </div>
          {/* Right: Map */}
          {results.districtInfo?.lat && results.districtInfo?.lng && (
            <div style={{
              flex: '0 0 350px', borderLeft: '1px solid var(--terminal-border)',
              position: 'sticky', top: 0, height: 'calc(100vh - 140px)', alignSelf: 'flex-start',
            }}>
              <div style={{
                padding: '0.5rem 0.75rem', background: 'var(--terminal-surface)',
                borderBottom: '1px solid var(--terminal-border)',
                fontSize: '0.6rem', color: 'var(--terminal-text-dim)',
                letterSpacing: '0.15em', fontWeight: 700,
              }}>
                LOCATION MAP
              </div>
              <div style={{ height: 'calc(100% - 30px)' }}>
                <ZipMap
                  lat={results.districtInfo.lat}
                  lng={results.districtInfo.lng}
                  zip={results.zip || zip}
                  county={results.districtInfo.county}
                  city={results.districtInfo.city}
                  stateName={results.districtInfo.stateName}
                />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="classified-footer" style={{ marginTop: '3rem' }}>
        ZIP LOOKUP // STATE: {stateName || 'AWAITING INPUT'} // PUBLIC RECORDS: FEC // STATE ELECTION DATABASES
      </div>
    </div>
  );
}
