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

/** Known county names — used to discover counties dynamically from data */
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

  // ── Federal ──
  const federal = branchNode('federal', 'Federal Delegation', [
    leafNode('us-senate', 'U.S. Senate', byOffice('US Senator')),
    leafNode('us-house', 'U.S. House', byOffice('US Representative')),
  ]);

  // ── State Executive ──
  const stateExec = leafNode('state-exec', 'State Executive', byOffice('Governor'));

  // ── State Legislature ──
  const stateLeg = branchNode('state-leg', 'State Legislature', [
    leafNode('state-senate', 'State Senate', byOffice('State Senator')),
    leafNode('state-house', 'State House', byOffice('State Representative')),
  ]);

  // ── Counties ──
  // Group all county/municipal politicians by their parent county
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

  // ── Top-level tree ──
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

/** Return a risk color class based on corruption score */
function riskColor(score: number): string {
  if (score < 40) return 'text-primary-container';
  if (score < 60) return 'text-[#FFD166]';
  return 'text-error';
}

/** Return a border color class based on corruption score */
function riskBorderColor(score: number): string {
  if (score < 40) return 'border-primary-container/50';
  if (score < 60) return 'border-[#FFD166]/50';
  return 'border-error/50';
}

/** Return a risk label */
function riskLabel(score: number): string {
  if (score < 40) return 'SECURE';
  if (score < 60) return 'MEDIUM_RISK';
  return 'HIGH_RISK';
}

/** Return a risk badge bg */
function riskBadgeBg(score: number): string {
  if (score < 40) return 'bg-primary-container text-[#080A0D]';
  if (score < 60) return 'bg-[#FFD166] text-[#080A0D]';
  return 'bg-error text-[#080A0D]';
}

/** Compute average corruption score for a node */
function avgCorruptionScore(node: HierarchyNode): number {
  const allPols = collectPoliticians(node);
  if (allPols.length === 0) return 0;
  return Math.round(allPols.reduce((s, p) => s + p.corruptionScore, 0) / allPols.length);
}

