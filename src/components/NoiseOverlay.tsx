import React, { useEffect, useRef } from 'react';
import {
  DEFAULT_ANALOG_SETTINGS,
  generateGrainTile,
  drawSpeck,
  drawHair,
} from '../core/analogNoise';

interface NoiseOverlayProps {
  intensity: number;
}

export const NoiseOverlay: React.FC<NoiseOverlayProps> = ({ intensity }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const grainRef = useRef<HTMLDivElement>(null);
  const dustCanvasRef = useRef<HTMLCanvasElement>(null);
  const linesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const grainEl = grainRef.current;
    const dustCvs = dustCanvasRef.current;
    const linesEl = linesRef.current;
    const rootEl = rootRef.current;
    if (!grainEl || !dustCvs || !rootEl) return;

    const ctx = dustCvs.getContext('2d');
    if (!ctx) return;

    const s = { ...DEFAULT_ANALOG_SETTINGS };
    const tile = generateGrainTile(s.contrast, s.colored);
    let blobUrl = '';
    tile.toBlob((blob) => {
      if (!blob) return;
      blobUrl = URL.createObjectURL(blob);
      grainEl.style.backgroundImage = `url("${blobUrl}")`;
    });

    let last = 0;
    let roll = 0;
    let animId = 0;

    // Pre-render static dust/scratch texture tiles into memory once
    const dustTiles: HTMLCanvasElement[] = [];
    const buildDustTiles = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      dustTiles.length = 0;

      for (let f = 0; f < 3; f++) {
        const off = document.createElement('canvas');
        off.width = w;
        off.height = h;
        const offCtx = off.getContext('2d');
        if (offCtx) {
          const area = (w * h) / 400000;
          // Pre-bake specks
          const specks = Math.round(48 * area * (0.6 + Math.random() * 0.8));
          for (let i = 0; i < specks; i++) {
            const light = Math.random() < 0.3;
            drawSpeck(
              offCtx,
              Math.random() * w,
              Math.random() * h,
              0.6 + Math.random() ** 2.5 * 3.4,
              light ? '255, 250, 240' : '18, 14, 10',
              0.6 + Math.random() * 0.35
            );
          }
          // Pre-bake hairs
          const hairs = 1 + Math.floor(Math.random() * 2);
          for (let i = 0; i < hairs; i++) {
            drawHair(offCtx, w, h);
          }
          // Pre-bake vertical scratches
          const scratches = 2;
          for (let s = 0; s < scratches; s++) {
            const sx = Math.random() * w;
            const light = Math.random() < 0.7;
            const alpha = 0.25 + Math.random() * 0.35;
            offCtx.strokeStyle = light
              ? `rgba(255, 252, 245, ${alpha})`
              : `rgba(14, 11, 8, ${alpha})`;
            offCtx.lineWidth = 0.6 + Math.random() * 0.8;
            offCtx.beginPath();
            const phase = Math.random() * Math.PI * 2;
            for (let y = 0; y <= h; y += 24) {
              const x = sx + Math.sin(y * 0.012 + phase) * 1.4;
              if (y === 0) offCtx.moveTo(x, y);
              else offCtx.lineTo(x, y);
            }
            offCtx.stroke();
          }
        }
        dustTiles.push(off);
      }
    };

    const onResize = () => {
      dustCvs.width = window.innerWidth;
      dustCvs.height = window.innerHeight;
      buildDustTiles();
    };
    window.addEventListener('resize', onResize);
    onResize();

    let dustFrame = 0;
    const paintDust = (currentIntensity: number) => {
      ctx.clearRect(0, 0, dustCvs.width, dustCvs.height);
      if (currentIntensity <= 0.005 || dustTiles.length === 0) return;
      dustFrame = (dustFrame + 1) % dustTiles.length;
      ctx.globalAlpha = Math.min(1, currentIntensity * 1.2);
      ctx.drawImage(dustTiles[dustFrame], 0, 0);
    };

    const tick = (now: number) => {
      animId = requestAnimationFrame(tick);
      if (intensity <= 0.005 || document.hidden) {
        if (rootEl.style.display !== 'none') rootEl.style.display = 'none';
        return;
      }
      if (rootEl.style.display === 'none') {
        rootEl.style.display = 'block';
      }

      const rate = s.fps;
      if (rate > 0 && now - last >= 1000 / rate) {
        last = now;
        const span = 128 * s.size;
        grainEl.style.backgroundPosition = `${(Math.random() * span).toFixed(1)}px ${(Math.random() * span).toFixed(1)}px`;
        grainEl.style.opacity = String(intensity * (1 - s.flicker * Math.random() * 0.7));

        if (linesEl) {
          roll = (roll + 1) % 3;
          linesEl.style.backgroundPosition = `0 ${roll}px`;
          linesEl.style.opacity = String(intensity * 0.5);
        }

        paintDust(intensity);
      }
    };

    animId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [intensity]);

  return (
    <div ref={rootRef} className="noise" aria-hidden="true">
      <div ref={grainRef} className="noise__grain" />
      <canvas ref={dustCanvasRef} className="noise__dust" />
      <div ref={linesRef} className="noise__lines" />
    </div>
  );
};
