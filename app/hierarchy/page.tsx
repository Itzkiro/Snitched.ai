'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import type { Politician } from '@/lib/types';

interface HierarchyNode {
  id: string;
  name: string;
  count: number;
  children?: HierarchyNode[];
  politicians?: Politician[];
}

/**
 * Helper: create a leaf node from a filtered politician list.
 * Returns undefined when the list is empty so callers can filter out blanks.
 */
function leafNode(id: string, name: string, list: Politician[]): HierarchyNode | undefined {
  if (list.length === 0) return undefined;
  return { id, name, count: list.length, politicians: list };
}

/**
 * Helper: create a branch node whose count is the sum of its children.
 * Empty children are filtered out automatically.
 */
function branchNode(id: string, name: string, children: (HierarchyNode | undefined)[]): HierarchyNode | undefined {
  const valid = children.filter((c): c is HierarchyNode => c != null && c.count > 0);
  if (valid.length === 0) return undefined;
  return { id, name, count: valid.reduce((s, c) => s + c.count, 0), children: valid };
}

/** Map municipality jurisdictions to their parent county */
const MUNICIPALITY_TO_COUNTY: Record<string, string> = {
  'Palm Coast': 'Flagler County',
  'Flagler Beach': 'Flagler County',
  'Bunnell': 'Flagler County',
  'Palatka': 'Putnam County',
  'Crescent City': 'Putnam County',
};

/** Known county names -- used to discover counties dynamically from data */
const COUNTY_NAMES = [
  'Volusia County', 'Flagler County', 'Putnam County',
  'Lake County', 'Seminole County', 'Orange County', 'Brevard County',
];

const CONSTITUTIONAL_OFFICES: Politician['officeLevel'][] = [
  'Sheriff', 'Clerk of Court', 'Property Appraiser', 'Tax Collector', 'Supervisor of Elections',
];

/**
 * Build a sub-tree for a single county from all politicians that belong to it
 * (including municipal officials from cities within the county).
 */
function buildCountyNode(slug: string, countyName: string, pols: Politician[]): HierarchyNode | undefined {
  if (pols.length === 0) return undefined;

  const commissioners = pols.filter(p => p.officeLevel === 'County Commissioner');
  const constitutional = pols.filter(p => CONSTITUTIONAL_OFFICES.includes(p.officeLevel));
  const schoolBoard = pols.filter(p => p.officeLevel === 'School Board');
  const judges = pols.filter(p => p.officeLevel === 'Judge');
  const stateAttorneys = pols.filter(p => p.officeLevel === 'State Attorney');
  const publicDefenders = pols.filter(p => p.officeLevel === 'Public Defender');
  const legalOfficers = [...stateAttorneys, ...publicDefenders];
  const soilWater = pols.filter(p => p.officeLevel === 'Soil & Water');
  const mayors = pols.filter(p => p.officeLevel === 'Mayor');
  const cityCommissioners = pols.filter(p => p.officeLevel === 'City Commissioner');

  const countyGov = branchNode(`${slug}-gov`, 'County Government', [
    leafNode(`${slug}-commissioners`, 'County Commissioners', commissioners),
    leafNode(`${slug}-constitutional`, 'Constitutional Officers', constitutional),
  ]);

  const education = leafNode(`${slug}-education`, 'School Board', schoolBoard);

  const judiciary = branchNode(`${slug}-judiciary`, 'Judiciary', [
    leafNode(`${slug}-judges`, 'Judges', judges),
    leafNode(`${slug}-legal`, 'State Attorney & Public Defender', legalOfficers),
  ]);

  const municipal = branchNode(`${slug}-municipal`, 'Municipal Officials', [
    leafNode(`${slug}-mayors`, 'Mayors', mayors),
    leafNode(`${slug}-city-comm`, 'City Commissioners', cityCommissioners),
  ]);

  const special = leafNode(`${slug}-soil-water`, 'Soil & Water Conservation', soilWater);

  return branchNode(slug, countyName, [
    countyGov,
    education,
    judiciary,
    municipal,
    special,
  ]);
}

/**
 * Build the full hierarchy tree from the flat politician list returned by the API.
 * Every count is derived from the actual data -- nothing is hardcoded.
 */