/** Collect all politicians recursively from a node */
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
        console.error('Error loading:', err);
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="font-mono text-primary-container text-sm tracking-widest uppercase animate-pulse">
          LOADING_HIERARCHY_DATA...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="bg-surface-container border border-error/30 p-6">
          <div className="font-mono text-error text-sm uppercase tracking-widest">SYSTEM_ERROR</div>
          <div className="font-mono text-[#C8D8E8] text-xs mt-2">{error}</div>
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
  const currentScore = avgCorruptionScore(currentNode);

  return (
    <div className="min-h-screen bg-background text-on-background font-body relative">
      {/* Header */}
      <header className="mb-10 px-6 pt-8">
        <h1 className="font-mono text-xl md:text-2xl text-[#00FF88] tracking-tighter flex items-center">
          <span className="mr-3">&gt; ORG_HIERARCHY_MAP_V1.2</span>
          <span className="w-3 h-8 bg-[#00FF88] terminal-cursor" />
        </h1>
        <p className="font-mono text-[0.7rem] text-[#C8D8E8]/40 mt-2 tracking-widest uppercase">
          ACCESS_LEVEL: ALPHA_SENTINEL // DATA_SOURCE: FEC_REALTIME_STREAM
        </p>
      </header>

      {/* Hierarchy Visualization */}
      <div className="relative min-h-[600px] flex flex-col items-center px-6">

        {/* Breadcrumb Trail — Vertical Stack */}
        {breadcrumbs.length > 1 && (
          <div className="mb-12 flex flex-col items-center">
            {breadcrumbs.map((crumb, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <div key={crumb.id} className="flex flex-col items-center">
                  <button
                    onClick={() => navigateUp(idx)}
                    disabled={isLast}
                    className={`
                      font-mono text-xs uppercase tracking-widest px-4 py-2 border transition-all
                      ${isLast
                        ? 'bg-surface-container border-primary-container text-[#00FF88] cursor-default'
                        : 'bg-surface-container-lowest border-outline-variant text-[#C8D8E8]/60 hover:border-primary-container hover:text-[#00FF88] cursor-pointer'
                      }
                    `}
                  >
                    {crumb.name.toUpperCase().replace(/\s+/g, '_')}
                  </button>
                  {!isLast && (
                    <div className="h-6 w-[2px] bg-primary-container/20" />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Current Level Node — Primary box */}
        <div className="relative mb-16 flex flex-col items-center group">
          <div className="bg-surface-container border-2 border-primary-container px-8 py-4 shadow-[0_0_20px_rgba(0,255,136,0.15)] flex items-center space-x-4">
            <span className="material-symbols-outlined text-primary-container text-2xl">
              {path.length <= 1 ? 'public' : path.length <= 2 ? 'account_balance' : 'domain'}
            </span>
            <div>
              <div className="font-mono text-[0.65rem] text-primary-container font-bold opacity-70 uppercase tracking-widest">
                LVL_{String(path.length).padStart(2, '0')}: {currentNode.name.toUpperCase().replace(/\s+/g, '_')}
              </div>
              <div className="font-headline font-bold text-lg tracking-tight uppercase text-[#C8D8E8]">
                {currentNode.name}
              </div>
            </div>
            <div className={`ml-6 flex items-center px-3 py-1 border ${currentScore >= 60 ? 'bg-error-container/20 border-error/30' : currentScore >= 40 ? 'bg-[#FFD166]/10 border-[#FFD166]/30' : 'bg-primary-container/10 border-primary-container/30'}`}>
              <span className={`font-mono text-sm font-bold ${riskColor(currentScore)}`}>
                {currentScore}
              </span>
            </div>
          </div>

          {/* Connector Line down from current level */}
          {(currentNode.children && currentNode.children.length > 0) && (
            <>
              <div className="h-12 w-[2px] bg-primary-container/20" />
              {currentNode.children.length > 1 && (
                <div className="w-full max-w-4xl flex justify-center">
                  <div className="h-[2px] w-[80%] bg-primary-container/20 relative">
                    {currentNode.children.map((_, i) => {
                      const count = currentNode.children!.length;
                      const pct = count === 1 ? 50 : (i / (count - 1)) * 100;
                      return (
                        <div
                          key={i}
                          className="absolute h-8 w-[2px] bg-primary-container/20"
                          style={{ left: `${pct}%` }}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Stats Row */}
        <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-4 gap-4 mb-12">
          <div className="bg-surface-container-low p-4 border-l-2 border-primary-container/30">
            <div className="font-mono text-[0.6rem] text-[#C8D8E8]/40 mb-1 uppercase tracking-widest">Total Entities</div>
            <div className="font-headline text-2xl font-bold text-[#C8D8E8]">{currentNode.count.toLocaleString()}</div>
          </div>
          <div className="bg-surface-container-low p-4 border-l-2 border-error/30">
            <div className="font-mono text-[0.6rem] text-[#C8D8E8]/40 mb-1 uppercase tracking-widest">
              {currentNode.children ? 'Sub-Divisions' : 'Officials'}
            </div>
            <div className="font-headline text-2xl font-bold text-error">
              {currentNode.children?.length || (currentNode.politicians?.length || 0)}
            </div>
          </div>
          <div className="bg-surface-container-low p-4 border-l-2 border-[#FFD166]/30">
            <div className="font-mono text-[0.6rem] text-[#C8D8E8]/40 mb-1 uppercase tracking-widest">AIPAC Funding</div>
            <div className="font-headline text-2xl font-bold text-[#FFD166]">
              ${(aipacTotal / 1000000).toFixed(1)}M
            </div>
          </div>
          <div className="bg-surface-container-low p-4 border-l-2 border-primary-container/30">
            <div className="font-mono text-[0.6rem] text-[#C8D8E8]/40 mb-1 uppercase tracking-widest">Avg Corruption</div>
            <div className={`font-headline text-2xl font-bold ${riskColor(currentScore)}`}>
              {currentScore}
            </div>
          </div>
        </div>

        {/* Child Nodes — Drill Down Cards */}
        {currentNode.children && currentNode.children.length > 0 && (
          <div className="w-full max-w-6xl mb-12">
            <div className="flex items-center space-x-2 mb-6">
              <div className="w-2 h-2 bg-primary-container animate-pulse" />
              <span className="font-mono text-[0.65rem] text-primary-container font-bold uppercase tracking-widest">
                Drill Down // {currentNode.children.length} Nodes
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {currentNode.children.map((child) => {
                const childScore = avgCorruptionScore(child);
                return (
                  <button
                    key={child.id}
                    onClick={() => navigateTo(child.id)}
                    className="bg-surface-container-low border border-outline-variant hover:border-primary-container transition-all p-1 w-full text-left group"
                  >
                    <div className="p-4 flex flex-col">
                      <div className="flex justify-between items-start mb-4">
                        <div className={`${riskBadgeBg(childScore)} px-2 py-0.5 font-mono text-[0.6rem] font-bold`}>
                          {riskLabel(childScore)}
                        </div>
                        <span className={`material-symbols-outlined ${riskColor(childScore)}`}>
                          expand_more
                        </span>
                      </div>
                      <div className="font-headline font-bold text-md text-[#C8D8E8] mb-1 uppercase">
                        {child.name.replace(/\s+/g, '_')}
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-[0.65rem] text-[#C8D8E8]/40">
                          ENTITIES: {child.count}
                        </span>
                        <span className={`font-mono text-lg font-bold ${riskColor(childScore)}`}>
                          {childScore}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Individual Politicians */}
        {currentNode.politicians && currentNode.politicians.length > 0 && (
          <div className="w-full max-w-6xl mb-12">
            <div className="flex items-center space-x-2 mb-6">
              <div className="w-2 h-2 bg-error animate-pulse" />
              <span className="font-mono text-[0.65rem] text-error font-bold uppercase tracking-widest">
                Entity Dossiers // {currentNode.politicians.length} Officials
              </span>
            </div>

            <div className="space-y-3">
              {currentNode.politicians.map((politician) => {
                const score = politician.corruptionScore;
                return (
                  <Link
                    key={politician.id}
                    href={`/politician/${politician.id}`}
                    className={`
                      block bg-surface-container-lowest border-l-4 ${riskBorderColor(score)}
                      p-4 hover:bg-surface-container-low transition-colors group
                    `}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <span className="font-headline font-bold text-sm text-[#C8D8E8] uppercase tracking-tight">
                            {politician.name}
                          </span>
                          <span className={`
                            font-mono text-[0.6rem] font-bold px-2 py-0.5
                            ${politician.party === 'Republican'
                              ? 'bg-error-container/30 text-error border border-error/20'
                              : politician.party === 'Democrat'
                                ? 'bg-secondary-container/30 text-secondary border border-secondary/20'
                                : 'bg-surface-container-high text-[#C8D8E8]/60 border border-outline-variant'
                            }
                          `}>
                            {politician.party === 'Republican' ? 'GOP' : politician.party === 'Democrat' ? 'DEM' : politician.party.substring(0, 3).toUpperCase()}
                          </span>
                          {politician.juiceBoxTier !== 'none' && (
                            <span className="font-mono text-[0.6rem] font-bold px-2 py-0.5 bg-[#FFD166]/10 text-[#FFD166] border border-[#FFD166]/20">
                              {politician.juiceBoxTier === 'owned' ? 'OWNED' : politician.juiceBoxTier === 'bought' ? 'BOUGHT' : 'COMPROMISED'}
                              {' '}${(politician.aipacFunding / 1000).toFixed(0)}K
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-[0.65rem] text-[#C8D8E8]/40">
                          {politician.office}{politician.district ? ` // ${politician.district}` : ''}
                        </div>
                      </div>
                      <div className={`font-mono text-lg font-bold ${riskColor(score)}`}>
                        {score}
                      </div>
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
          <div className="w-full max-w-6xl py-16 flex flex-col items-center">
            <span className="material-symbols-outlined text-outline text-4xl mb-4">search_off</span>
            <div className="font-mono text-sm text-[#C8D8E8] uppercase tracking-widest mb-2">
              No Data Available
            </div>
            <div className="font-mono text-xs text-[#C8D8E8]/40">
              {currentNode.name} officials are not yet indexed in the database.
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="classified-footer mt-12">
        ALL DATA ACQUIRED VIA OSINT // PUBLIC RECORDS: FEC, SOCIAL MEDIA, NEWS OUTLETS // HIERARCHY NAVIGATION DIVISION
      </div>
    </div>
  );
}
