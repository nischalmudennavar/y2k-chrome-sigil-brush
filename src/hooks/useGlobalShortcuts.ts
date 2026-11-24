import { useEffect } from 'react';
import { HistoryStep, ToolMode } from '../types';

interface UseGlobalShortcutsOptions {
  undoStackRef: React.MutableRefObject<HistoryStep[]>;
  redoStackRef: React.MutableRefObject<HistoryStep[]>;
  selectedStrokeIndexRef: React.MutableRefObject<number | null>;
  docsModalOpen: boolean;
  setDocsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  shortcutsModalOpen: boolean;
  setShortcutsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  panMode: boolean;
  setPanMode: React.Dispatch<React.SetStateAction<boolean>>;
  setMode3d: React.Dispatch<React.SetStateAction<boolean>>;
  setAutoOrbit: React.Dispatch<React.SetStateAction<boolean>>;
  setAnimOn: React.Dispatch<React.SetStateAction<boolean>>;
  setGlowEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  setAberrationEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  setNoiseEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  setToolMode: React.Dispatch<React.SetStateAction<ToolMode>>;
  setPanelVisible: React.Dispatch<React.SetStateAction<boolean>>;
  videoSectionEnabled: boolean;
  setVideoSectionEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  setTimelineVisible: React.Dispatch<React.SetStateAction<boolean>>;
  handleUndo: () => void;
  handleRedo: () => void;
  handleJumpToStep: (step: number) => void;
  handleTogglePlay: () => void;
  handleClear: () => void;
  handleZoom: (factor: number) => void;
  handleZoomReset: () => void;
  handlePanNudge: (dx: number, dy: number) => void;
  handleBrushWidthNudge: (delta: number) => void;
  handleCycleSymmetry: () => void;
  handleCycleVibe: (reverse?: boolean) => void;
  handleGenerateSigil: () => void;
  handleAddThorns: () => void;
  handleAddSpikes: () => void;
  handleDeselectStroke: () => void;
  handleDeleteSelectedStroke: () => void;
  loadRefImage: (file: File) => void;
  showToast: (msg: string) => void;
}