function buildHierarchy(all: Politician[]): HierarchyNode {
  const byOffice = (level: Politician['officeLevel']) => all.filter(p => p.officeLevel === level);

  // -- Federal --
  const federal = branchNode('federal', 'Federal Delegation', [
    leafNode('us-senate', 'U.S. Senate', byOffice('US Senator')),
    leafNode('us-house', 'U.S. House', byOffice('US Representative')),
  ]);

  // -- State Executive --
  const stateExec = leafNode('state-exec', 'State Executive', byOffice('Governor'));

  // -- State Legislature --
  const stateLeg = branchNode('state-leg', 'State Legislature', [
    leafNode('state-senate', 'State Senate', byOffice('State Senator')),
    leafNode('state-house', 'State House', byOffice('State Representative')),
  ]);

  // -- Counties --
  const countyGroups: Record<string, Politician[]> = {};
  for (const name of COUNTY_NAMES) countyGroups[name] = [];

  for (const p of all) {
    if (p.jurisdictionType !== 'county' && p.jurisdictionType !== 'municipal') continue;
    const parentCounty = MUNICIPALITY_TO_COUNTY[p.jurisdiction] || p.jurisdiction;
    if (!countyGroups[parentCounty]) countyGroups[parentCounty] = [];
    countyGroups[parentCounty].push(p);
  }

  const countyNodes: (HierarchyNode | undefined)[] = Object.entries(countyGroups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, pols]) => {
      const slug = name.toLowerCase().replace(/\s+/g, '-');
      return buildCountyNode(slug, name, pols);
    });

  const countiesNode = branchNode('counties', 'Counties', countyNodes);

  // -- Top-level tree --
  const topChildren: (HierarchyNode | undefined)[] = [
    federal,
    stateExec,
    stateLeg,
    countiesNode,
  ];
  const validTop = topChildren.filter((c): c is HierarchyNode => c != null && c.count > 0);

  return {
    id: 'florida',
    name: 'Florida',
    count: validTop.reduce((s, c) => s + c.count, 0),
    children: validTop,
  };
}

/**
 * Recursively sum AIPAC funding across the entire sub-tree rooted at `node`.
 */
function sumAipacFunding(node: HierarchyNode): number {
  let total = 0;
  if (node.politicians) {
    total += node.politicians.reduce((s, p) => s + p.aipacFunding, 0);
  }
  if (node.children) {
    for (const child of node.children) {
      total += sumAipacFunding(child);
    }
  }
  return total;
}

/** Compute a risk score 0-100 from the node's corruption scores */
function computeRiskScore(node: HierarchyNode): number {
  const pols = collectPoliticians(node);
  if (pols.length === 0) return 0;
  const avg = pols.reduce((s, p) => s + p.corruptionScore, 0) / pols.length;
  return Math.round(avg * 10) / 10;
}

/** Collect all politicians under a node recursively */
function collectPoliticians(node: HierarchyNode): Politician[] {
  const result: Politician[] = [];
  if (node.politicians) result.push(...node.politicians);
  if (node.children) {
    for (const child of node.children) {
      result.push(...collectPoliticians(child));
    }
  }
  return result;
}

/** Count critical nodes (score >= 60) */
function countCritical(node: HierarchyNode): number {
  const pols = collectPoliticians(node);
  return pols.filter(p => p.corruptionScore >= 60).length;
}

/** Get risk label */
function riskLabel(score: number): { text: string; color: string } {
  if (score >= 70) return { text: 'STATE_HIGH_RISK', color: 'text-error' };
  if (score >= 40) return { text: 'STATE_NOMINAL', color: 'text-primary-container' };
  return { text: 'STATE_STABLE', color: 'text-primary-container' };
}

