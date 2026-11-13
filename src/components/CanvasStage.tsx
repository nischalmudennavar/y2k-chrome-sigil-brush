import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  BrushParams,
  RefImageState,
  Stroke,
  SymmetryMode,
  ViewTransform,
} from '../types';
import { RenderPipeline } from '../core/renderPipeline';
import {
  buildStrokeParts,
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
  onStrokeAdded?: () => void;
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
  onStrokeAdded,
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
    const p = s.params || paramsRef.current;
    const sym = s.symmetry || symmetryRef.current;
    if (s.raw.length < 2) {
      dropStroke(s);
      return;
    }

    // Faster smoothing and resampling during active drawing, fine resolution on finish
    const smoothIterations = isDrawing ? 2 : 3;
    const resampleStep = isDrawing ? 3.0 : 1.5;

    const smoothed = smooth(s.raw, smoothIterations);
    const pts = resample(smoothed, resampleStep);
    s.pts = pts;

    const transforms = getSymmetryTransforms(
      sym,
      window.innerWidth,
      window.innerHeight
    );

    let g = s.group as THREE.Group | null;
    if (!g) {
      g = new THREE.Group();
      s.group = g;
      pipelineRef.current.root.add(g);
    }

    let meshIdx = 0;
    const existingChildren = g.children.filter((c: any) => c.isMesh) as THREE.Mesh[];

    for (const T of transforms) {
      const c = {
        pts: pts.map((q) => {
          const [x, y] = T.f(q.x, q.y);
          return { x, y, p: q.p };
        }),
      };

      const chromeReuse = existingChildren[meshIdx] || null;
      const chrMeshes = buildStrokeParts(
        c,
        0,
        pipelineRef.current.mChr,
        1,
        p,
        chromeReuse ? [chromeReuse] : undefined
      );
      chrMeshes.forEach((m) => {
        if (!m.parent) g!.add(m);
        meshIdx++;
      });
    }

    // Clean up excess meshes if symmetry count decreased
    while (g.children.length > meshIdx) {
      const excess = g.children.pop();
      if (excess) {
        (excess as any).geometry?.dispose();
      }
    }

    pipelineRef.current.dirty = true;
  };

  // Update guide SVG overlay
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
    const currentView = viewRef.current;
    el.innerHTML = `<g transform="translate(${currentView.x}, ${currentView.y}) scale(${currentView.scale})"><g stroke='${guideColor}' stroke-dasharray='4 6'>${s}</g></g>`;
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
  }, [view, symmetry, guideColor, refState, mode3d]);

  // Main canvas interaction & animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const pipeline = new RenderPipeline(canvas);
    pipelineRef.current = pipeline;
    pipeline.resize(window.innerWidth, window.innerHeight);

    let cur: Stroke | null = null;
    let curStrokeDirty = false;
    let orbDrag: { x: number; y: number } | null = null;
    let isPanning = false;
    let panStart = { x: 0, y: 0 };
    let isSpaceDown = false;

    let interactiveTimeout: number | null = null;
    const setInteractiveMode = (active: boolean) => {
      if (active) {
        if (interactiveTimeout !== null) {
          window.clearTimeout(interactiveTimeout);
          interactiveTimeout = null;
        }
        pipeline.setInteractiveQuality(true);
      } else {
        if (interactiveTimeout !== null) {
          window.clearTimeout(interactiveTimeout);
        }
        interactiveTimeout = window.setTimeout(() => {
          interactiveTimeout = null;
          pipeline.setInteractiveQuality(false);
          pipeline.dirty = true;
        }, 250);
      }
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

      const p0 = getCanvasPos(e.clientX, e.clientY);
      cur = {
        raw: [{ x: p0.x, y: p0.y, p: e.pressure }],
        group: null,
        params: { ...paramsRef.current },
        symmetry: symmetryRef.current,
      };
      strokesRef.current.push(cur);
      rebuildStroke(cur);
      onStrokeAdded?.();
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
      if (cur) {
        if (cur.raw.length < 2) {
          strokesRef.current.pop();
          dropStroke(cur);
        } else {
          rebuildStroke(cur, false);
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

    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerEnd);
    canvas.addEventListener('pointercancel', onPointerEnd);
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
      if (interactiveTimeout !== null) {
        window.clearTimeout(interactiveTimeout);
      }
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerEnd);
      canvas.removeEventListener('pointercancel', onPointerEnd);
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
            cursor: panMode ? 'grab' : mode3d ? 'grab' : 'crosshair',
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
