import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  BrushParams,
  EraserMode,
  Point,
  RefImageState,
  Stroke,
  SymmetryMode,
  ToolMode,
  ViewTransform,
} from '../types';
import { RenderPipeline } from '../core/renderPipeline';
import { eraseAtSegment } from '../core/eraser';
import {
  buildStrokeMesh,
  buildStrokeParts,
  findClosestStroke,
  getSymmetryTransforms,
  pressureFactor,
  resample,
  smooth,
} from '../core/geometry';

interface CanvasStageProps {
  pipelineRef: React.MutableRefObject<RenderPipeline | null>;
  strokesRef: React.MutableRefObject<Stroke[]>;
  params: BrushParams;
  symmetry: SymmetryMode;
  guideColor?: string;
  view: ViewTransform;
  onViewChange: (view: ViewTransform) => void;
  refState: RefImageState;
  mode3d: boolean;
  panMode: boolean;
  animOn: boolean;
  autoOrbit: boolean;
  glowEnabled?: boolean;
  aberrationEnabled?: boolean;
  toolMode?: ToolMode;
  eraserSize?: number;
  eraserMode?: EraserMode;
  selectedStrokeIndex?: number | null;
  onSelectStroke?: (index: number | null) => void;
  onStrokeAdded?: (stroke: Stroke) => void;
  onStrokeTransformed?: (strokeIndex: number, oldStroke: Stroke, newStroke: Stroke) => void;
  onErasePerformed?: (removed: Stroke[], added: Stroke[]) => void;
}

