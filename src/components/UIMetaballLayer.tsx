import React, { useEffect, useRef } from 'react';

const MERGE_THRESHOLD_PX = 96;

function rectGap(a: DOMRect, b: DOMRect): {
  gap: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
} {
  const ax = Math.max(a.left, Math.min(a.right, (b.left + b.right) / 2));
  const ay = Math.max(a.top, Math.min(a.bottom, (b.top + b.bottom) / 2));
  const bx = Math.max(b.left, Math.min(b.right, ax));
  const by = Math.max(b.top, Math.min(b.bottom, ay));
  const gap = Math.hypot(ax - bx, ay - by);
  return { gap, ax, ay, bx, by };
}

export const UIMetaballLayer: React.FC = () => {
  const svgRef = useRef<SVGSVGElement>(null);
  const dockRectRef = useRef<SVGRectElement>(null);
  const targetRectRef = useRef<SVGRectElement>(null);
  const bridgeRef = useRef<SVGEllipseElement>(null);
  const glowBridgeRef = useRef<SVGEllipseElement>(null);

  useEffect(() => {
    let rafId = 0;

    const update = () => {
      rafId = requestAnimationFrame(update);
      const svg = svgRef.current;
      const dock = document.querySelector('.global-tools-dock') as HTMLElement | null;
      if (!svg || !dock) {
        if (svg) svg.style.opacity = '0';
        return;
      }

      const dockBox = dock.getBoundingClientRect();
      const candidates = [
        document.getElementById('panel'),
        document.getElementById('timeline-deck'),
      ].filter((el): el is HTMLElement => !!el);

      let bestTarget: DOMRect | null = null;
      let bestInfo = { gap: Infinity, ax: 0, ay: 0, bx: 0, by: 0 };

      for (const el of candidates) {
        const box = el.getBoundingClientRect();
        const info = rectGap(dockBox, box);
        if (info.gap < bestInfo.gap) {
          bestInfo = info;
          bestTarget = box;
        }
      }

      if (!bestTarget || bestInfo.gap >= MERGE_THRESHOLD_PX) {
        svg.style.opacity = '0';
        dock.classList.remove('is-metaball-merged');
        return;
      }

      const t = Math.max(0, Math.min(1, 1 - bestInfo.gap / MERGE_THRESHOLD_PX));
      svg.style.opacity = String(Math.min(1, t * 1.4));
      const isMerged = bestInfo.gap < 48;
      dock.classList.toggle('is-metaball-merged', isMerged);

      const dRect = dockRectRef.current;
      const tRect = targetRectRef.current;
      const bridge = bridgeRef.current;
      const glowBridge = glowBridgeRef.current;

      // Slight inset compensates for goo blur expansion so silhouette hugs panel edges cleanly
      const inset = 5;
      if (dRect) {
        dRect.setAttribute('x', String(dockBox.left + inset));
        dRect.setAttribute('y', String(dockBox.top + inset));
        dRect.setAttribute('width', String(Math.max(10, dockBox.width - inset * 2)));
        dRect.setAttribute('height', String(Math.max(10, dockBox.height - inset * 2)));
      }

      if (tRect) {
        tRect.setAttribute('x', String(bestTarget.left + inset));
        tRect.setAttribute('y', String(bestTarget.top + inset));
        tRect.setAttribute('width', String(Math.max(10, bestTarget.width - inset * 2)));
        tRect.setAttribute('height', String(Math.max(10, bestTarget.height - inset * 2)));
      }

      const mx = (bestInfo.ax + bestInfo.bx) / 2;
      const my = (bestInfo.ay + bestInfo.by) / 2;
      const angle = (Math.atan2(bestInfo.by - bestInfo.ay, bestInfo.bx - bestInfo.ax) * 180) / Math.PI;
      const rx = Math.max(18, bestInfo.gap * 0.55 + 26 * t);
      const ry = Math.max(16, 30 * Math.pow(t, 0.75));

      if (bridge) {
        bridge.setAttribute('cx', String(mx));
        bridge.setAttribute('cy', String(my));
        bridge.setAttribute('rx', String(rx));
        bridge.setAttribute('ry', String(ry));
        bridge.setAttribute('transform', `rotate(${angle} ${mx} ${my})`);
      }

      if (glowBridge) {
        glowBridge.setAttribute('cx', String(mx));
        glowBridge.setAttribute('cy', String(my));
        glowBridge.setAttribute('rx', String(rx * 1.15));
        glowBridge.setAttribute('ry', String(ry * 0.65));
        glowBridge.setAttribute('transform', `rotate(${angle} ${mx} ${my})`);
      }
    };

    rafId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <svg ref={svgRef} className="ui-metaball-layer" aria-hidden="true">
      <defs>
        <filter id="y2k-ui-metaball" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="blur" />
          <feColorMatrix
            in="blur"
            mode="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 28 -14"
            result="goo"
          />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
        <linearGradient id="y2k-mercury-fill" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#262e3d" />
          <stop offset="48%" stopColor="#161b24" />
          <stop offset="100%" stopColor="#0d1017" />
        </linearGradient>
      </defs>
      <g filter="url(#y2k-ui-metaball)">
        <rect ref={targetRectRef} rx="14" ry="14" fill="url(#y2k-mercury-fill)" />
        <rect ref={dockRectRef} rx="12" ry="12" fill="url(#y2k-mercury-fill)" />
        <ellipse ref={bridgeRef} fill="url(#y2k-mercury-fill)" />
      </g>
      <ellipse ref={glowBridgeRef} className="ui-metaball-specular" />
    </svg>
  );
};
