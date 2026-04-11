'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface ZipMapProps {
  lat: number;
  lng: number;
  zip: string;
  county?: string | null;
  city?: string | null;
  stateName?: string;
}

export default function ZipMap({ lat, lng, zip, county, city, stateName }: ZipMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current, {
      center: [lat, lng],
      zoom: 11,
      zoomControl: false,
      attributionControl: false,
    });

    // Dark map tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
    }).addTo(map);

    // Zoom control on right
    L.control.zoom({ position: 'topright' }).addTo(map);

    // Custom green marker
    const icon = L.divIcon({
      className: '',
      html: `<div style="
        width: 14px; height: 14px; border-radius: 50%;
        background: #00FF41; border: 2px solid #000;
        box-shadow: 0 0 12px rgba(0,255,65,0.6), 0 0 24px rgba(0,255,65,0.3);
      "></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });

    // Pulse ring
    const pulseIcon = L.divIcon({
      className: '',
      html: `<div style="
        width: 40px; height: 40px; border-radius: 50%;
        border: 1px solid rgba(0,255,65,0.3);
        animation: mapPulse 2s ease-out infinite;
        position: relative; top: -13px; left: -13px;
      "></div>
      <style>
        @keyframes mapPulse {
          0% { transform: scale(0.5); opacity: 0.8; }
          100% { transform: scale(2); opacity: 0; }
        }
      </style>`,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
    });

    L.marker([lat, lng], { icon: pulseIcon }).addTo(map);
    L.marker([lat, lng], { icon }).addTo(map)
      .bindPopup(`
        <div style="font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #00FF41; background: #000; padding: 8px; border: 1px solid rgba(0,255,65,0.2); min-width: 140px;">
          <div style="font-weight: 700; margin-bottom: 4px;">ZIP ${zip}</div>
          ${city ? `<div style="color: #6b8a6b;">City: ${city}</div>` : ''}
          ${county ? `<div style="color: #6b8a6b;">County: ${county}</div>` : ''}
          ${stateName ? `<div style="color: #6b8a6b;">State: ${stateName}</div>` : ''}
        </div>
      `, {
        className: 'zip-popup',
        closeButton: false,
      })
      .openPopup();

    // Circle to show approximate ZIP area
    L.circle([lat, lng], {
      radius: 5000, // ~5km radius
      color: '#00FF41',
      fillColor: '#00FF41',
      fillOpacity: 0.06,
      weight: 1,
      opacity: 0.3,
    }).addTo(map);

    mapInstance.current = map;

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, [lat, lng, zip, county, city, stateName]);

  // Update map when coords change
  useEffect(() => {
    if (mapInstance.current) {
      mapInstance.current.setView([lat, lng], 11);
    }
  }, [lat, lng]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '300px' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%', background: '#000' }} />

      {/* Override Leaflet popup styles for dark theme */}
      <style>{`
        .leaflet-popup-content-wrapper {
          background: transparent !important;
          box-shadow: none !important;
          border-radius: 0 !important;
          padding: 0 !important;
        }
        .leaflet-popup-content {
          margin: 0 !important;
        }
        .leaflet-popup-tip {
          background: rgba(0,255,65,0.2) !important;
        }
        .leaflet-control-zoom a {
          background: #0a0f0a !important;
          color: #00FF41 !important;
          border-color: rgba(0,255,65,0.15) !important;
        }
        .leaflet-control-zoom a:hover {
          background: rgba(0,255,65,0.1) !important;
        }
      `}</style>
    </div>
  );
}
