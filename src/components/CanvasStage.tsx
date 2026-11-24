import React, { useCallback, useEffect, useRef } from 'react';
import {
  BrushParams,
  EraserMode,
  RefImageState,
  Stroke,
  SymmetryMode,
  ToolMode,
  VibePreset,
  ViewTransform,
} from '../types';
import { RenderPipeline } from '../core/renderPipeline';
import { buildStrokeMesh } from '../core/geometry';
import { drawGuideOverlay, updateRefImageTransform } from './canvas/guideOverlay';
import { CanvasInteractionState, useCanvasRenderLoop } from './canvas/useCanvasRenderLoop';
import { useCanvasPointerGestures } from './canvas/useCanvasPointerGestures';

interface CanvasStageProps {
  pipelineRef: React.MutableRefObject<RenderPipeline | null>;
  strokesRef: React.MutableRefObject<Stroke[]>;
  params: BrushParams;
  activeVibe: VibePreset;
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
  activeVibe,
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

  const latestPropsRef = useRef({
    params,
    activeVibe,
    symmetry,
    guideColor,
    view,
    onViewChange,
    refState,
    mode3d,
    panMode,
    animOn,
    autoOrbit,
    glowEnabled,
    aberrationEnabled,
    toolMode,
    eraserSize,
    eraserMode,
    selectedStrokeIndex,
    onSelectStroke,
    onStrokeAdded,
    onStrokeTransformed,
    onErasePerformed,
  });
  latestPropsRef.current = {
    params,
    activeVibe,
    symmetry,
    guideColor,
    view,
    onViewChange,
    refState,
    mode3d,
    panMode,
    animOn,
    autoOrbit,
    glowEnabled,
    aberrationEnabled,
    toolMode,
    eraserSize,
    eraserMode,
    selectedStrokeIndex,
    onSelectStroke,
    onStrokeAdded,
    onStrokeTransformed,
    onErasePerformed,
  };

  const eraserCursorRef = useRef<{ x: number; y: number; visible: boolean }>({
    x: 0,
    y: 0,
    visible: false,
  });
  const interactionStateRef = useRef<CanvasInteractionState>({
    cur: null,
    curStrokeDirty: false,
    isPanning: false,
    orbDrag: null,
  });
  const orbRef = useRef({ y: 0, p: 0, z: 1 });
  const ptrRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const timeRef = useRef(0);
  const otRef = useRef(0);

  const dropStroke = useCallback(
    (s: Stroke) => {
      if (!pipelineRef.current) return;
      if (s.group) {
        pipelineRef.current.root.remove(s.group);
        s.group.traverse((o: any) => {
          if (o.geometry) o.geometry.dispose();
        });
      }
      pipelineRef.current.dirty = true;
    },
    [pipelineRef]
  );

  const rebuildStroke = useCallback(
    (s: Stroke, isDrawing: boolean = false) => {
      if (!pipelineRef.current) return;
      s.params = s.params || latestPropsRef.current.params;
      s.symmetry = s.symmetry || latestPropsRef.current.symmetry;
      buildStrokeMesh(pipelineRef.current, s, window.innerWidth, window.innerHeight, isDrawing);
    },
    [pipelineRef]
  );

  const drawGuide = useCallback(() => {
    const p = latestPropsRef.current;
    drawGuideOverlay({
      el: guideRef.current,
      view: p.view,
      symmetry: p.symmetry,
      guideColor: p.guideColor,
      mode3d: p.mode3d,
      toolMode: p.toolMode,
      eraserSize: p.eraserSize,
      eraserCursor: eraserCursorRef.current,
      selectedStrokeIndex: p.selectedStrokeIndex,
      strokes: strokesRef.current,
    });
  }, [strokesRef]);

  const updateRef = useCallback(() => {
    const p = latestPropsRef.current;
    updateRefImageTransform(refImgRef.current, p.refState, p.view);
  }, []);

  useEffect(() => {
    drawGuide();
    updateRef();
  }, [
    view,
    symmetry,
    guideColor,
    refState,
    mode3d,
    toolMode,
    eraserSize,
    selectedStrokeIndex,
    params,
    drawGuide,
    updateRef,
  ]);

  useCanvasRenderLoop({
    canvasRef,
    pipelineRef,
    latestPropsRef,
    interactionStateRef,
    orbRef,
    ptrRef,
    timeRef,
    otRef,
    rebuildStroke,
    onResizeOverlay: () => {
      drawGuide();
      updateRef();
    },
  });

  useCanvasPointerGestures({
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
  });

  return (
    <>
      <div id="stage">
        <canvas
          ref={canvasRef}
          style={{
            cursor: panMode
              ? 'grab'
              : mode3d
              ? 'grab'
              : toolMode === 'select'
              ? 'default'
              : 'crosshair',
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
