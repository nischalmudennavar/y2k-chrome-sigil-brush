import { useEffect } from 'react';
import {
  BrushParams,
  EraserMode,
  Point,
  Stroke,
  SymmetryMode,
  ToolMode,
  ViewTransform,
} from '../../types';
import { RenderPipeline } from '../../core/renderPipeline';
import { eraseAtSegment } from '../../core/eraser';
import { findClosestStroke } from '../../core/geometry';
import { CanvasInteractionState } from './useCanvasRenderLoop';

export interface CanvasGestureProps {
  params: BrushParams;
  symmetry: SymmetryMode;
  view: ViewTransform;
  onViewChange: (view: ViewTransform) => void;
  mode3d: boolean;
  panMode: boolean;
  toolMode: ToolMode;
  eraserSize: number;
  eraserMode: EraserMode;
  selectedStrokeIndex: number | null;
  onSelectStroke?: (index: number | null) => void;
  onStrokeAdded?: (stroke: Stroke) => void;
  onStrokeTransformed?: (strokeIndex: number, oldStroke: Stroke, newStroke: Stroke) => void;
  onErasePerformed?: (removed: Stroke[], added: Stroke[]) => void;
}

interface UseCanvasPointerGesturesOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  pipelineRef: React.MutableRefObject<RenderPipeline | null>;
  strokesRef: React.MutableRefObject<Stroke[]>;
  latestPropsRef: React.MutableRefObject<CanvasGestureProps>;
  interactionStateRef: React.MutableRefObject<CanvasInteractionState>;
  orbRef: React.MutableRefObject<{ y: number; p: number; z: number }>;
  ptrRef: React.MutableRefObject<{ x: number; y: number; tx: number; ty: number }>;
  eraserCursorRef: React.MutableRefObject<{ x: number; y: number; visible: boolean }>;
  dropStroke: (s: Stroke) => void;
  rebuildStroke: (s: Stroke, isDrawing?: boolean) => void;
  drawGuide: () => void;
}

