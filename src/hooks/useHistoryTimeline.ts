import { useCallback, useEffect, useRef, useState } from 'react';
import { HistoryStep, Stroke } from '../types';
import { RenderPipeline } from '../core/renderPipeline';
import { buildStrokeMesh } from '../core/geometry';

interface UseHistoryTimelineOptions {
  pipelineRef: React.MutableRefObject<RenderPipeline | null>;
  strokesRef: React.MutableRefObject<Stroke[]>;
  setSelectedStrokeIndex: React.Dispatch<React.SetStateAction<number | null>>;
  showToast: (msg: string) => void;
}

export function useHistoryTimeline({
  pipelineRef,
  strokesRef,
  setSelectedStrokeIndex,
  showToast,
}: UseHistoryTimelineOptions) {
  const undoStackRef = useRef<HistoryStep[]>([]);
  const redoStackRef = useRef<HistoryStep[]>([]);
  const [canRedo, setCanRedo] = useState<boolean>(false);

  const [timelineVisible, setTimelineVisible] = useState<boolean>(true);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [replaySpeed, setReplaySpeed] = useState<number>(1);
  const [isLooping, setIsLooping] = useState<boolean>(false);
  const [historyState, setHistoryState] = useState<{
    currentStep: number;
    totalSteps: number;
    strokeCount: number;
    currentLabel: string;
  }>({
    currentStep: 0,
    totalSteps: 0,
    strokeCount: 0,
    currentLabel: 'Initial Canvas',
  });

  const syncHistoryState = useCallback(() => {
    const cur = undoStackRef.current.length;
    const total = undoStackRef.current.length + redoStackRef.current.length;
    const lastStep = cur > 0 ? undoStackRef.current[cur - 1] : null;
    const currentLabel = lastStep?.label || (cur === 0 ? 'Initial Canvas' : `Step #${cur}`);
    setHistoryState({
      currentStep: cur,
      totalSteps: total,
      strokeCount: strokesRef.current.length,
      currentLabel,
    });
    setCanRedo(redoStackRef.current.length > 0);
  }, [strokesRef]);

  const disposeRedoStack = useCallback(() => {
    redoStackRef.current.forEach((step) => {
      step.added.forEach((s) => s.group?.traverse((o: any) => o.geometry?.dispose()));
    });
    redoStackRef.current = [];
  }, []);

  const pushHistoryStep = useCallback(
    (step: HistoryStep, options?: { disposeRedo?: boolean }) => {
      setIsPlaying(false);
      if (options?.disposeRedo) {
        disposeRedoStack();
      } else {
        redoStackRef.current = [];
      }
      undoStackRef.current.push(step);
      syncHistoryState();
    },
    [disposeRedoStack, syncHistoryState]
  );

  const handleJumpToStep = useCallback(
    (targetStep: number) => {
      if (!pipelineRef.current) return;
      const total = undoStackRef.current.length + redoStackRef.current.length;
      const clamped = Math.max(0, Math.min(total, Math.round(targetStep)));
      const current = undoStackRef.current.length;
      if (clamped === current) return;

      if (clamped < current) {
        const count = current - clamped;
        for (let i = 0; i < count; i++) {
          const step = undoStackRef.current.pop();
          if (!step) break;
          redoStackRef.current.push(step);

          step.added.forEach((s) => {
            if (s.group) pipelineRef.current?.root.remove(s.group);
            const idx = strokesRef.current.indexOf(s);
            if (idx !== -1) strokesRef.current.splice(idx, 1);
          });

          step.removed.forEach((s) => {
            if (!s.group) {
              buildStrokeMesh(pipelineRef.current!, s, window.innerWidth, window.innerHeight, false);
            } else {
              pipelineRef.current?.root.add(s.group);
            }
            if (!strokesRef.current.includes(s)) {
              strokesRef.current.push(s);
            }
          });
        }
      } else {
        const count = clamped - current;
        for (let i = 0; i < count; i++) {
          const step = redoStackRef.current.pop();
          if (!step) break;
          undoStackRef.current.push(step);

          step.removed.forEach((s) => {
            if (s.group) pipelineRef.current?.root.remove(s.group);
            const idx = strokesRef.current.indexOf(s);
            if (idx !== -1) strokesRef.current.splice(idx, 1);
          });

          step.added.forEach((s) => {
            if (!s.group) {
              buildStrokeMesh(pipelineRef.current!, s, window.innerWidth, window.innerHeight, false);
            } else {
              pipelineRef.current?.root.add(s.group);
            }
            if (!strokesRef.current.includes(s)) {
              strokesRef.current.push(s);
            }
          });
        }
      }

      pipelineRef.current.dirty = true;
      syncHistoryState();
    },
    [pipelineRef, strokesRef, syncHistoryState]
  );

  const handleUndo = useCallback(() => {
    if (!pipelineRef.current || undoStackRef.current.length === 0) return;
    setIsPlaying(false);
    handleJumpToStep(undoStackRef.current.length - 1);
    showToast('Undo');
  }, [handleJumpToStep, pipelineRef, showToast]);

  const handleRedo = useCallback(() => {
    if (!pipelineRef.current || redoStackRef.current.length === 0) return;
    setIsPlaying(false);
    handleJumpToStep(undoStackRef.current.length + 1);
    showToast('Redo');
  }, [handleJumpToStep, pipelineRef, showToast]);

  const handleStrokeAdded = useCallback(
    (stroke: Stroke) => {
      const num = undoStackRef.current.length + 1;
      pushHistoryStep(
        {
          added: [stroke],
          removed: [],
          label: `Stroke #${num}`,
        },
        { disposeRedo: true }
      );
    },
    [pushHistoryStep]
  );

  const handleErasePerformed = useCallback(
    (removed: Stroke[], added: Stroke[]) => {
      pushHistoryStep(
        {
          added,
          removed,
          label: 'Eraser Cut',
        },
        { disposeRedo: true }
      );
    },
    [pushHistoryStep]
  );

  const handleClear = useCallback(() => {
    if (!pipelineRef.current || strokesRef.current.length === 0) return;
    const removed = strokesRef.current.splice(0);
    removed.forEach((s) => {
      if (s.group) pipelineRef.current?.root.remove(s.group);
    });
    setSelectedStrokeIndex(null);
    pipelineRef.current.dirty = true;
    pushHistoryStep({
      added: [],
      removed,
      label: 'Clear Canvas',
    });
    showToast('Canvas Cleared');
  }, [pipelineRef, pushHistoryStep, setSelectedStrokeIndex, showToast, strokesRef]);

  const handleTogglePlay = useCallback(() => {
    const total = undoStackRef.current.length + redoStackRef.current.length;
    if (total === 0) {
      showToast('Draw strokes first to replay');
      return;
    }
    setIsPlaying((prev) => {
      if (!prev) {
        if (undoStackRef.current.length >= total) {
          handleJumpToStep(0);
        }
        showToast('Replay Started (Space / K)');
        return true;
      }
      showToast('Replay Paused');
      return false;
    });
  }, [handleJumpToStep, showToast]);

  useEffect(() => {
    if (!isPlaying) return;

    const intervalMs = Math.round(320 / replaySpeed);
    const timer = setInterval(() => {
      const cur = undoStackRef.current.length;
      const total = undoStackRef.current.length + redoStackRef.current.length;
      if (cur < total) {
        handleJumpToStep(cur + 1);
      } else if (isLooping && total > 0) {
        handleJumpToStep(0);
      } else {
        setIsPlaying(false);
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, replaySpeed, isLooping, handleJumpToStep]);

  return {
    undoStackRef,
    redoStackRef,
    canRedo,
    timelineVisible,
    setTimelineVisible,
    isPlaying,
    replaySpeed,
    setReplaySpeed,
    isLooping,
    setIsLooping,
    historyState,
    pushHistoryStep,
    handleJumpToStep,
    handleUndo,
    handleRedo,
    handleStrokeAdded,
    handleErasePerformed,
    handleClear,
    handleTogglePlay,
  };
}