export default function HierarchyPage() {
  const [path, setPath] = useState<string[]>(['florida']);
  const [allPoliticians, setAllPoliticians] = useState<Politician[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch('/api/politicians');
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data: Politician[] = await res.json();
        setAllPoliticians(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const hierarchyData = useMemo(() => {
    if (allPoliticians.length === 0) return null;
    return buildHierarchy(allPoliticians);
  }, [allPoliticians]);

  if (loading || !hierarchyData) {
    return (
      <div className="pt-[82px] min-h-screen bg-surface-container-lowest flex items-center justify-center">
        <div className="font-label text-xs text-primary-container animate-pulse tracking-widest uppercase">
          LOADING_HIERARCHY_DATA...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pt-[82px] min-h-screen bg-surface-container-lowest flex items-center justify-center">
        <div className="font-label text-xs text-error tracking-widest uppercase">
          ERROR: {error}
        </div>
      </div>
    );
  }

  const getCurrentNode = (): HierarchyNode => {
    let current = hierarchyData;
    for (let i = 1; i < path.length; i++) {
      const child = current.children?.find(c => c.id === path[i]);
      if (child) current = child;
      else break;
    }
    return current;
  };

  const navigateTo = (nodeId: string) => {
    setPath([...path, nodeId]);
  };

  const navigateUp = (index: number) => {
    setPath(path.slice(0, index + 1));
  };

  const currentNode = getCurrentNode();
  const breadcrumbs = path.map((id, idx) => {
    let node = hierarchyData;
    for (let i = 1; i <= idx; i++) {
      const child = node.children?.find(c => c.id === path[i]);
      if (child) node = child;
    }
    return { id, name: node.name };
  });

  const aipacTotal = sumAipacFunding(currentNode);
  const riskScore = computeRiskScore(currentNode);
  const criticalCount = countCritical(currentNode);
  const childCount = currentNode.children?.length || 0;

  return (
    <main className="pt-[82px] pb-20 px-6 min-h-screen bg-surface-container-lowest">
      {/* Terminal Header */}
      <header className="mb-12">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-emerald-500 font-label text-xs">$</span>
          <h1 className="font-label text-lg text-primary-container tracking-tighter uppercase crt-glow">
            INIT_HIERARCHY_VISUALIZER.SH --NODE={currentNode.name.toUpperCase().replace(/\s+/g, '_')}
            <span className="inline-block w-2 h-[1.2em] bg-primary-container ml-1 animate-pulse" />
          </h1>
        </div>
        <div className="flex gap-4 font-label text-[10px] text-emerald-900 uppercase tracking-widest">
          <span>MAP_ID: X-7741</span>
          <span>ENCRYPTION: RSA-4096</span>
          <span>SYNC: 100%</span>
        </div>
      </header>

      {/* Breadcrumb Path */}
      {breadcrumbs.length > 1 && (
        <div className="flex items-center gap-2 mb-8 font-label text-[10px] text-emerald-900 uppercase tracking-widest">
          {breadcrumbs.map((crumb, idx) => (
            <span key={crumb.id} className="flex items-center gap-2">
              {idx > 0 && <span className="text-outline-variant">/</span>}
              <button
                onClick={() => navigateUp(idx)}
                className={`hover:text-primary-container transition-none ${
                  idx === breadcrumbs.length - 1
                    ? 'text-primary-container font-bold'
                    : 'text-emerald-900 cursor-pointer'
                }`}
              >
                {crumb.name.toUpperCase().replace(/\s+/g, '_')}
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Tree Visualization */}
      <div className="max-w-6xl mx-auto flex flex-col items-center">
        {/* Root Node */}
        <div className="relative mb-12 flex flex-col items-center">
          <div className="bg-surface-container-high border-2 border-primary-container p-1 shadow-[0_0_20px_rgba(0,255,136,0.2)]"
               style={{ clipPath: 'polygon(10px 0%, 100% 0%, calc(100% - 10px) 100%, 0% 100%)' }}>
            <div className="bg-black/80 px-12 py-4 flex flex-col items-center text-center">
              <span className="font-label text-[10px] text-primary-container/60 mb-1">
                {path.length === 1 ? '01_ROOT_AUTHORITY' : `LEVEL_${path.length}`}
              </span>
              <h2 className="font-headline text-2xl font-black text-white tracking-tighter uppercase mb-2">
                {currentNode.name}
              </h2>
              <div className="flex items-center gap-3">
                <div className="h-px w-8 bg-primary-container/20" />
                <span className="font-label text-lg font-black text-primary-container">{riskScore}</span>
                <div className="h-px w-8 bg-primary-container/20" />
              </div>
            </div>
          </div>
          {/* Connector down */}
          {(currentNode.children && currentNode.children.length > 0) && (
            <>
              <div className="w-px h-10" style={{ background: 'linear-gradient(to bottom, transparent, #00ff88 50%, transparent)' }} />
              <div className="w-[80vw] max-w-5xl h-px bg-primary-container/20" />
            </>
          )}
        </div>

        {/* Child Nodes (Level 2) */}
        {currentNode.children && currentNode.children.length > 0 && (
          <div className={`grid gap-12 w-full ${
            currentNode.children.length === 1 ? 'grid-cols-1 max-w-md mx-auto' :
            currentNode.children.length === 2 ? 'grid-cols-1 md:grid-cols-2' :
            currentNode.children.length === 3 ? 'grid-cols-1 md:grid-cols-3' :
            'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
          }`}>
            {currentNode.children.map((child) => {
              const childRisk = computeRiskScore(child);
              const childLabel = riskLabel(childRisk);
              const isHighRisk = childRisk >= 60;
              const childSlug = child.id.toUpperCase().replace(/-/g, '_');

              return (
                <div key={child.id} className="flex flex-col items-center">
                  {/* Connector vertical */}
                  <div className="w-px h-8" style={{ background: 'linear-gradient(to bottom, transparent, #00ff88 50%, transparent)' }} />

                  {/* Node card */}
                  <button
                    onClick={() => navigateTo(child.id)}
                    className={`w-full bg-surface-container border p-1 transition-none hover:border-primary-container group cursor-pointer text-left ${
                      isHighRisk ? 'border-error/50' : 'border-primary-container/30'
                    }`}
                    style={{ clipPath: 'polygon(10px 0%, 100% 0%, calc(100% - 10px) 100%, 0% 100%)' }}
                  >
                    <div className="bg-black/60 p-4">
                      <div className="flex justify-between items-start mb-3">
                        <span className={`font-label text-[8px] px-1 border ${
                          isHighRisk
                            ? 'text-error border-error/30'
                            : 'text-primary-container border-primary-container/30'
                        }`}>
                          {childLabel.text}
                        </span>
                        <span className="font-label text-[8px] text-emerald-900">
                          ID: {child.id.toUpperCase().slice(0, 5)}
                        </span>
                      </div>
                      <h3 className="font-label font-bold text-white text-sm mb-1 uppercase tracking-tighter">
                        {child.name.toUpperCase().replace(/\s+/g, '_')}
                      </h3>
                      <div className="flex justify-between items-center mt-4">
                        <div className="font-label text-[10px] text-emerald-700">
                          NODES: {child.count}
                        </div>
                        <div className={`font-label text-xl font-black ${
                          isHighRisk ? 'text-error' : 'text-primary-container'
                        }`}>
                          {childRisk}
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* Sub-children preview (Level 3) */}
                  {child.children && child.children.length > 0 && (
                    <>
                      <div className="w-px h-12" style={{ background: 'linear-gradient(to bottom, transparent, #00ff88 50%, transparent)' }} />
                      <div className="w-full space-y-4">
                        {child.children.slice(0, 3).map((sub) => {
                          const subRisk = computeRiskScore(sub);
                          const subHighRisk = subRisk >= 60;
                          return (
                            <button
                              key={sub.id}
                              onClick={() => {
                                setPath([...path, child.id, sub.id]);
                              }}
                              className={`w-full bg-surface-container-lowest border-l-4 p-3 flex justify-between items-center cursor-pointer hover:bg-emerald-900/10 text-left ${
                                subHighRisk ? 'border-error' : 'border-primary-container'
                              }`}
                            >
                              <div>
                                <div className="font-label text-[8px] text-emerald-900 uppercase">SUB_NODE</div>
                                <div className="font-label text-[10px] text-white">
                                  {sub.name.toUpperCase().replace(/\s+/g, '_')}
                                </div>
                              </div>
                              <span className={`font-label text-sm font-bold ${
                                subHighRisk ? 'text-error' : 'text-primary-container'
                              }`}>
                                {subRisk}
                              </span>
                            </button>
                          );
                        })}
                        {child.children.length > 3 && (
                          <div className="font-label text-[10px] text-emerald-900 text-center">
                            +{child.children.length - 3} MORE_NODES
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Individual Politicians (leaf level) */}
        {currentNode.politicians && currentNode.politicians.length > 0 && (
          <div className="w-full mt-8">
            <div className="font-label text-[10px] text-emerald-900 uppercase tracking-widest mb-4 border-b border-outline-variant/30 pb-2">
              ENTITY_LIST // {currentNode.politicians.length} RECORDS
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {currentNode.politicians.map((politician) => {
                const isHighRisk = politician.corruptionScore >= 60;
                return (
                  <Link
                    key={politician.id}
                    href={`/politician/${politician.id}`}
                    className={`bg-surface-container-lowest border-l-4 p-4 hover:bg-emerald-900/10 transition-none block ${
                      isHighRisk ? 'border-error' : 'border-primary-container'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="font-label text-[10px] text-primary-container/60">
                          {politician.office}
                        </div>
                        <div className="font-headline font-bold text-white text-sm uppercase tracking-tighter">
                          {politician.name}
                        </div>
                      </div>
                      <span className={`font-label text-lg font-black ${
                        isHighRisk ? 'text-error' : politician.corruptionScore >= 40 ? 'text-tertiary-fixed-dim' : 'text-primary-container'
                      }`}>
                        {politician.corruptionScore}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`text-[9px] font-label px-1 border ${
                        politician.party === 'Republican'
                          ? 'text-error border-error/30 bg-error/10'
                          : politician.party === 'Democrat'
                          ? 'text-blue-400 border-blue-400/30 bg-blue-400/10'
                          : 'text-outline border-outline-variant'
                      }`}>
                        {politician.party === 'Republican' ? 'R' : politician.party === 'Democrat' ? 'D' : politician.party.charAt(0)}
                      </span>
                      {politician.juiceBoxTier !== 'none' && (
                        <span className="text-[9px] font-label px-1 bg-on-tertiary-container/10 text-on-tertiary-container border border-on-tertiary-container/30">
                          ${(politician.aipacFunding / 1000).toFixed(0)}K
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty State */}
        {(!currentNode.children || currentNode.children.length === 0) &&
         (!currentNode.politicians || currentNode.politicians.length === 0) && (
          <div className="text-center py-16">
            <div className="font-label text-xs text-outline uppercase tracking-widest mb-2">
              NO_DATA_AVAILABLE
            </div>
            <div className="font-label text-[10px] text-emerald-900">
              {currentNode.name} officials are not yet indexed in the database.
            </div>
          </div>
        )}
      </div>

      {/* Right-side Intelligence Overlay (Floating) */}
      <div className="fixed right-6 top-32 w-72 bg-slate-950/80 border border-emerald-900/50 backdrop-blur-md p-6 hidden xl:block shadow-2xl z-40">
        <div className="flex items-center gap-2 mb-6 border-b border-emerald-900/30 pb-2">
          <span className="font-label text-[10px] font-bold text-primary-container tracking-widest">LIVE_TELEMETRY</span>
        </div>
        <div className="space-y-6">
          <div>
            <div className="flex justify-between mb-1">
              <span className="font-label text-[9px] text-emerald-900">NETWORK_LOAD</span>
              <span className="font-label text-[9px] text-primary-container">{Math.min(100, Math.round(currentNode.count / 2))}%</span>
            </div>
            <div className="h-1 bg-emerald-900/30">
              <div
                className="h-full bg-primary-container shadow-[0_0_10px_#00ff88]"
                style={{ width: `${Math.min(100, Math.round(currentNode.count / 2))}%` }}
              />
            </div>
          </div>
          <div className="font-label text-[10px] leading-relaxed text-emerald-600">
            <span className="text-white">&gt; INFO:</span> CORRUPTION_METRIC_AGGREGATION_ACTIVE.<br />
            <span className="text-white">&gt; INFO:</span> CROSS-REFERENCING_FEC_REPORTS...<br />
            <span className="text-white">&gt; INFO:</span> <span className="text-primary-container">READY.</span>
          </div>
          <button className="w-full bg-primary-container text-slate-950 font-label font-bold text-[10px] py-3 uppercase tracking-widest hover:bg-white transition-none">
            DOWNLOAD_REPORT.PDF
          </button>
        </div>
      </div>

      {/* Bottom Summary Cards */}
      <div className="max-w-6xl mx-auto mt-16 grid grid-cols-2 md:grid-cols-4 gap-px bg-outline-variant/30 border border-outline-variant/30">
        <div className="bg-surface-container p-4">
          <div className="font-label text-[10px] text-outline uppercase tracking-tighter">Total_Entities</div>
          <div className="font-headline text-2xl font-bold text-primary-container">{currentNode.count}</div>
        </div>
        <div className="bg-surface-container p-4">
          <div className="font-label text-[10px] text-outline uppercase tracking-tighter">Critical_Failures</div>
          <div className="font-headline text-2xl font-bold text-on-tertiary-container">{criticalCount}</div>
        </div>
        <div className="bg-surface-container p-4">
          <div className="font-label text-[10px] text-outline uppercase tracking-tighter">Sub_Branches</div>
          <div className="font-headline text-2xl font-bold text-primary-container">{childCount}</div>
        </div>
        <div className="bg-surface-container p-4">
          <div className="font-label text-[10px] text-outline uppercase tracking-tighter">AIPAC_Funding</div>
          <div className="font-headline text-2xl font-bold text-on-tertiary-container">
            ${(aipacTotal / 1000000).toFixed(1)}M
          </div>
        </div>
      </div>
    </main>
  );
}
