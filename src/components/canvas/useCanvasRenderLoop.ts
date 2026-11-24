import { useEffect } from 'react';
import { BrushParams, Stroke, VibePreset } from '../../types';
import { RenderPipeline } from '../../core/renderPipeline';

export interface CanvasRenderLoopProps {
  params: BrushParams;
  activeVibe: VibePreset;
  mode3d: boolean;
  animOn: boolean;
  autoOrbit: boolean;
  glowEnabled: boolean;
  aberrationEnabled: boolean;
}

export interface CanvasInteractionState {
  cur: Stroke | null;
  curStrokeDirty: boolean;
  isPanning: boolean;
  orbDrag: { x: number; y: number } | null;
}

interface UseCanvasRenderLoopOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  pipelineRef: React.MutableRefObject<RenderPipeline | null>;
  latestPropsRef: React.MutableRefObject<CanvasRenderLoopProps>;
  interactionStateRef: React.MutableRefObject<CanvasInteractionState>;
  orbRef: React.MutableRefObject<{ y: number; p: number; z: number }>;
  ptrRef: React.MutableRefObject<{ x: number; y: number; tx: number; ty: number }>;
  timeRef: React.MutableRefObject<number>;
  otRef: React.MutableRefObject<number>;
  rebuildStroke: (s: Stroke, isDrawing?: boolean) => void;
  onResizeOverlay: () => void;
}

export function useCanvasRenderLoop({
  canvasRef,
  pipelineRef,
  latestPropsRef,
  interactionStateRef,
  orbRef,
  ptrRef,
  timeRef,
  otRef,
  rebuildStroke,
  onResizeOverlay,
}: UseCanvasRenderLoopOptions) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const pipeline = new RenderPipeline(canvas);
    pipelineRef.current = pipeline;
    pipeline.resize(window.innerWidth, window.innerHeight);

    let lastTime = performance.now();
    let lastRenderTime = 0;
    const targetFpsInterval = 1000 / 60;
    let animFrameId = 0;

    const onResize = () => {
      pipeline.resize(window.innerWidth, window.innerHeight);
      onResizeOverlay();
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

    const renderLoop = (now: number) => {
      animFrameId = requestAnimationFrame(renderLoop);
      if (document.hidden) return;

      const elapsed = now - lastRenderTime;
      if (elapsed < targetFpsInterval - 1) return;

      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      lastRenderTime = now - (elapsed % targetFpsInterval);

      const interaction = interactionStateRef.current;
      if (interaction.cur && interaction.curStrokeDirty) {
        interaction.curStrokeDirty = false;
        rebuildStroke(interaction.cur, true);
      }

      const props = latestPropsRef.current;
      const isInteracting = !!interaction.cur || interaction.isPanning || !!interaction.orbDrag;
      const isAutoOrbiting = props.mode3d && props.autoOrbit;
      const isAnimating = props.animOn && props.params.speed > 0.001;

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

      if (isAutoOrbiting) {
        otRef.current += dt * 0.5;
        orbRef.current.y = Math.sin(otRef.current);
        orbRef.current.p = 0.35 * Math.sin(otRef.current * 0.7);
      }

      if (isAnimating) {
        timeRef.current += dt * props.params.speed;
      }

      const shouldRender =
        pipeline.dirty || isInteracting || isPtrMoving || isAutoOrbiting || isAnimating;
      if (!shouldRender) return;

      pipeline.updateUniforms(props.params, props.activeVibe, ptr, timeRef.current);
      pipeline.render(
        props.params,
        props.mode3d,
        props.autoOrbit,
        orbRef.current,
        timeRef.current,
        props.glowEnabled,
        props.aberrationEnabled,
        isInteracting
      );
    };

    animFrameId = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(animFrameId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('resize', onResize);
      pipeline.dispose();
      pipelineRef.current = null;
    };
  }, []);
}