export function useCanvasPointerGestures({
  canvasRef,
  pipelineRef,
  strokesRef,
  latestPropsRef,
  interactionStateRef,
  orbRef,
  ptrRef,
  eraserCursorRef,
  dropStroke,
  rebuildStroke,
  drawGuide,
}: UseCanvasPointerGesturesOptions) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let isErasing = false;
    let lastErasePos = { x: 0, y: 0 };
    let initialStrokesBeforeErase: Stroke[] = [];
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

    const activePointers = new Map<number, { x: number; y: number }>();
    let pinchStartDist = 0;
    let pinchStartScale = 1;
    let pinchCenter = { x: 0, y: 0 };
    let pinchStartPan = { x: 0, y: 0 };

    const getCanvasPos = (clientX: number, clientY: number) => {
      const v = latestPropsRef.current.view;
      return {
        x: (clientX - v.x) / v.scale,
        y: (clientY - v.y) / v.scale,
      };
    };

    const zoomAt = (factor: number, cx: number, cy: number) => {
      const pipeline = pipelineRef.current;
      if (!pipeline) return;
      const v = latestPropsRef.current.view;
      const newScale = Math.max(0.2, Math.min(6.0, v.scale * factor));
      const ratio = newScale / v.scale;
      const nextView = {
        scale: newScale,
        x: cx - (cx - v.x) * ratio,
        y: cy - (cy - v.y) * ratio,
      };
      latestPropsRef.current.view = nextView;
      pipeline.applyViewTransform(nextView);
      latestPropsRef.current.onViewChange(nextView);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isSpaceDown && (e.target as HTMLElement)?.tagName !== 'INPUT') {
        isSpaceDown = true;
        if (!latestPropsRef.current.mode3d) canvas.style.cursor = 'grab';
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        isSpaceDown = false;
        if (!latestPropsRef.current.mode3d && !latestPropsRef.current.panMode) {
          canvas.style.cursor = 'crosshair';
        }
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      const pipeline = pipelineRef.current;
      if (!pipeline) return;
      const props = latestPropsRef.current;
      const interaction = interactionStateRef.current;

      canvas.setPointerCapture(e.pointerId);
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      pointerDownPos = { x: e.clientX, y: e.clientY };
      pointerMovedDist = 0;

      if (activePointers.size === 2 && !props.mode3d) {
        if (interaction.cur) {
          strokesRef.current.pop();
          dropStroke(interaction.cur);
          interaction.cur = null;
        }
        const pts = Array.from(activePointers.values());
        pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
        pinchStartScale = props.view.scale;
        pinchCenter = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        pinchStartPan = { x: props.view.x, y: props.view.y };
        return;
      }
      if (activePointers.size > 2) return;

      if (!props.mode3d && (isSpaceDown || props.panMode || e.button === 1)) {
        interaction.isPanning = true;
        panStart = { x: e.clientX - props.view.x, y: e.clientY - props.view.y };
        canvas.style.cursor = 'grabbing';
        return;
      }

      if (props.mode3d) {
        interaction.orbDrag = { x: e.clientX, y: e.clientY };
        return;
      }

      const selIdx = props.selectedStrokeIndex;
      if (selIdx !== null && selIdx !== undefined && strokesRef.current[selIdx]) {
        const targetStroke = strokesRef.current[selIdx];
        const raw = targetStroke.raw;
        if (raw && raw.length >= 2) {
          const clickPos = getCanvasPos(e.clientX, e.clientY);
          const pStart = raw[0];
          const pEnd = raw[raw.length - 1];
          const handleGrabRadius = 26 / props.view.scale;
          const dStart = Math.hypot(clickPos.x - pStart.x, clickPos.y - pStart.y);
          const dEnd = Math.hypot(clickPos.x - pEnd.x, clickPos.y - pEnd.y);

          if (dStart <= handleGrabRadius || dEnd <= handleGrabRadius) {
            const dragType: 'start' | 'end' = dStart <= dEnd ? 'start' : 'end';
            const cumDistances = [0];
            for (let i = 1; i < raw.length; i++) {
              cumDistances.push(
                cumDistances[i - 1] + Math.hypot(raw[i].x - raw[i - 1].x, raw[i].y - raw[i - 1].y)
              );
            }
            const totalLen = cumDistances[cumDistances.length - 1] || 1;
            const origRaw = raw.map((p) => ({ ...p }));
            endpointDrag = {
              type: dragType,
              strokeIndex: selIdx,
              origRaw,
              cumDistances,
              totalLen,
              startCanvasPos: clickPos,
              initialSnapshot: {
                ...targetStroke,
                raw: origRaw,
                params: { ...targetStroke.params },
              },
            };
            canvas.style.cursor = 'crosshair';
            return;
          }
        }
      }

      if (props.toolMode === 'select') {
        if (selIdx !== null && selIdx !== undefined && strokesRef.current[selIdx]) {
          const clickPos = getCanvasPos(e.clientX, e.clientY);
          const hit = findClosestStroke(
            [strokesRef.current[selIdx]],
            clickPos.x,
            clickPos.y,
            window.innerWidth,
            window.innerHeight,
            24 / props.view.scale
          );
          if (hit) {
            const targetStroke = strokesRef.current[selIdx];
            const origRaw = targetStroke.raw.map((p) => ({ ...p }));
            endpointDrag = {
              type: 'move',
              strokeIndex: selIdx,
              origRaw,
              cumDistances: [],
              totalLen: 1,
              startCanvasPos: clickPos,
              initialSnapshot: {
                ...targetStroke,
                raw: origRaw,
                params: { ...targetStroke.params },
              },
            };
            canvas.style.cursor = 'move';
            return;
          }
        }
        return;
      }

      const p0 = getCanvasPos(e.clientX, e.clientY);

      if (props.toolMode === 'eraser') {
        isErasing = true;
        lastErasePos = p0;
        initialStrokesBeforeErase = [...strokesRef.current];
        eraseAtSegment(
          strokesRef.current,
          p0,
          p0,
          props.eraserSize / 2,
          props.eraserMode,
          window.innerWidth,
          window.innerHeight,
          pipeline
        );
        return;
      }

      const newStroke: Stroke = {
        raw: [{ x: p0.x, y: p0.y, p: e.pressure }],
        group: null,
        params: { ...props.params },
        symmetry: props.symmetry,
      };
      interaction.cur = newStroke;
      strokesRef.current.push(newStroke);
      rebuildStroke(newStroke);
    };

    const onPointerMove = (e: PointerEvent) => {
      const pipeline = pipelineRef.current;
      if (!pipeline) return;
      const props = latestPropsRef.current;
      const interaction = interactionStateRef.current;

      ptrRef.current.tx = (e.clientX / window.innerWidth) * 2 - 1;
      ptrRef.current.ty = 1 - (e.clientY / window.innerHeight) * 2;

      if (activePointers.has(e.pointerId)) {
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      if (activePointers.size === 2 && !props.mode3d) {
        const pts = Array.from(activePointers.values());
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
        const currentCenter = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        const targetScale = Math.max(0.2, Math.min(6.0, pinchStartScale * (dist / pinchStartDist)));
        const ratio = targetScale / pinchStartScale;
        const nextView = {
          scale: targetScale,
          x: currentCenter.x - (pinchCenter.x - pinchStartPan.x) * ratio,
          y: currentCenter.y - (pinchCenter.y - pinchStartPan.y) * ratio,
        };
        props.view = nextView;
        pipeline.applyViewTransform(nextView);
        props.onViewChange(nextView);
        return;
      }

      if (interaction.isPanning) {
        const nextView = {
          scale: props.view.scale,
          x: e.clientX - panStart.x,
          y: e.clientY - panStart.y,
        };
        props.view = nextView;
        pipeline.applyViewTransform(nextView);
        props.onViewChange(nextView);
        return;
      }

      if (interaction.orbDrag) {
        const orb = orbRef.current;
        orb.y = Math.max(-1.3, Math.min(1.3, orb.y - (e.clientX - interaction.orbDrag.x) * 0.006));
        orb.p = Math.max(-1, Math.min(1, orb.p + (e.clientY - interaction.orbDrag.y) * 0.006));
        interaction.orbDrag.x = e.clientX;
        interaction.orbDrag.y = e.clientY;
        pipeline.dirty = true;
        return;
      }

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
              const u =
                totalLen > 0 ? cumDistances[i] / totalLen : i / (targetStroke.raw.length - 1 || 1);
              const factor = type === 'start' ? 1 - u : u;
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

      const selIdx = props.selectedStrokeIndex;
      if (selIdx !== null && selIdx !== undefined && !props.mode3d && strokesRef.current[selIdx]) {
        const targetStroke = strokesRef.current[selIdx];
        const raw = targetStroke.raw;
        if (raw && raw.length >= 2) {
          const curPos = getCanvasPos(e.clientX, e.clientY);
          const handleGrabRadius = 26 / props.view.scale;
          const dStart = Math.hypot(curPos.x - raw[0].x, curPos.y - raw[0].y);
          const dEnd = Math.hypot(
            curPos.x - raw[raw.length - 1].x,
            curPos.y - raw[raw.length - 1].y
          );
          if (dStart <= handleGrabRadius || dEnd <= handleGrabRadius) {
            canvas.style.cursor = 'crosshair';
            return;
          }
        }
      }

      if (props.toolMode === 'select' && !props.mode3d) {
        const p = getCanvasPos(e.clientX, e.clientY);
        const hit = findClosestStroke(
          strokesRef.current,
          p.x,
          p.y,
          window.innerWidth,
          window.innerHeight,
          20 / props.view.scale
        );
        canvas.style.cursor = hit ? 'pointer' : 'default';
        return;
      }

      const curCanvasPos = getCanvasPos(e.clientX, e.clientY);
      eraserCursorRef.current = { x: curCanvasPos.x, y: curCanvasPos.y, visible: true };
      if (props.toolMode === 'eraser') {
        drawGuide();
      }

      if (isErasing) {
        const co = (e as any).getCoalescedEvents ? (e as any).getCoalescedEvents() : [];
        (co.length ? co : [e]).forEach((c: PointerEvent) => {
          const p = getCanvasPos(c.clientX, c.clientY);
          if (Math.hypot(p.x - lastErasePos.x, p.y - lastErasePos.y) < 2 / props.view.scale) return;
          eraseAtSegment(
            strokesRef.current,
            lastErasePos,
            p,
            props.eraserSize / 2,
            props.eraserMode,
            window.innerWidth,
            window.innerHeight,
            pipeline
          );
          lastErasePos = p;
        });
        return;
      }

      if (!interaction.cur) return;
      let added = false;
      const co = (e as any).getCoalescedEvents ? (e as any).getCoalescedEvents() : [];
      (co.length ? co : [e]).forEach((c: PointerEvent) => {
        const wp = getCanvasPos(c.clientX, c.clientY);
        const l = interaction.cur!.raw[interaction.cur!.raw.length - 1];
        if (Math.hypot(wp.x - l.x, wp.y - l.y) < 2 / props.view.scale) return;
        interaction.cur!.raw.push({ x: wp.x, y: wp.y, p: c.pressure });
        added = true;
      });
      if (added) {
        interaction.curStrokeDirty = true;
      }
    };

    const onPointerEnd = (e: PointerEvent) => {
      const pipeline = pipelineRef.current;
      if (!pipeline) return;
      const props = latestPropsRef.current;
      const interaction = interactionStateRef.current;

      if (e?.pointerId) activePointers.delete(e.pointerId);

      if (interaction.isPanning) {
        interaction.isPanning = false;
        canvas.style.cursor =
          isSpaceDown || props.panMode ? 'grab' : props.mode3d ? 'grab' : 'crosshair';
        pipeline.dirty = true;
        return;
      }

      if (interaction.orbDrag) {
        interaction.orbDrag = null;
        pipeline.dirty = true;
        return;
      }

      if (endpointDrag !== null) {
        const targetStroke = strokesRef.current[endpointDrag.strokeIndex];
        if (targetStroke) {
          rebuildStroke(targetStroke, false);
          props.onStrokeTransformed?.(endpointDrag.strokeIndex, endpointDrag.initialSnapshot, {
            ...targetStroke,
            raw: targetStroke.raw.map((p) => ({ ...p })),
          });
        }
        endpointDrag = null;
        pipeline.dirty = true;
        drawGuide();
        return;
      }

      if (isErasing) {
        isErasing = false;
        const trulyRemoved = initialStrokesBeforeErase.filter(
          (s) => !strokesRef.current.includes(s)
        );
        const trulyAdded = strokesRef.current.filter(
          (s) => !initialStrokesBeforeErase.includes(s)
        );
        if (trulyRemoved.length > 0 || trulyAdded.length > 0) {
          props.onErasePerformed?.(trulyRemoved, trulyAdded);
        }
        initialStrokesBeforeErase = [];
        pipeline.dirty = true;
        return;
      }

      if (props.toolMode === 'select') {
        if (pointerMovedDist < 12) {
          const p = getCanvasPos(e.clientX, e.clientY);
          const hit = findClosestStroke(
            strokesRef.current,
            p.x,
            p.y,
            window.innerWidth,
            window.innerHeight,
            24 / props.view.scale
          );
          props.onSelectStroke?.(hit ? hit.index : null);
        }
        pipeline.dirty = true;
        return;
      }

      if (interaction.cur) {
        const cur = interaction.cur;
        if (cur.raw.length < 2) {
          strokesRef.current.pop();
          dropStroke(cur);
          if (pointerMovedDist < 8) {
            const p = getCanvasPos(e.clientX, e.clientY);
            const hit = findClosestStroke(
              strokesRef.current,
              p.x,
              p.y,
              window.innerWidth,
              window.innerHeight,
              20 / props.view.scale
            );
            if (hit) {
              props.onSelectStroke?.(hit.index);
            } else if (props.selectedStrokeIndex !== null) {
              props.onSelectStroke?.(null);
            }
          }
        } else {
          rebuildStroke(cur, false);
          props.onStrokeAdded?.(cur);
        }
      }

      interaction.cur = null;
      interaction.curStrokeDirty = false;
      pipeline.dirty = true;
    };

    const onWheel = (e: WheelEvent) => {
      const pipeline = pipelineRef.current;
      if (!pipeline) return;
      const props = latestPropsRef.current;

      if (props.mode3d) {
        e.preventDefault();
        const orb = orbRef.current;
        orb.z = Math.max(0.4, Math.min(2.5, orb.z * (1 + e.deltaY * 0.001)));
        pipeline.dirty = true;
        return;
      }

      e.preventDefault();
      if (e.ctrlKey || e.metaKey || isSpaceDown) {
        zoomAt(Math.exp(-e.deltaY * 0.008), e.clientX, e.clientY);
      } else if (e.shiftKey) {
        const v = props.view;
        const nextView = { ...v, x: v.x - e.deltaY };
        props.view = nextView;
        pipeline.applyViewTransform(nextView);
        props.onViewChange(nextView);
      } else {
        zoomAt(e.deltaY < 0 ? 1.12 : 0.89, e.clientX, e.clientY);
      }
      pipeline.dirty = true;
    };

    const onPointerLeave = () => {
      eraserCursorRef.current.visible = false;
      drawGuide();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerEnd);
    canvas.addEventListener('pointercancel', onPointerEnd);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerEnd);
      canvas.removeEventListener('pointercancel', onPointerEnd);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, []);
}