export const CanvasStage: React.FC<CanvasStageProps> = ({
  pipelineRef,
  strokesRef,
  params,
  symmetry,
  guideColor = 'rgba(127,182,255,.4)',
  view,
  onViewChange,
  refState,
  mode3d,
  panMode,
  animOn,
  autoOrbit,
  glowEnabled = true,
  aberrationEnabled = true,
  toolMode = 'brush',
  eraserSize = 28,
  eraserMode = 'slice',
  selectedStrokeIndex = null,
  onSelectStroke,
  onStrokeAdded,
  onStrokeTransformed,
  onErasePerformed,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const guideRef = useRef<SVGSVGElement>(null);
  const refImgRef = useRef<HTMLImageElement>(null);

  // Mutable internal state for 60fps gesture handling
  const viewRef = useRef<ViewTransform>(view);
  viewRef.current = view;

  const paramsRef = useRef<BrushParams>(params);
  paramsRef.current = params;

  const symmetryRef = useRef<SymmetryMode>(symmetry);
  symmetryRef.current = symmetry;

  const mode3dRef = useRef(mode3d);
  mode3dRef.current = mode3d;

  const panModeRef = useRef(panMode);
  panModeRef.current = panMode;

  const glowEnabledRef = useRef(glowEnabled);
  glowEnabledRef.current = glowEnabled;

  const aberrationEnabledRef = useRef(aberrationEnabled);
  aberrationEnabledRef.current = aberrationEnabled;

  const toolModeRef = useRef<ToolMode>(toolMode);
  toolModeRef.current = toolMode;

  const eraserSizeRef = useRef<number>(eraserSize);
  eraserSizeRef.current = eraserSize;

  const eraserModeRef = useRef<EraserMode>(eraserMode);
  eraserModeRef.current = eraserMode;

  const eraserCursorRef = useRef<{ x: number; y: number; visible: boolean }>({
    x: 0,
    y: 0,
    visible: false,
  });

  const selectedStrokeIndexRef = useRef<number | null>(selectedStrokeIndex);
  selectedStrokeIndexRef.current = selectedStrokeIndex;

  const onSelectStrokeRef = useRef(onSelectStroke);
  onSelectStrokeRef.current = onSelectStroke;

  const onStrokeTransformedRef = useRef(onStrokeTransformed);
  onStrokeTransformedRef.current = onStrokeTransformed;

  const orbRef = useRef({ y: 0, p: 0, z: 1 });
  const ptrRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const timeRef = useRef(0);
  const otRef = useRef(0);

  // Helper: drop three objects for a stroke
  const dropStroke = (s: Stroke) => {
    if (!pipelineRef.current) return;
    if (s.group) {
      pipelineRef.current.root.remove(s.group);
      s.group.traverse((o: any) => {
        if (o.geometry) o.geometry.dispose();
      });
    }
    pipelineRef.current.dirty = true;
  };

  // Helper: rebuild three geometry for a stroke with in-place dynamic buffer reuse
  const rebuildStroke = (s: Stroke, isDrawing: boolean = false) => {
    if (!pipelineRef.current) return;
    s.params = s.params || paramsRef.current;
    s.symmetry = s.symmetry || symmetryRef.current;
    buildStrokeMesh(
      pipelineRef.current,
      s,
      window.innerWidth,
      window.innerHeight,
      isDrawing
    );
  };

  // Update guide SVG overlay with symmetry lines and selected stroke highlight
  const drawGuide = () => {
    const el = guideRef.current;
    if (!el) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const m = symmetryRef.current;
    let s = '';
    const L = (a: number, b: number, c: number, d: number) =>
      `<line x1='${a}' y1='${b}' x2='${c}' y2='${d}'/>`;

    if (m === 'Mirror X' || m === 'Mirror X+Y') s += L(w / 2, -10000, w / 2, 10000);
    if (m === 'Mirror Y' || m === 'Mirror X+Y') s += L(-10000, h / 2, 10000, h / 2);
    if (m.startsWith('Radial')) {
      const n = parseInt(m.split(' ')[1], 10) || 4;
      for (let i = 0; i < n; i++) {
        const a = (i * 2 * Math.PI) / n - Math.PI / 2;
        s += L(w / 2, h / 2, w / 2 + Math.cos(a) * 90, h / 2 + Math.sin(a) * 90);
      }
    }

    // Selected Stroke Cyber Highlight
    let selectionMarkup = '';
    const selIdx = selectedStrokeIndexRef.current;
    if (selIdx !== null && selIdx !== undefined && !mode3dRef.current && strokesRef.current) {
      const selStroke = strokesRef.current[selIdx];
      if (selStroke) {
        const pts = selStroke.pts && selStroke.pts.length > 0 ? selStroke.pts : selStroke.raw || [];
        if (pts.length > 0) {
          const sym = selStroke.symmetry || 'None';
          const transforms = getSymmetryTransforms(sym, w, h);
          const baseW = Math.max(6, (selStroke.params?.width || 20));

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
              // Outer wide glow aura
              branchPaths += `<path d='${d}' fill='none' stroke='#00f0ff' stroke-width='${(baseW + 14).toFixed(1)}' stroke-linecap='round' stroke-linejoin='round' opacity='0.25'/>`;
              // Inner sharp neon dashed pulse line
              branchPaths += `<path d='${d}' fill='none' stroke='#38bdf8' stroke-width='3.5' stroke-dasharray='8 4' stroke-linecap='round' stroke-linejoin='round' class='selected-stroke-glow' opacity='0.95'/>`;

              // Start, midpoint, and tip reticles
              const pStart = transformed[0];
              const pEnd = transformed[transformed.length - 1];

              if (tIdx === 0) {
                // Interactive Transform Handles for Start & End Points
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
                // Symmetric branch reticles
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
                <text x='0' y='3.5' fill='#e0f2fe' font-family='Michroma, sans-serif' font-size='9' font-weight='700' text-anchor='middle' letter-spacing='0.6'>STROKE #${selIdx + 1}</text>
              </g>
            `;
          }

          selectionMarkup = `<g class='selected-stroke-highlight'>${branchPaths}${anchorCircles}${badgeMarkup}</g>`;
        }
      }
    }

    const currentView = viewRef.current;
    let eraserCircle = '';
    if (toolModeRef.current === 'eraser' && eraserCursorRef.current.visible && !mode3dRef.current) {
      const ec = eraserCursorRef.current;
      const r = eraserSizeRef.current / 2;
      eraserCircle = `<circle cx='${ec.x}' cy='${ec.y}' r='${r}' fill='rgba(255, 75, 110, 0.22)' stroke='#ff4d79' stroke-width='1.5' stroke-dasharray='3 3'/>`;
    }
    el.innerHTML = `<g transform="translate(${currentView.x}, ${currentView.y}) scale(${currentView.scale})"><g stroke='${guideColor}' stroke-dasharray='4 6'>${s}</g>${selectionMarkup}${eraserCircle}</g>`;
    el.style.display = mode3dRef.current ? 'none' : '';
  };

  // Update Reference Image Transform
  const updateRefTransform = () => {
    const el = refImgRef.current;
    if (!el || !refState.src) return;
    const currentView = viewRef.current;
    const sx = currentView.x + refState.x * currentView.scale;
    const sy = currentView.y + refState.y * currentView.scale;
    const sc = currentView.scale * refState.scale;
    el.style.transform = `translate(${sx}px, ${sy}px) scale(${sc})`;
    el.style.opacity = refState.visible ? String(refState.opacity) : '0';
    el.style.mixBlendMode = refState.blend;
    el.style.display = refState.visible ? 'block' : 'none';
  };

  useEffect(() => {
    drawGuide();
    updateRefTransform();
  }, [view, symmetry, guideColor, refState, mode3d, toolMode, eraserSize, selectedStrokeIndex, params]);

  // Main canvas interaction & animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const pipeline = new RenderPipeline(canvas);
    pipelineRef.current = pipeline;
    pipeline.resize(window.innerWidth, window.innerHeight);

    let cur: Stroke | null = null;
    let curStrokeDirty = false;
    let isErasing = false;
    let lastErasePos = { x: 0, y: 0 };
    let initialStrokesBeforeErase: Stroke[] = [];
    let orbDrag: { x: number; y: number } | null = null;
    let isPanning = false;
    let panStart = { x: 0, y: 0 };
    let isSpaceDown = false;
    let pointerDownPos = { x: 0, y: 0 };
    let pointerMovedDist = 0;
    let endpointDrag: {
      type: 'start' | 'end' | 'move';
      strokeIndex: number;
      origRaw: Point[];
      cumDistances: number[];
      totalLen: number;
      startCanvasPos: { x: number; y: number };
      initialSnapshot: Stroke;
    } | null = null;

    const setInteractiveMode = (_active: boolean) => {
      // Dynamic quality is handled on each animation frame via isInteracting without GPU texture churn
    };

    const activePointers = new Map<number, { x: number; y: number }>();
    let pinchStartDist = 0;
    let pinchStartScale = 1;
    let pinchCenter = { x: 0, y: 0 };
    let pinchStartPan = { x: 0, y: 0 };

    const getCanvasPos = (clientX: number, clientY: number) => {
      const v = viewRef.current;
      return {
        x: (clientX - v.x) / v.scale,
        y: (clientY - v.y) / v.scale,
      };
    };

    const zoomAt = (factor: number, cx: number, cy: number) => {
      const v = viewRef.current;
      const newScale = Math.max(0.2, Math.min(6.0, v.scale * factor));
      const ratio = newScale / v.scale;
      const nextView = {
        scale: newScale,
        x: cx - (cx - v.x) * ratio,
        y: cy - (cy - v.y) * ratio,
      };
      viewRef.current = nextView;
      pipeline.applyViewTransform(nextView);
      onViewChange(nextView);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isSpaceDown && (e.target as HTMLElement)?.tagName !== 'INPUT') {
        isSpaceDown = true;
        if (!mode3dRef.current) canvas.style.cursor = 'grab';
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        isSpaceDown = false;
        if (!mode3dRef.current && !panModeRef.current) canvas.style.cursor = 'crosshair';
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const onPointerDown = (e: PointerEvent) => {
      setInteractiveMode(true);
      canvas.setPointerCapture(e.pointerId);
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      pointerDownPos = { x: e.clientX, y: e.clientY };
      pointerMovedDist = 0;

      // 2-finger pinch
      if (activePointers.size === 2 && !mode3dRef.current) {
        if (cur) {
          strokesRef.current.pop();
          dropStroke(cur);
          cur = null;
        }
        const pts = Array.from(activePointers.values());
        pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
        pinchStartScale = viewRef.current.scale;
        pinchCenter = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        pinchStartPan = { x: viewRef.current.x, y: viewRef.current.y };
        return;
      }
      if (activePointers.size > 2) return;

      // Spacebar pan / Pan tool mode
      if (!mode3dRef.current && (isSpaceDown || panModeRef.current || e.button === 1)) {
        isPanning = true;
        panStart = { x: e.clientX - viewRef.current.x, y: e.clientY - viewRef.current.y };
        canvas.style.cursor = 'grabbing';
        return;
      }

      if (mode3dRef.current) {
        orbDrag = { x: e.clientX, y: e.clientY };
        return;
      }

      // Check if clicking on start or end handle of the selected stroke
      const selIdx = selectedStrokeIndexRef.current;
      if (selIdx !== null && selIdx !== undefined && !mode3dRef.current && strokesRef.current[selIdx]) {
        const targetStroke = strokesRef.current[selIdx];
        const raw = targetStroke.raw;
        if (raw && raw.length >= 2) {
          const clickPos = getCanvasPos(e.clientX, e.clientY);
          const pStart = raw[0];
          const pEnd = raw[raw.length - 1];
          const handleGrabRadius = 26 / viewRef.current.scale;
          const dStart = Math.hypot(clickPos.x - pStart.x, clickPos.y - pStart.y);
          const dEnd = Math.hypot(clickPos.x - pEnd.x, clickPos.y - pEnd.y);

          if (dStart <= handleGrabRadius || dEnd <= handleGrabRadius) {
            const dragType: 'start' | 'end' = dStart <= dEnd ? 'start' : 'end';
            const cumDistances = [0];
            for (let i = 1; i < raw.length; i++) {
              cumDistances.push(cumDistances[i - 1] + Math.hypot(raw[i].x - raw[i - 1].x, raw[i].y - raw[i - 1].y));
            }
            const totalLen = cumDistances[cumDistances.length - 1] || 1;
            const origRaw = raw.map((p) => ({ ...p }));
            const initialSnapshot: Stroke = {
              ...targetStroke,
              raw: origRaw,
              params: { ...targetStroke.params },
            };

            endpointDrag = {
              type: dragType,
              strokeIndex: selIdx,
              origRaw,
              cumDistances,
              totalLen,
              startCanvasPos: clickPos,
              initialSnapshot,
            };
            canvas.style.cursor = 'crosshair';
            return;
          }
        }
      }

      // In select mode: check if clicking on the selected stroke body to translate it
      if (toolModeRef.current === 'select') {
        if (selIdx !== null && selIdx !== undefined && strokesRef.current[selIdx]) {
          const clickPos = getCanvasPos(e.clientX, e.clientY);
          const hit = findClosestStroke(
            [strokesRef.current[selIdx]],
            clickPos.x,
            clickPos.y,
            window.innerWidth,
            window.innerHeight,
            24 / viewRef.current.scale
          );
          if (hit) {
            const targetStroke = strokesRef.current[selIdx];
            const origRaw = targetStroke.raw.map((p) => ({ ...p }));
            const initialSnapshot: Stroke = {
              ...targetStroke,
              raw: origRaw,
              params: { ...targetStroke.params },
            };
            endpointDrag = {
              type: 'move',
              strokeIndex: selIdx,
              origRaw,
              cumDistances: [],
              totalLen: 1,
              startCanvasPos: clickPos,
              initialSnapshot,
            };
            canvas.style.cursor = 'move';
            return;
          }
        }
        return;
      }

      const p0 = getCanvasPos(e.clientX, e.clientY);

      if (toolModeRef.current === 'eraser') {
        isErasing = true;
        lastErasePos = p0;
        initialStrokesBeforeErase = [...strokesRef.current];
        eraseAtSegment(
          strokesRef.current,
          p0,
          p0,
          eraserSizeRef.current / 2,
          eraserModeRef.current,
          window.innerWidth,
          window.innerHeight,
          pipeline
        );
        return;
      }

      cur = {
        raw: [{ x: p0.x, y: p0.y, p: e.pressure }],
        group: null,
        params: { ...paramsRef.current },
        symmetry: symmetryRef.current,
      };
      strokesRef.current.push(cur);
      rebuildStroke(cur);
    };

    const onPointerMove = (e: PointerEvent) => {
      ptrRef.current.tx = (e.clientX / window.innerWidth) * 2 - 1;
      ptrRef.current.ty = 1 - (e.clientY / window.innerHeight) * 2;

      if (activePointers.has(e.pointerId)) {
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      // Pinch zoom
      if (activePointers.size === 2 && !mode3dRef.current) {
        const pts = Array.from(activePointers.values());
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
        const currentCenter = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        const targetScale = Math.max(
          0.2,
          Math.min(6.0, pinchStartScale * (dist / pinchStartDist))
        );
        const ratio = targetScale / pinchStartScale;
        const nextView = {
          scale: targetScale,
          x: currentCenter.x - (pinchCenter.x - pinchStartPan.x) * ratio,
          y: currentCenter.y - (pinchCenter.y - pinchStartPan.y) * ratio,
        };
        viewRef.current = nextView;
        pipeline.applyViewTransform(nextView);
        onViewChange(nextView);
        return;
      }

      if (isPanning) {
        const nextView = {
          scale: viewRef.current.scale,
          x: e.clientX - panStart.x,
          y: e.clientY - panStart.y,
        };
        viewRef.current = nextView;
        pipeline.applyViewTransform(nextView);
        onViewChange(nextView);
        return;
      }

      if (orbDrag) {
        const orb = orbRef.current;
        orb.y = Math.max(-1.3, Math.min(1.3, orb.y - (e.clientX - orbDrag.x) * 0.006));
        orb.p = Math.max(-1, Math.min(1, orb.p + (e.clientY - orbDrag.y) * 0.006));
        orbDrag.x = e.clientX;
        orbDrag.y = e.clientY;
        pipeline.dirty = true;
        return;
      }

      // Handle endpoint / stroke transform drag
      if (endpointDrag !== null) {
        const curPos = getCanvasPos(e.clientX, e.clientY);
        const dx = curPos.x - endpointDrag.startCanvasPos.x;
        const dy = curPos.y - endpointDrag.startCanvasPos.y;
        const targetStroke = strokesRef.current[endpointDrag.strokeIndex];
        if (targetStroke) {
          const { type, origRaw, cumDistances, totalLen } = endpointDrag;
          for (let i = 0; i < targetStroke.raw.length; i++) {
            if (type === 'move') {
              targetStroke.raw[i].x = origRaw[i].x + dx;
              targetStroke.raw[i].y = origRaw[i].y + dy;
            } else {
              const u = totalLen > 0 ? cumDistances[i] / totalLen : i / (targetStroke.raw.length - 1 || 1);
              const factor = type === 'start' ? (1 - u) : u;
              targetStroke.raw[i].x = origRaw[i].x + dx * factor;
              targetStroke.raw[i].y = origRaw[i].y + dy * factor;
            }
          }
          rebuildStroke(targetStroke, true);
          pipeline.dirty = true;
          drawGuide();
        }
        return;
      }

      pointerMovedDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);

      // Handle hover cursor over endpoint handles of the selected stroke
      const selIdx = selectedStrokeIndexRef.current;
      if (selIdx !== null && selIdx !== undefined && !isPanning && !mode3dRef.current && strokesRef.current[selIdx]) {
        const targetStroke = strokesRef.current[selIdx];
        const raw = targetStroke.raw;
        if (raw && raw.length >= 2) {
          const curPos = getCanvasPos(e.clientX, e.clientY);
          const handleGrabRadius = 26 / viewRef.current.scale;
          const dStart = Math.hypot(curPos.x - raw[0].x, curPos.y - raw[0].y);
          const dEnd = Math.hypot(curPos.x - raw[raw.length - 1].x, curPos.y - raw[raw.length - 1].y);
          if (dStart <= handleGrabRadius || dEnd <= handleGrabRadius) {
            canvas.style.cursor = 'crosshair';
            return;
          }
        }
      }

      // Select mode hovering feedback
      if (toolModeRef.current === 'select' && !isPanning && !mode3dRef.current) {
        const p = getCanvasPos(e.clientX, e.clientY);
        const hit = findClosestStroke(
          strokesRef.current,
          p.x,
          p.y,
          window.innerWidth,
          window.innerHeight,
          20 / viewRef.current.scale
        );
        canvas.style.cursor = hit ? 'pointer' : 'default';
        return;
      }

      // Update eraser cursor tracking
      const curCanvasPos = getCanvasPos(e.clientX, e.clientY);
      eraserCursorRef.current = { x: curCanvasPos.x, y: curCanvasPos.y, visible: true };
      if (toolModeRef.current === 'eraser') {
        drawGuide();
      }

      if (isErasing) {
        const co = (e as any).getCoalescedEvents ? (e as any).getCoalescedEvents() : [];
        (co.length ? co : [e]).forEach((c: PointerEvent) => {
          const p = getCanvasPos(c.clientX, c.clientY);
          if (Math.hypot(p.x - lastErasePos.x, p.y - lastErasePos.y) < 2 / viewRef.current.scale) return;
          eraseAtSegment(
            strokesRef.current,
            lastErasePos,
            p,
            eraserSizeRef.current / 2,
            eraserModeRef.current,
            window.innerWidth,
            window.innerHeight,
            pipeline
          );
          lastErasePos = p;
        });
        return;
      }

      if (!cur) return;
      let added = false;
      const co = (e as any).getCoalescedEvents ? (e as any).getCoalescedEvents() : [];
      (co.length ? co : [e]).forEach((c: PointerEvent) => {
        const wp = getCanvasPos(c.clientX, c.clientY);
        const l = cur!.raw[cur!.raw.length - 1];
        if (Math.hypot(wp.x - l.x, wp.y - l.y) < 2 / viewRef.current.scale) return;
        cur!.raw.push({ x: wp.x, y: wp.y, p: c.pressure });
        added = true;
      });
      if (added) {
        curStrokeDirty = true;
      }
    };

    const onPointerEnd = (e: PointerEvent) => {
      if (e?.pointerId) activePointers.delete(e.pointerId);
      if (isPanning) {
        isPanning = false;
        canvas.style.cursor =
          isSpaceDown || panModeRef.current
            ? 'grab'
            : mode3dRef.current
            ? 'grab'
            : 'crosshair';
        pipeline.dirty = true;
        setInteractiveMode(false);
        return;
      }
      if (orbDrag) {
        orbDrag = null;
        pipeline.dirty = true;
        setInteractiveMode(false);
        return;
      }
      if (endpointDrag !== null) {
        const targetStroke = strokesRef.current[endpointDrag.strokeIndex];
        if (targetStroke) {
          rebuildStroke(targetStroke, false);
          onStrokeTransformedRef.current?.(
            endpointDrag.strokeIndex,
            endpointDrag.initialSnapshot,
            { ...targetStroke, raw: targetStroke.raw.map((p) => ({ ...p })) }
          );
        }
        endpointDrag = null;
        pipeline.dirty = true;
        drawGuide();
        setInteractiveMode(false);
        return;
      }
      if (isErasing) {
        isErasing = false;
        const trulyRemoved = initialStrokesBeforeErase.filter((s) => !strokesRef.current.includes(s));
        const trulyAdded = strokesRef.current.filter((s) => !initialStrokesBeforeErase.includes(s));
        if (trulyRemoved.length > 0 || trulyAdded.length > 0) {
          onErasePerformed?.(trulyRemoved, trulyAdded);
        }
        initialStrokesBeforeErase = [];
        pipeline.dirty = true;
        setInteractiveMode(false);
        return;
      }
      if (toolModeRef.current === 'select') {
        if (pointerMovedDist < 12) {
          const p = getCanvasPos(e.clientX, e.clientY);
          const hit = findClosestStroke(
            strokesRef.current,
            p.x,
            p.y,
            window.innerWidth,
            window.innerHeight,
            24 / viewRef.current.scale
          );
          if (hit) {
            onSelectStrokeRef.current?.(hit.index);
          } else {
            onSelectStrokeRef.current?.(null);
          }
        }
        pipeline.dirty = true;
        setInteractiveMode(false);
        return;
      }
      if (cur) {
        if (cur.raw.length < 2) {
          strokesRef.current.pop();
          dropStroke(cur);
          // Tap click in brush mode: hit test to select an existing stroke or deselect
          if (pointerMovedDist < 8) {
            const p = getCanvasPos(e.clientX, e.clientY);
            const hit = findClosestStroke(
              strokesRef.current,
              p.x,
              p.y,
              window.innerWidth,
              window.innerHeight,
              20 / viewRef.current.scale
            );
            if (hit) {
              onSelectStrokeRef.current?.(hit.index);
            } else if (selectedStrokeIndexRef.current !== null) {
              onSelectStrokeRef.current?.(null);
            }
          }
        } else {
          rebuildStroke(cur, false);
          onStrokeAdded?.(cur);
        }
      }
      cur = null;
      curStrokeDirty = false;
      pipeline.dirty = true;
      setInteractiveMode(false);
    };

    const onWheel = (e: WheelEvent) => {
      setInteractiveMode(true);
      if (mode3dRef.current) {
        e.preventDefault();
        const orb = orbRef.current;
        orb.z = Math.max(0.4, Math.min(2.5, orb.z * (1 + e.deltaY * 0.001)));
        pipeline.dirty = true;
        setInteractiveMode(false);
        return;
      }
      e.preventDefault();
      if (e.ctrlKey || e.metaKey || isSpaceDown) {
        const factor = Math.exp(-e.deltaY * 0.008);
        zoomAt(factor, e.clientX, e.clientY);
      } else if (e.shiftKey) {
        const v = viewRef.current;
        const nextView = { ...v, x: v.x - e.deltaY };
        viewRef.current = nextView;
        pipeline.applyViewTransform(nextView);
        onViewChange(nextView);
      } else {
        const factor = e.deltaY < 0 ? 1.12 : 0.89;
        zoomAt(factor, e.clientX, e.clientY);
      }
      pipeline.dirty = true;
      setInteractiveMode(false);
    };

    const onPointerLeave = () => {
      eraserCursorRef.current.visible = false;
      drawGuide();
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerEnd);
    canvas.addEventListener('pointercancel', onPointerEnd);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const onResize = () => {
      pipeline.resize(window.innerWidth, window.innerHeight);
      drawGuide();
      updateRefTransform();
    };
    window.addEventListener('resize', onResize);

    const onVisibilityChange = () => {
      if (!document.hidden && pipelineRef.current) {
        lastTime = performance.now();
        lastRenderTime = 0;
        pipelineRef.current.dirty = true;
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    // Animation render loop (capped at max 60fps to prevent ProMotion 120Hz/Retina thermal throttling)
    let lastTime = performance.now();
    let lastRenderTime = 0;
    const targetFpsInterval = 1000 / 60; // 60 FPS cap
    let animFrameId = 0;

    const renderLoop = (now: number) => {
      animFrameId = requestAnimationFrame(renderLoop);
      if (document.hidden) {
        return; // Tab in background: 0% GPU
      }

      const elapsed = now - lastRenderTime;
      if (elapsed < targetFpsInterval - 1) {
        return; // Skip redundant frames on 120Hz/144Hz displays
      }
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      lastRenderTime = now - (elapsed % targetFpsInterval);

      // Rebuild active stroke incrementally once per frame
      if (cur && curStrokeDirty) {
        curStrokeDirty = false;
        rebuildStroke(cur, true);
      }

      const isInteracting = !!cur || isPanning || !!orbDrag;
      const isAutoOrbiting = mode3dRef.current && autoOrbit;
      const isAnimating = animOn && paramsRef.current.speed > 0.001;

      // Pointer smoothing
      const ptr = ptrRef.current;
      const ptrDist = Math.hypot(ptr.tx - ptr.x, ptr.ty - ptr.y);
      const isPtrMoving = ptrDist > 0.0008;
      if (isPtrMoving) {
        ptr.x += (ptr.tx - ptr.x) * 0.08;
        ptr.y += (ptr.ty - ptr.y) * 0.08;
      } else if (ptr.x !== ptr.tx || ptr.y !== ptr.ty) {
        ptr.x = ptr.tx;
        ptr.y = ptr.ty;
      }

      // Auto orbit in 3D
      if (isAutoOrbiting) {
        otRef.current += dt * 0.5;
        orbRef.current.y = Math.sin(otRef.current);
        orbRef.current.p = 0.35 * Math.sin(otRef.current * 0.7);
      }

      if (isAnimating) {
        timeRef.current += dt * paramsRef.current.speed;
      }

      const shouldRender =
        pipeline.dirty ||
        isInteracting ||
        isPtrMoving ||
        isAutoOrbiting ||
        isAnimating;

      if (!shouldRender) {
        return; // Idle: Skip all WebGL render passes and uniform updates
      }

      const activeVibe = (window as any).__ACTIVE_VIBE__ || {
        sky: [0.98, 0.45, 0.78],
        hor: [1.0, 0.92, 0.98],
        band: [0.65, 0.85, 1.0],
        ground: [0.26, 0.04, 0.18],
        bg: [0.075, 0.022, 0.07],
        iri: 0.28,
      };

      pipeline.updateUniforms(
        paramsRef.current,
        activeVibe,
        ptr,
        timeRef.current
      );

      pipeline.render(
        paramsRef.current,
        mode3dRef.current,
        autoOrbit,
        orbRef.current,
        timeRef.current,
        glowEnabledRef.current,
        aberrationEnabledRef.current,
        isInteracting
      );
    };

    animFrameId = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(animFrameId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerEnd);
      canvas.removeEventListener('pointercancel', onPointerEnd);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <>
      <div id="stage">
        <canvas
          ref={canvasRef}
          style={{
            cursor: panMode ? 'grab' : mode3d ? 'grab' : toolMode === 'select' ? 'default' : 'crosshair',
          }}
        />
      </div>
      <svg
        ref={guideRef}
        id="guide"
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />
      <div id="ref-layer">
        <img ref={refImgRef} id="ref-img" alt="Reference Sigil" />
      </div>
    </>
  );
};
