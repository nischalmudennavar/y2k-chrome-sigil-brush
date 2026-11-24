import { RefImageState, Stroke, SymmetryMode, ToolMode, ViewTransform } from '../../types';
import { getSymmetryTransforms } from '../../core/geometry';

export interface GuideOverlayParams {
  el: SVGSVGElement | null;
  view: ViewTransform;
  symmetry: SymmetryMode;
  guideColor: string;
  mode3d: boolean;
  toolMode: ToolMode;
  eraserSize: number;
  eraserCursor: { x: number; y: number; visible: boolean };
  selectedStrokeIndex: number | null;
  strokes: Stroke[];
}

export function drawGuideOverlay({
  el,
  view,
  symmetry,
  guideColor,
  mode3d,
  toolMode,
  eraserSize,
  eraserCursor,
  selectedStrokeIndex,
  strokes,
}: GuideOverlayParams) {
  if (!el) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  let s = '';
  const L = (a: number, b: number, c: number, d: number) =>
    `<line x1='${a}' y1='${b}' x2='${c}' y2='${d}'/>`;

  if (symmetry === 'Mirror X' || symmetry === 'Mirror X+Y') s += L(w / 2, -10000, w / 2, 10000);
  if (symmetry === 'Mirror Y' || symmetry === 'Mirror X+Y') s += L(-10000, h / 2, 10000, h / 2);
  if (symmetry.startsWith('Radial')) {
    const n = parseInt(symmetry.split(' ')[1], 10) || 4;
    for (let i = 0; i < n; i++) {
      const a = (i * 2 * Math.PI) / n - Math.PI / 2;
      s += L(w / 2, h / 2, w / 2 + Math.cos(a) * 90, h / 2 + Math.sin(a) * 90);
    }
  }

  let selectionMarkup = '';
  if (selectedStrokeIndex !== null && selectedStrokeIndex !== undefined && !mode3d && strokes) {
    const selStroke = strokes[selectedStrokeIndex];
    if (selStroke) {
      const pts = selStroke.pts && selStroke.pts.length > 0 ? selStroke.pts : selStroke.raw || [];
      if (pts.length > 0) {
        const sym = selStroke.symmetry || 'None';
        const transforms = getSymmetryTransforms(sym, w, h);
        const baseW = Math.max(6, selStroke.params?.width || 20);

        let branchPaths = '';
        let anchorCircles = '';
        let badgeX = 0;
        let badgeY = 0;
        let hasBadge = false;

        transforms.forEach((T, tIdx) => {
          const transformed = pts.map((p) => T.f(p.x, p.y));
          if (transformed.length === 1) {
            const [x, y] = transformed[0];
            anchorCircles += `<circle cx='${x.toFixed(1)}' cy='${y.toFixed(1)}' r='${(baseW / 2 + 4).toFixed(1)}' fill='none' stroke='#00f0ff' stroke-width='2.5' stroke-dasharray='4 3'/>`;
          } else {
            let d = `M ${transformed[0][0].toFixed(1)} ${transformed[0][1].toFixed(1)}`;
            for (let i = 1; i < transformed.length; i++) {
              d += ` L ${transformed[i][0].toFixed(1)} ${transformed[i][1].toFixed(1)}`;
            }
            branchPaths += `<path d='${d}' fill='none' stroke='#00f0ff' stroke-width='${(baseW + 14).toFixed(1)}' stroke-linecap='round' stroke-linejoin='round' opacity='0.25'/>`;
            branchPaths += `<path d='${d}' fill='none' stroke='#38bdf8' stroke-width='3.5' stroke-dasharray='8 4' stroke-linecap='round' stroke-linejoin='round' class='selected-stroke-glow' opacity='0.95'/>`;

            const pStart = transformed[0];
            const pEnd = transformed[transformed.length - 1];

            if (tIdx === 0) {
              anchorCircles += `
                <g class='stroke-endpoint-handle handle-start' transform='translate(${pStart[0].toFixed(1)}, ${pStart[1].toFixed(1)})'>
                  <circle r='13' fill='rgba(56, 189, 248, 0.22)' stroke='#38bdf8' stroke-width='1.5' stroke-dasharray='3 2' class='handle-outer-ring'/>
                  <circle r='5' fill='#38bdf8' stroke='#ffffff' stroke-width='1.5'/>
                  <g transform='translate(0, -18)'>
                    <rect x='-24' y='-8' width='48' height='16' rx='3' fill='rgba(15, 23, 42, 0.94)' stroke='#38bdf8' stroke-width='1' filter='drop-shadow(0 2px 4px rgba(0,0,0,0.8))'/>
                    <text x='0' y='3.5' fill='#e0f2fe' font-family='Michroma, sans-serif' font-size='7.5' font-weight='700' text-anchor='middle'>START</text>
                  </g>
                </g>
                <g class='stroke-endpoint-handle handle-end' transform='translate(${pEnd[0].toFixed(1)}, ${pEnd[1].toFixed(1)})'>
                  <circle r='13' fill='rgba(244, 63, 94, 0.22)' stroke='#f43f5e' stroke-width='1.5' stroke-dasharray='3 2' class='handle-outer-ring'/>
                  <circle r='5' fill='#f43f5e' stroke='#ffffff' stroke-width='1.5'/>
                  <g transform='translate(0, -18)'>
                    <rect x='-20' y='-8' width='40' height='16' rx='3' fill='rgba(15, 23, 42, 0.94)' stroke='#f43f5e' stroke-width='1' filter='drop-shadow(0 2px 4px rgba(0,0,0,0.8))'/>
                    <text x='0' y='3.5' fill='#ffe4e6' font-family='Michroma, sans-serif' font-size='7.5' font-weight='700' text-anchor='middle'>END</text>
                  </g>
                </g>
              `;

              const mid = transformed[Math.floor(transformed.length / 2)];
              badgeX = mid[0];
              badgeY = mid[1] - (baseW / 2 + 22);
              hasBadge = true;
            } else {
              anchorCircles += `<circle cx='${pStart[0].toFixed(1)}' cy='${pStart[1].toFixed(1)}' r='4' fill='#38bdf8' stroke='#ffffff' stroke-width='1.5' opacity='0.75'/>`;
              anchorCircles += `<circle cx='${pEnd[0].toFixed(1)}' cy='${pEnd[1].toFixed(1)}' r='4' fill='#f43f5e' stroke='#ffffff' stroke-width='1.5' opacity='0.75'/>`;
            }
          }
        });

        let badgeMarkup = '';
        if (hasBadge) {
          badgeMarkup = `
            <g transform='translate(${badgeX.toFixed(1)}, ${badgeY.toFixed(1)})'>
              <rect x='-50' y='-13' width='100' height='24' rx='5' fill='rgba(7, 16, 30, 0.94)' stroke='#00f0ff' stroke-width='1.5' filter='drop-shadow(0 2px 8px rgba(0,0,0,0.85))'/>
              <text x='0' y='3.5' fill='#e0f2fe' font-family='Michroma, sans-serif' font-size='9' font-weight='700' text-anchor='middle' letter-spacing='0.6'>STROKE #${selectedStrokeIndex + 1}</text>
            </g>
          `;
        }

        selectionMarkup = `<g class='selected-stroke-highlight'>${branchPaths}${anchorCircles}${badgeMarkup}</g>`;
      }
    }
  }

  let eraserCircle = '';
  if (toolMode === 'eraser' && eraserCursor.visible && !mode3d) {
    const r = eraserSize / 2;
    eraserCircle = `<circle cx='${eraserCursor.x}' cy='${eraserCursor.y}' r='${r}' fill='rgba(255, 75, 110, 0.22)' stroke='#ff4d79' stroke-width='1.5' stroke-dasharray='3 3'/>`;
  }

  el.innerHTML = `<g transform="translate(${view.x}, ${view.y}) scale(${view.scale})"><g stroke='${guideColor}' stroke-dasharray='4 6'>${s}</g>${selectionMarkup}${eraserCircle}</g>`;
  el.style.display = mode3d ? 'none' : '';
}

export function updateRefImageTransform(
  el: HTMLImageElement | null,
  refState: RefImageState,
  view: ViewTransform
) {
  if (!el || !refState.src) return;
  const sx = view.x + refState.x * view.scale;
  const sy = view.y + refState.y * view.scale;
  const sc = view.scale * refState.scale;
  el.style.transform = `translate(${sx}px, ${sy}px) scale(${sc})`;
  el.style.opacity = refState.visible ? String(refState.opacity) : '0';
  el.style.mixBlendMode = refState.blend;
  el.style.display = refState.visible ? 'block' : 'none';
}