export function useGlobalShortcuts(opts: UseGlobalShortcutsOptions) {
  const {
    undoStackRef,
    redoStackRef,
    selectedStrokeIndexRef,
    docsModalOpen,
    setDocsModalOpen,
    shortcutsModalOpen,
    setShortcutsModalOpen,
    panMode,
    setPanMode,
    setMode3d,
    setAutoOrbit,
    setAnimOn,
    setGlowEnabled,
    setAberrationEnabled,
    setNoiseEnabled,
    setToolMode,
    setPanelVisible,
    videoSectionEnabled,
    setVideoSectionEnabled,
    setTimelineVisible,
    handleUndo,
    handleRedo,
    handleJumpToStep,
    handleTogglePlay,
    handleClear,
    handleZoom,
    handleZoomReset,
    handlePanNudge,
    handleBrushWidthNudge,
    handleCycleSymmetry,
    handleCycleVibe,
    handleGenerateSigil,
    handleAddThorns,
    handleAddSpikes,
    handleDeselectStroke,
    handleDeleteSelectedStroke,
    loadRefImage,
    showToast,
  } = opts;

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) loadRefImage(file);
          break;
        }
      }
    };
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith('image/')) loadRefImage(file);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      if (e.key === 'Escape') {
        if (docsModalOpen) {
          e.preventDefault();
          setDocsModalOpen(false);
          return;
        }
        if (shortcutsModalOpen) {
          e.preventDefault();
          setShortcutsModalOpen(false);
          return;
        }
        if (isInput) {
          target.blur();
          return;
        }
        if (panMode) {
          setPanMode(false);
          showToast('Pan Mode: Off');
          return;
        }
        if (selectedStrokeIndexRef.current !== null) {
          e.preventDefault();
          handleDeselectStroke();
        }
        return;
      }

      if (isInput) return;

      if (e.key === 'F1' || (e.shiftKey && e.key.toLowerCase() === 'd')) {
        e.preventDefault();
        setDocsModalOpen((prev) => !prev);
        return;
      }

      if (e.key === '?' || (e.key === '/' && !e.ctrlKey && !e.metaKey)) {
        e.preventDefault();
        setShortcutsModalOpen((prev) => !prev);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }

      if (e.key === '[') {
        e.preventDefault();
        handleBrushWidthNudge(e.shiftKey ? -10 : -2);
        return;
      }
      if (e.key === ']') {
        e.preventDefault();
        handleBrushWidthNudge(e.shiftKey ? 10 : 2);
        return;
      }

      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        handleZoom(1.18);
        return;
      }
      if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        handleZoom(0.85);
        return;
      }
      if (e.key === '0' || e.key.toLowerCase() === 'f') {
        e.preventDefault();
        handleZoomReset();
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePanNudge(e.shiftKey ? 120 : 40, 0);
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        handlePanNudge(e.shiftKey ? -120 : -40, 0);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        handlePanNudge(0, e.shiftKey ? 120 : 40);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        handlePanNudge(0, e.shiftKey ? -120 : -40);
        return;
      }

      const k = e.key.toLowerCase();
      if (k === 'h') {
        e.preventDefault();
        setPanMode((prev) => {
          showToast(!prev ? 'Pan Tool: On' : 'Pan Tool: Off');
          return !prev;
        });
        return;
      }

      if (k === 'd' || e.key === '3') {
        e.preventDefault();
        setMode3d((prev) => {
          showToast(!prev ? '3D View: On' : '3D View: Off');
          return !prev;
        });
        return;
      }

      if (k === 'o') {
        e.preventDefault();
        setAutoOrbit((prev) => {
          showToast(!prev ? 'Auto Orbit: On' : 'Auto Orbit: Off');
          return !prev;
        });
        return;
      }

      if (k === 'x') {
        e.preventDefault();
        handleCycleSymmetry();
        return;
      }

      if (k === 'v') {
        e.preventDefault();
        handleCycleVibe(e.shiftKey);
        return;
      }

      if (k === 'a') {
        e.preventDefault();
        setAnimOn((prev) => {
          showToast(!prev ? 'Animation: On' : 'Animation: Off');
          return !prev;
        });
        return;
      }

      if (k === 'g') {
        e.preventDefault();
        setGlowEnabled((prev) => {
          showToast(!prev ? 'Star Glow: On' : 'Star Glow: Off');
          return !prev;
        });
        return;
      }

      if (k === 'b') {
        e.preventDefault();
        setAberrationEnabled((prev) => {
          showToast(!prev ? 'Aberration: On' : 'Aberration: Off');
          return !prev;
        });
        return;
      }

      if (k === 'n') {
        e.preventDefault();
        setNoiseEnabled((prev) => {
          showToast(!prev ? 'Film Noise: On' : 'Film Noise: Off');
          return !prev;
        });
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedStrokeIndexRef.current !== null) {
          e.preventDefault();
          handleDeleteSelectedStroke();
          return;
        }
      }

      if (k === 's' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setToolMode((prev) => {
          const next = prev === 'select' ? 'brush' : 'select';
          showToast(next === 'select' ? 'Tool: Select & Modify (S)' : 'Tool: Brush (S)');
          return next;
        });
        return;
      }

      if (k === 't' && e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        handleAddThorns();
        return;
      }

      if (k === 'e' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setToolMode((prev) => {
          const next = prev === 'eraser' ? 'brush' : 'eraser';
          showToast(next === 'eraser' ? 'Tool: Eraser (E)' : 'Tool: Brush (E)');
          return next;
        });
        return;
      }

      if (k === 'r' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (e.shiftKey) handleAddSpikes();
        else handleGenerateSigil();
        return;
      }

      if (e.key === 'C' && e.shiftKey) {
        e.preventDefault();
        handleClear();
        return;
      }

      if (e.key === 'Tab' || k === 'p') {
        e.preventDefault();
        setPanelVisible((prev) => {
          showToast(!prev ? 'Panel: Shown' : 'Panel: Hidden (Tab / P)');
          return !prev;
        });
        return;
      }

      if (k === 't' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (!videoSectionEnabled) {
          setVideoSectionEnabled(true);
          setTimelineVisible(true);
          showToast('Video Section: On');
        } else {
          setTimelineVisible((prev) => {
            showToast(!prev ? 'Timeline Deck: Shown' : 'Timeline Deck: Hidden (T)');
            return !prev;
          });
        }
        return;
      }

      if (k === 'k' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        handleTogglePlay();
        return;
      }

      if (e.key === ',' || e.key === '<') {
        e.preventDefault();
        handleUndo();
        return;
      }

      if (e.key === '.' || e.key === '>') {
        e.preventDefault();
        handleRedo();
        return;
      }

      if (e.key === 'Home') {
        e.preventDefault();
        handleJumpToStep(0);
        showToast('Timeline: Jump to Start');
        return;
      }

      if (e.key === 'End') {
        e.preventDefault();
        const total = undoStackRef.current.length + redoStackRef.current.length;
        handleJumpToStep(total);
        showToast('Timeline: Jump to End');
        return;
      }
    };

    window.addEventListener('paste', onPaste);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [
    docsModalOpen,
    handleAddSpikes,
    handleAddThorns,
    handleBrushWidthNudge,
    handleClear,
    handleCycleSymmetry,
    handleCycleVibe,
    handleDeleteSelectedStroke,
    handleDeselectStroke,
    handleGenerateSigil,
    handleJumpToStep,
    handlePanNudge,
    handleRedo,
    handleTogglePlay,
    handleUndo,
    handleZoom,
    handleZoomReset,
    loadRefImage,
    panMode,
    redoStackRef,
    selectedStrokeIndexRef,
    setAberrationEnabled,
    setAnimOn,
    setAutoOrbit,
    setDocsModalOpen,
    setGlowEnabled,
    setMode3d,
    setNoiseEnabled,
    setPanelVisible,
    setPanMode,
    setShortcutsModalOpen,
    setTimelineVisible,
    setToolMode,
    setVideoSectionEnabled,
    shortcutsModalOpen,
    showToast,
    undoStackRef,
    videoSectionEnabled,
  ]);
}
