'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const ACTIVE_STATES = new Set(['FL', 'OH']);
const DATA_STATES = new Set(['CA', 'TX', 'NY', 'GA', 'PA', 'IL', 'NC', 'MI', 'NJ']);

const STATE_ABBR_FROM_FIPS: Record<string, string> = {
  '01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA','08':'CO','09':'CT','10':'DE',
  '11':'DC','12':'FL','13':'GA','15':'HI','16':'ID','17':'IL','18':'IN','19':'IA',
  '20':'KS','21':'KY','22':'LA','23':'ME','24':'MD','25':'MA','26':'MI','27':'MN',
  '28':'MS','29':'MO','30':'MT','31':'NE','32':'NV','33':'NH','34':'NJ','35':'NM',
  '36':'NY','37':'NC','38':'ND','39':'OH','40':'OK','41':'OR','42':'PA','44':'RI',
  '45':'SC','46':'SD','47':'TN','48':'TX','49':'UT','50':'VT','51':'VA','53':'WA',
  '54':'WV','55':'WI','56':'WY',
};

interface USMapProps {
  onStateClick?: (stateCode: string) => void;
}

export default function USMap({ onStateClick }: USMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  // Tap-to-interact (UI-SPEC §10 / RISKS §2.3) — only relevant at base (<lg).
  // Overlay sits on top of the Leaflet map until first user tap, preventing
  // the iOS Safari single-finger drag from trapping page scroll.
  const [interacted, setInteracted] = useState(false);

  const handleInteract = () => {
    setInteracted(true);
    const map = mapInstance.current;
    if (!map) return;
    // Re-enable touch interactions that were disabled by initial Leaflet options.
    map.scrollWheelZoom.enable();
    map.dragging.enable();
  };

  useEffect(() => {
    if (!mapRef.current) return;
    if (mapInstance.current) {
      mapInstance.current.remove();
      mapInstance.current = null;
    }

    // At lg:+ the map starts fully interactive (no overlay).
    // At base, dragging+scrollWheelZoom are off until the user taps the overlay.
    const isLg = typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;
    if (isLg) setInteracted(true);

    const map = L.map(mapRef.current, {
      center: [38, -96],
      zoom: 4,
      zoomControl: false,
      attributionControl: false,
      dragging: isLg,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
    });

    // Dark tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
      maxZoom: 8,
      minZoom: 3,
    }).addTo(map);

    mapInstance.current = map;

    // Fetch US state boundaries GeoJSON from Census
    fetch('https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json')
      .then(r => r.json())
      .then((geojson: GeoJSON.FeatureCollection) => {
        L.geoJSON(geojson, {
          style: (feature) => {
            const props = feature?.properties || {};
            // Try to get state abbreviation — the dataset uses state names
            const name = props.name || '';
            const abbr = getStateAbbr(name);
            const isActive = ACTIVE_STATES.has(abbr);
            const hasData = DATA_STATES.has(abbr);

            if (isActive) {
              return {
                fillColor: '#00FF41',
                fillOpacity: 0.35,
                color: '#00FF41',
                weight: 2,
                opacity: 0.9,
              };
            }
            if (hasData) {
              return {
                fillColor: '#00FF41',
                fillOpacity: 0.08,
                color: 'rgba(0,255,65,0.4)',
                weight: 1,
                opacity: 0.6,
              };
            }
            return {
              fillColor: 'transparent',
              fillOpacity: 0,
              color: 'rgba(255,255,255,0.12)',
              weight: 0.5,
              opacity: 0.5,
            };
          },
          onEachFeature: (feature, layer) => {
            const name = feature.properties?.name || '';
            const abbr = getStateAbbr(name);
            const isActive = ACTIVE_STATES.has(abbr);
            const hasData = DATA_STATES.has(abbr);

            if (isActive || hasData) {
              layer.on({
                mouseover: (e) => {
                  const l = e.target;
                  l.setStyle({
                    fillOpacity: isActive ? 0.5 : 0.2,
                    weight: 2,
                    color: '#00FF41',
                  });
                },
                mouseout: (e) => {
                  const l = e.target;
                  l.setStyle({
                    fillOpacity: isActive ? 0.35 : 0.08,
                    weight: isActive ? 2 : 1,
                    color: isActive ? '#00FF41' : 'rgba(0,255,65,0.4)',
                  });
                },
                click: () => {
                  if (onStateClick) onStateClick(abbr);
                },
              });

              // Label for active states
              if (isActive) {
                const center = (layer as L.GeoJSON).getBounds?.()?.getCenter?.();
                if (center) {
                  L.marker(center, {
                    icon: L.divIcon({
                      className: '',
                      html: `<div style="color:#00FF41;font-family:JetBrains Mono,monospace;font-size:11px;font-weight:700;text-shadow:0 0 8px #00FF41;text-align:center;pointer-events:none">${abbr}</div>`,
                      iconSize: [30, 15],
                      iconAnchor: [15, 7],
                    }),
                  }).addTo(map);
                }
              }
            }
          },
        }).addTo(map);
      })
      .catch(() => {});

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [onStateClick]);

  return (
    <div className="relative" style={{ width: '100%', height: '320px' }}>
      <div ref={mapRef} style={{
        width: '100%',
        height: '100%',
        borderRadius: 0,
        border: '1px solid rgba(0,255,65,0.12)',
        background: '#000',
      }} />
      {/* Tap-to-interact overlay (UI-SPEC §10 / RISKS §2.3).
          Visible only at base (<lg) and only until first tap.
          z-[400] sits above Leaflet tile layer; raise to z-[600] if popup bleed. */}
      {!interacted && (
        <div
          className="lg:hidden absolute inset-0 z-[400] flex items-center justify-center cursor-pointer"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={handleInteract}
          onTouchStart={handleInteract}
        >
          <span className="font-mono text-sm uppercase tracking-[0.08em]" style={{ color: 'var(--terminal-green)' }}>
            TAP TO INTERACT
          </span>
        </div>
      )}
    </div>
  );
}

// Map state name → abbreviation
const STATE_NAME_TO_ABBR: Record<string, string> = {
  'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA',
  'Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA',
  'Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA',
  'Kansas':'KS','Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD',
  'Massachusetts':'MA','Michigan':'MI','Minnesota':'MN','Mississippi':'MS',
  'Missouri':'MO','Montana':'MT','Nebraska':'NE','Nevada':'NV','New Hampshire':'NH',
  'New Jersey':'NJ','New Mexico':'NM','New York':'NY','North Carolina':'NC',
  'North Dakota':'ND','Ohio':'OH','Oklahoma':'OK','Oregon':'OR','Pennsylvania':'PA',
  'Rhode Island':'RI','South Carolina':'SC','South Dakota':'SD','Tennessee':'TN',
  'Texas':'TX','Utah':'UT','Vermont':'VT','Virginia':'VA','Washington':'WA',
  'West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY','District of Columbia':'DC',
};

function getStateAbbr(name: string): string {
  return STATE_NAME_TO_ABBR[name] || '';
}
