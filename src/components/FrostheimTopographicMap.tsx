import React, { useEffect, useRef, useState } from 'react';
import { FROSTHEIM_LANDMARKS } from '../content/eidrathContent';
import { FROZEN_LAKE_Y, getRoadMask, getTerrainHeight, getTerrainNormal } from '../game/world/frostheimTerrain';

interface FrostheimTopographicMapProps {
  playerX: number;
  playerZ: number;
  playerYaw?: number;
  discoveredLandmarks: string[];
  onFastTravel: (landmarkId: string) => void;
}

export const FrostheimTopographicMap: React.FC<FrostheimTopographicMapProps> = ({
  playerX,
  playerZ,
  playerYaw = 0,
  discoveredLandmarks,
  onFastTravel,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const terrainImgRef = useRef<HTMLCanvasElement | null>(null);
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [waypoint, setWaypoint] = useState<{ x: number; z: number } | null>(null);
  const dragRef = useRef<{ active: boolean; sx: number; sy: number; px: number; py: number }>({
    active: false,
    sx: 0,
    sy: 0,
    px: 0,
    py: 0,
  });

  // Pre-render hillshaded topographic relief once from real getTerrainHeight / getRoadMask!
  useEffect(() => {
    const off = document.createElement('canvas');
    off.width = 256;
    off.height = 256;
    const ctx = off.getContext('2d');
    if (!ctx) return;

    const img = ctx.createImageData(256, 256);
    const data = img.data;
    const half = 250;

    for (let py = 0; py < 256; py++) {
      const wz = (py / 255) * 500 - half;
      for (let px = 0; px < 256; px++) {
        const wx = (px / 255) * 500 - half;
        const h = getTerrainHeight(wx, wz);
        const n = getTerrainNormal(wx, wz);
        const road = getRoadMask(wx, wz);

        // Directional NW hillshade illumination
        const shade = Math.max(0.28, Math.min(1.22, 0.72 + (-n.x * 0.65 - n.z * 0.65 + n.y * 0.35) * 0.55));

        let r = 38;
        let g = 46;
        let b = 54;
        if (h <= FROZEN_LAKE_Y + 0.08 && Math.hypot(wx - 96, wz + 58) < 35) {
          r = 56;
          g = 96;
          b = 122;
        } else if (road > 0.25) {
          r = 84;
          g = 73;
          b = 58;
        } else if (h > 14) {
          r = 124;
          g = 132;
          b = 140;
        } else {
          const elevT = Math.max(0, Math.min(1, (h + 1) / 18));
          r = 44 + elevT * 52;
          g = 52 + elevT * 52;
          b = 60 + elevT * 54;
        }

        // Contour rings every 4m of elevation
        const contour = Math.abs((h % 4) - 2) > 1.88 ? 0.82 : 1.0;

        const idx = (py * 256 + px) * 4;
        data[idx] = Math.min(255, r * shade * contour);
        data[idx + 1] = Math.min(255, g * shade * contour);
        data[idx + 2] = Math.min(255, b * shade * contour);
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    terrainImgRef.current = off;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const baseMap = terrainImgRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0c1015';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(W / 2 + pan.x, H / 2 + pan.y);
    ctx.scale(zoom, zoom);

    if (baseMap) {
      ctx.drawImage(baseMap, -W / 2, -H / 2, W, H);
    }

    const toPx = (wx: number, wz: number): [number, number] => [
      (wx / 500) * W,
      (wz / 500) * H,
    ];

    // Subtle cartographic grid lines & border
    ctx.strokeStyle = 'rgba(184, 149, 82, 0.14)';
    ctx.lineWidth = 1 / zoom;
    for (let g = -200; g <= 200; g += 100) {
      const [gx] = toPx(g, 0);
      const [, gz] = toPx(0, g);
      ctx.beginPath();
      ctx.moveTo(gx, -H / 2);
      ctx.lineTo(gx, H / 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-W / 2, gz);
      ctx.lineTo(W / 2, gz);
      ctx.stroke();
    }

    // Fog-of-war darkening over distant undiscovered edges while highlighting discovered radius
    for (const lm of FROSTHEIM_LANDMARKS) {
      const discovered = discoveredLandmarks.includes(lm.id);
      const [lx, lz] = toPx(lm.x, lm.z);

      ctx.beginPath();
      ctx.arc(lx, lz, discovered ? 7 : 5, 0, Math.PI * 2);
      ctx.fillStyle = discovered ? '#dfc38a' : '#4a5562';
      ctx.fill();
      ctx.lineWidth = 1.5 / zoom;
      ctx.strokeStyle = discovered ? '#131820' : '#8e9ba8';
      ctx.stroke();

      ctx.font = `${Math.max(9, Math.round(11 / zoom))}px Cinzel, Georgia, serif`;
      ctx.fillStyle = discovered ? '#efe4c8' : 'rgba(217, 209, 190, 0.45)';
      ctx.textAlign = 'center';
      ctx.fillText(discovered ? lm.name : 'Undiscovered', lx, lz - 11 / zoom);
    }

    // Optional player custom waypoint marker
    if (waypoint) {
      const [wx, wz] = toPx(waypoint.x, waypoint.z);
      ctx.strokeStyle = '#7fa8c4';
      ctx.lineWidth = 2 / zoom;
      ctx.beginPath();
      ctx.arc(wx, wz, 7 / zoom, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Kaelen live position & heading arrow
    const [px, pz] = toPx(playerX, playerZ);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(playerYaw);
    ctx.fillStyle = '#d45a52';
    ctx.strokeStyle = '#f5eed8';
    ctx.lineWidth = 1.5 / zoom;
    ctx.beginPath();
    ctx.moveTo(0, 8 / zoom);
    ctx.lineTo(5 / zoom, -6 / zoom);
    ctx.lineTo(0, -3 / zoom);
    ctx.lineTo(-5 / zoom, -6 / zoom);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }, [zoom, pan, playerX, playerZ, playerYaw, discoveredLandmarks, waypoint]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const cy = ((e.clientY - rect.top) / rect.height) * canvas.height;
    const wx = ((cx - canvas.width / 2 - pan.x) / zoom / canvas.width) * 500;
    const wz = ((cy - canvas.height / 2 - pan.y) / zoom / canvas.height) * 500;

    // Click near a discovered landmark to fast travel; otherwise drop custom map pin
    const hitLm = FROSTHEIM_LANDMARKS.find(
      (lm) => discoveredLandmarks.includes(lm.id) && Math.hypot(lm.x - wx, lm.z - wz) < 20,
    );
    if (hitLm) {
      onFastTravel(hitLm.id);
    } else {
      setWaypoint({ x: Math.round(wx), z: Math.round(wz) });
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-[#dfc38a] uppercase tracking-wider font-display">
          Topographic Survey of Frostheim
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.85, Number((z - 0.25).toFixed(2))))}
            className="eid-btn-ghost px-2 py-0.5 text-[11px]"
          >
            - Zoom
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2.6, Number((z + 0.25).toFixed(2))))}
            className="eid-btn-ghost px-2 py-0.5 text-[11px]"
          >
            + Zoom
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1.0);
              setPan({ x: 0, y: 0 });
            }}
            className="eid-btn-ghost px-2 py-0.5 text-[11px]"
          >
            Reset
          </button>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        width={680}
        height={400}
        onClick={handleCanvasClick}
        onMouseDown={(e) => {
          dragRef.current = { active: true, sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y };
        }}
        onMouseMove={(e) => {
          if (!dragRef.current.active) return;
          setPan({
            x: dragRef.current.px + (e.clientX - dragRef.current.sx),
            y: dragRef.current.py + (e.clientY - dragRef.current.sy),
          });
        }}
        onMouseUp={() => {
          dragRef.current.active = false;
        }}
        onMouseLeave={() => {
          dragRef.current.active = false;
        }}
        className="w-full h-72 sm:h-80 border border-[#b89552]/35 bg-[#0c1015] cursor-crosshair"
      />
      <div className="flex flex-wrap items-center justify-between text-[11px] text-[#e4dcc8]/70">
        <span>Drag to pan · Click a gilded landmark to fast travel · Click anywhere to drop waypoint</span>
        <span className="font-mono-num text-[#7fa8c4]">
          Position: ({Math.round(playerX)}, {Math.round(playerZ)})
          {waypoint ? ` · Pin: (${waypoint.x}, ${waypoint.z})` : ''}
        </span>
      </div>
    </div>
  );
};

