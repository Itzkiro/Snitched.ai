'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// State name → FIPS code mapping
const STATE_FIPS: Record<string, string> = {
  AL:'01',AK:'02',AZ:'04',AR:'05',CA:'06',CO:'08',CT:'09',DE:'10',FL:'12',GA:'13',
  HI:'15',ID:'16',IL:'17',IN:'18',IA:'19',KS:'20',KY:'21',LA:'22',ME:'23',MD:'24',
  MA:'25',MI:'26',MN:'27',MS:'28',MO:'29',MT:'30',NE:'31',NV:'32',NH:'33',NJ:'34',
  NM:'35',NY:'36',NC:'37',ND:'38',OH:'39',OK:'40',OR:'41',PA:'42',RI:'44',SC:'45',
  SD:'46',TN:'47',TX:'48',UT:'49',VT:'50',VA:'51',WA:'53',WV:'54',WI:'55',WY:'56',
  DC:'11',
};

interface ZipMapProps {
  lat: number;
  lng: number;
  zip: string;
  stateCode?: string;
  congressionalDistrict?: string | null;
  county?: string | null;
  city?: string | null;
  stateName?: string;
}

async function fetchDistrictGeoJSON(stateFips: string, cd: string): Promise<GeoJSON.FeatureCollection | null> {
  try {
    const padded = cd.padStart(2, '0');
    const url = `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Legislative/MapServer/0/query?where=BASENAME='${cd}'+AND+STATE='${stateFips}'&f=geojson&outSR=4326&outFields=BASENAME`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.features?.length > 0) return data;
    // Try with padded number
    const url2 = `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Legislative/MapServer/0/query?where=BASENAME='${padded}'+AND+STATE='${stateFips}'&f=geojson&outSR=4326&outFields=BASENAME`;
    const res2 = await fetch(url2);
    if (!res2.ok) return null;
    return res2.json();
  } catch {
    return null;
  }
}

export default function ZipMap({ lat, lng, zip, stateCode, congressionalDistrict, county, city, stateName }: ZipMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  // Tap-to-interact (UI-SPEC §10 / RISKS §2.3) — only relevant at base (<lg).
  const [interacted, setInteracted] = useState(false);

  const handleInteract = () => {
    setInteracted(true);
    const map = mapInstance.current;
    if (!map) return;
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
      center: [lat, lng],
      zoom: 10,
      zoomControl: false,
      attributionControl: false,
      dragging: isLg,
      scrollWheelZoom: false,
    });

    // Dark tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);

    // Green marker
    const markerIcon = L.divIcon({
      className: '',
      html: `<div style="
        width: 12px; height: 12px; border-radius: 50%;
        background: #00FF41; border: 2px solid #000;
        box-shadow: 0 0 10px rgba(0,255,65,0.6);
      "></div>`,
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    });

    // Pulse
    const pulseIcon = L.divIcon({
      className: '',
      html: `<div style="
        width: 36px; height: 36px; border-radius: 50%;
        border: 1px solid rgba(0,255,65,0.3);
        animation: mapPulse 2s ease-out infinite;
        position: relative; top: -12px; left: -12px;
      "></div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });

    L.marker([lat, lng], { icon: pulseIcon }).addTo(map);
    L.marker([lat, lng], { icon: markerIcon }).addTo(map)
      .bindPopup(`
        <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:#00FF41;background:#000;padding:8px;border:1px solid rgba(0,255,65,0.2);min-width:130px;">
          <div style="font-weight:700;margin-bottom:3px;">ZIP ${zip}</div>
          ${city ? `<div style="color:#6b8a6b">City: ${city}</div>` : ''}
          ${county ? `<div style="color:#6b8a6b">County: ${county}</div>` : ''}
          ${congressionalDistrict ? `<div style="color:#6b8a6b">CD: ${stateCode || ''}-${congressionalDistrict}</div>` : ''}
        </div>
      `, { className: 'zip-popup', closeButton: false })
      .openPopup();

    mapInstance.current = map;

    // Fetch and draw congressional district boundary
    if (stateCode && congressionalDistrict) {
      const fips = STATE_FIPS[stateCode];
      if (fips) {
        fetchDistrictGeoJSON(fips, congressionalDistrict).then(geojson => {
          if (!geojson || !geojson.features?.length || !mapInstance.current) return;

          const districtLayer = L.geoJSON(geojson, {
            style: {
              color: '#00FF41',
              weight: 2,
              opacity: 0.8,
              fillColor: '#00FF41',
              fillOpacity: 0.1,
              dashArray: undefined,
            },
          }).addTo(mapInstance.current);

          // Fit map to district bounds with padding
          const bounds = districtLayer.getBounds();
          if (bounds.isValid()) {
            mapInstance.current.fitBounds(bounds, { padding: [20, 20] });
          }
        });
      }
    }

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, [lat, lng, zip, stateCode, congressionalDistrict, county, city, stateName]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <div ref={mapRef} style={{ position: 'absolute', inset: 0, background: '#000' }} />
      {/* Tap-to-interact overlay (UI-SPEC §10 / RISKS §2.3).
          Visible only at base (<lg) and only until first tap. */}
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
      <style>{`
        @keyframes mapPulse {
          0% { transform: scale(0.5); opacity: 0.8; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        .leaflet-popup-content-wrapper {
          background: transparent !important;
          box-shadow: none !important;
          border-radius: 0 !important;
          padding: 0 !important;
        }
        .leaflet-popup-content { margin: 0 !important; }
        .leaflet-popup-tip { background: rgba(0,255,65,0.2) !important; }
        .leaflet-control-zoom a {
          background: #0a0f0a !important;
          color: #00FF41 !important;
          border-color: rgba(0,255,65,0.15) !important;
          font-size: 14px !important;
        }
        .leaflet-control-zoom a:hover { background: rgba(0,255,65,0.1) !important; }
      `}</style>
    </div>
  );
}
