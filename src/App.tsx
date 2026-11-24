import React, { useCallback, useRef, useState } from 'react';
import { BrushParams, EraserMode, RefImageState, Stroke, SymmetryMode, ToolMode, ViewTransform } from './types';
import { DEFAULT_PARAMS, LIVE_PARAM_KEYS, PAL, SYMMETRY_MODES } from './constants/presets';
import { RenderPipeline } from './core/renderPipeline';
import { CanvasStage } from './components/CanvasStage';
import { ControlPanel } from './components/ControlPanel';
import { GlobalToolsDock } from './components/GlobalToolsDock';
import { TimelineDeck } from './components/TimelineDeck';
import { NoiseOverlay } from './components/NoiseOverlay';
import { ShortcutsModal } from './components/ShortcutsModal';
import { DocsModal } from './components/DocsModal';
import { ToastStack } from './components/ToastStack';
import { UIMetaballLayer } from './components/UIMetaballLayer';
import { BaseStyle, export3DModel, exportImage } from './core/export';
import { buildStrokeMesh } from './core/geometry';
import { useThemeVibe } from './hooks/useThemeVibe';
import { useHistoryTimeline } from './hooks/useHistoryTimeline';
import { useSigilActions } from './hooks/useSigilActions';
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts';
import { useToastQueue } from './hooks/useToastQueue';

export const App: React.FC = () => {
  const [params, setParams] = useState<BrushParams>(() => {
    const initialVibe = PAL['Black Mercury'] || PAL['Pink K-Pop'];
    return {
      ...DEFAULT_PARAMS,
      ...(initialVibe.params || {}),
    };
  });

  const [symmetry, setSymmetry] = useState<SymmetryMode>('None');
  const [panMode, setPanMode] = useState<boolean>(false);
  const [animOn, setAnimOn] = useState<boolean>(true);
  const [mode3d, setMode3d] = useState<boolean>(false);
  const [autoOrbit, setAutoOrbit] = useState<boolean>(false);
  const [glowEnabled, setGlowEnabled] = useState<boolean>(true);
  const [aberrationEnabled, setAberrationEnabled] = useState<boolean>(true);
  const [noiseEnabled, setNoiseEnabled] = useState<boolean>(false);
  const [exportStatus, setExportStatus] = useState<string>('');
  const [toolMode, setToolMode] = useState<ToolMode>('brush');
  const [eraserSize, setEraserSize] = useState<number>(28);
  const [eraserMode, setEraserMode] = useState<EraserMode>('slice');
  const [selectedStrokeIndex, setSelectedStrokeIndex] = useState<number | null>(null);
  const selectedStrokeIndexRef = useRef<number | null>(null);
  selectedStrokeIndexRef.current = selectedStrokeIndex;

  const [panelVisible, setPanelVisible] = useState<boolean>(true);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState<boolean>(false);
  const [docsModalOpen, setDocsModalOpen] = useState<boolean>(false);
  const { toasts, showToast } = useToastQueue();

  const [view, setView] = useState<ViewTransform>({ scale: 1, x: 0, y: 0 });
  const [refState, setRefState] = useState<RefImageState>({
    src: '',
    naturalW: 0,
    naturalH: 0,
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    scale: 1,
    opacity: 0.4,
    blend: 'normal',
    visible: true,
  });

  const pipelineRef = useRef<RenderPipeline | null>(null);
  const strokesRef = useRef<Stroke[]>([]);

  const handleToggleAnimation = useCallback(() => {
    setAnimOn((value) => {
      showToast(`Animation: ${value ? 'Off' : 'On'}`);
      return !value;
    });
  }, [showToast]);

  const handleToggle3D = useCallback(() => {
    setMode3d((value) => {
      showToast(`3D View: ${value ? 'Off' : 'On'}`);
      return !value;
    });
  }, [showToast]);

  const handleToggleOrbit = useCallback(() => {
    setAutoOrbit((value) => {
      showToast(`Auto Orbit: ${value ? 'Off' : 'On'}`);
      return !value;
    });
  }, [showToast]);

  const handleTogglePanMode = useCallback(() => {
    setPanMode((value) => {
      showToast(`Pan Tool: ${value ? 'Off' : 'On'}`);
      return !value;
    });
  }, [showToast]);

  const handleToggleEraser = useCallback(() => {
    setToolMode((value) => {
      const next = value === 'eraser' ? 'brush' : 'eraser';
      showToast(next === 'eraser' ? 'Tool: Eraser (E)' : 'Tool: Brush (E)');
      return next;
    });
  }, [showToast]);

  const {
    currentVibe,
    customBgColor,
    activeVibe,
    currentBgHex,
    handleVibeChange,
    handleBgColorChange,
    handleResetBgColor,
    handleCycleVibe,
  } = useThemeVibe({ pipelineRef, setParams, showToast });

  const {
    undoStackRef,
    redoStackRef,
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
  } = useHistoryTimeline({
    pipelineRef,
    strokesRef,
    setSelectedStrokeIndex,
    showToast,
  });

  const { sigilStyle, setSigilStyle, handleGenerateSigil, handleAddThorns, handleAddSpikes } =
    useSigilActions({
      pipelineRef,
      strokesRef,
      selectedStrokeIndexRef,
      params,
      symmetry,
      setSymmetry,
      pushHistoryStep,
      showToast,
    });

  const handleParamChange = (key: string, value: number) => {
    setParams((prev) => {
      const next = { ...prev, [key]: value };
      if (!LIVE_PARAM_KEYS.has(key as keyof BrushParams) && pipelineRef.current) {
        pipelineRef.current.dirty = true;
      }
      return next;
    });

    const selIdx = selectedStrokeIndexRef.current;
    if (selIdx !== null && strokesRef.current[selIdx]) {
      const target = strokesRef.current[selIdx];
      target.params = { ...target.params, [key]: value };
      if (pipelineRef.current) {
        buildStrokeMesh(pipelineRef.current, target, window.innerWidth, window.innerHeight, false);
        pipelineRef.current.dirty = true;
      }
    }
  };

  const handleSelectStroke = useCallback(
    (index: number | null) => {
      setSelectedStrokeIndex(index);
      if (index !== null && strokesRef.current[index]) {
        const sel = strokesRef.current[index];
        setParams({ ...sel.params });
        setSymmetry(sel.symmetry);
        showToast(`Selected Stroke #${index + 1} (${sel.symmetry})`);
      }
      if (pipelineRef.current) {
        pipelineRef.current.dirty = true;
      }
    },
    [showToast]
  );

  const handleDeselectStroke = useCallback(() => {
    setSelectedStrokeIndex(null);
    if (pipelineRef.current) {
      pipelineRef.current.dirty = true;
    }
    showToast('Deselected Stroke');
  }, [showToast]);

  const handleDeleteSelectedStroke = useCallback(() => {
    const selIdx = selectedStrokeIndexRef.current;
    if (selIdx === null || !strokesRef.current[selIdx]) return;
    const target = strokesRef.current[selIdx];

    if (pipelineRef.current && target.group) {
      pipelineRef.current.root.remove(target.group);
      target.group.traverse((o: any) => {
        if (o.geometry) o.geometry.dispose();
      });
    }

    strokesRef.current.splice(selIdx, 1);
    setSelectedStrokeIndex(null);
    if (pipelineRef.current) {
      pipelineRef.current.dirty = true;
    }
    pushHistoryStep({
      added: [],
      removed: [target],
      label: `Delete Stroke #${selIdx + 1}`,
    });
    showToast('Deleted Stroke');
  }, [pushHistoryStep, showToast]);

  const handleStrokeTransformed = useCallback(
    (_strokeIndex: number, oldStroke: Stroke, newStroke: Stroke) => {
      pushHistoryStep({
        added: [newStroke],
        removed: [oldStroke],
        label: 'Transform Endpoints',
      });
      showToast('Transformed Stroke Endpoints');
    },
    [pushHistoryStep, showToast]
  );

  const handleSymmetryChange = useCallback(
    (newSymmetry: SymmetryMode) => {
      setSymmetry(newSymmetry);
      const selIdx = selectedStrokeIndexRef.current;
      if (selIdx !== null && strokesRef.current[selIdx]) {
        const target = strokesRef.current[selIdx];
        target.symmetry = newSymmetry;
        if (pipelineRef.current) {
          buildStrokeMesh(pipelineRef.current, target, window.innerWidth, window.innerHeight, false);
          pipelineRef.current.dirty = true;
        }
        showToast(`Stroke #${selIdx + 1} Symmetry: ${newSymmetry}`);
      }
    },
    [showToast]
  );

  const handleZoom = useCallback(
    (factor: number) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      setView((v) => {
        const newScale = Math.max(0.2, Math.min(6.0, +(v.scale * factor).toFixed(3)));
        const ratio = newScale / v.scale;
        const nextView = {
          scale: newScale,
          x: cx - (cx - v.x) * ratio,
          y: cy - (cy - v.y) * ratio,
        };
        pipelineRef.current?.applyViewTransform(nextView);
        showToast(`Zoom: ${Math.round(newScale * 100)}%`);
        return nextView;
      });
    },
    [showToast]
  );

  const handleZoomReset = useCallback(() => {
    const nextView = { scale: 1, x: 0, y: 0 };
    setView(nextView);
    pipelineRef.current?.applyViewTransform(nextView);
    showToast('Zoom Reset: 100%');
  }, [showToast]);

  const handlePanNudge = useCallback((dx: number, dy: number) => {
    setView((v) => {
      const nextView = { ...v, x: v.x + dx, y: v.y + dy };
      pipelineRef.current?.applyViewTransform(nextView);
      return nextView;
    });
  }, []);

  const handleBrushWidthNudge = useCallback(
    (delta: number) => {
      setParams((prev) => {
        const newWidth = Math.max(1, Math.min(80, +(prev.width + delta).toFixed(1)));
        showToast(`Brush Width: ${newWidth}px`);
        return { ...prev, width: newWidth };
      });
    },
    [showToast]
  );

  const handleCycleSymmetry = useCallback(() => {
    setSymmetry((cur) => {
      const idx = SYMMETRY_MODES.indexOf(cur);
      const next = SYMMETRY_MODES[(idx + 1) % SYMMETRY_MODES.length];
      showToast(`Symmetry: ${next}`);
      return next;
    });
  }, [showToast]);

  const loadRefImage = useCallback((file: File) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const targetDim = Math.min(window.innerWidth, window.innerHeight) * 0.65;
        const maxDim = Math.max(img.naturalWidth, img.naturalHeight);
        const scale = maxDim > targetDim ? +(targetDim / maxDim).toFixed(2) : 1;
        setRefState({
          src,
          naturalW: img.naturalWidth,
          naturalH: img.naturalHeight,
          scale,
          opacity: 0.4,
          blend: 'normal',
          visible: true,
          x: window.innerWidth / 2 - (img.naturalWidth * scale) / 2,
          y: window.innerHeight / 2 - (img.naturalHeight * scale) / 2,
        });
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  }, []);

  useGlobalShortcuts({
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
  });

  const handleExportImage = async (
    isTransparentPNG: boolean,
    aspect: string,
    res: number,
    framing: 'fit' | 'view'
  ) => {
    if (!pipelineRef.current) return;
    try {
      await exportImage(
        pipelineRef.current,
        strokesRef.current,
        {
          aspectRatio: aspect,
          resolution: res,
          framing,
          isTransparentPNG,
          view,
          params: {
            ...params,
            glow: glowEnabled ? params.glow : 0,
            aberration: aberrationEnabled ? params.aberration : 0,
            noise: noiseEnabled ? params.noise : 0,
          },
          vibe: activeVibe,
          time: performance.now() / 1000,
        },
        setExportStatus
      );
    } catch (err: any) {
      console.error('Export error:', err);
      setExportStatus(`Export error: ${err.message}`);
    }
  };

  const handleExport3D = async (
    format: 'stl' | 'gltf',
    baseStyle: BaseStyle,
    gridRes: number
  ) => {
    if (!pipelineRef.current) return;
    try {
      await export3DModel(
        pipelineRef.current,
        strokesRef.current,
        {
          format,
          baseStyle,
          gridRes,
          params,
          vibe: activeVibe,
        },
        setExportStatus
      );
    } catch (err: any) {
      console.error('3D Export error:', err);
      setExportStatus(`3D Export error: ${err.message}`);
    }
  };

  return (
    <>
      <CanvasStage
        pipelineRef={pipelineRef}
        strokesRef={strokesRef}
        params={params}
        activeVibe={activeVibe}
        symmetry={symmetry}
        guideColor={activeVibe.theme.guideColor}
        view={view}
        onViewChange={setView}
        refState={refState}
        mode3d={mode3d}
        panMode={panMode}
        animOn={animOn}
        autoOrbit={autoOrbit}
        glowEnabled={glowEnabled}
        aberrationEnabled={aberrationEnabled}
        toolMode={toolMode}
        eraserSize={eraserSize}
        eraserMode={eraserMode}
        selectedStrokeIndex={selectedStrokeIndex}
        onSelectStroke={handleSelectStroke}
        onStrokeAdded={handleStrokeAdded}
        onStrokeTransformed={handleStrokeTransformed}
        onErasePerformed={handleErasePerformed}
      />

      {noiseEnabled && <NoiseOverlay intensity={params.noise} />}

      <UIMetaballLayer />

      {panelVisible ? (
        <ControlPanel
          params={params}
          onParamChange={handleParamChange}
          currentVibe={currentVibe}
          onVibeChange={handleVibeChange}
          vibeData={activeVibe}
          bgColor={currentBgHex}
          onBgColorChange={handleBgColorChange}
          onResetBgColor={handleResetBgColor}
          isCustomBg={customBgColor !== null}
          symmetry={symmetry}
          onSymmetryChange={handleSymmetryChange}
          onClear={handleClear}
          glowEnabled={glowEnabled}
          onToggleGlow={() => {
            setGlowEnabled((v) => {
              showToast(!v ? 'Star Glow: On' : 'Star Glow: Off');
              return !v;
            });
          }}
          aberrationEnabled={aberrationEnabled}
          onToggleAberration={() => {
            setAberrationEnabled((v) => {
              showToast(!v ? 'Aberration: On' : 'Aberration: Off');
              return !v;
            });
          }}
          noiseEnabled={noiseEnabled}
          onToggleNoise={() => {
            setNoiseEnabled((v) => {
              showToast(!v ? 'Film Noise: On' : 'Film Noise: Off');
              return !v;
            });
          }}
          refState={refState}
          onLoadRefFile={loadRefImage}
          onUpdateRef={(partial) => setRefState((prev) => ({ ...prev, ...partial }))}
          onCenterRef={() => {
            if (!refState.src) return;
            setRefState((prev) => ({
              ...prev,
              x: window.innerWidth / 2 - (prev.naturalW * prev.scale) / 2,
              y: window.innerHeight / 2 - (prev.naturalH * prev.scale) / 2,
            }));
          }}
          onClearRef={() => {
            setRefState((prev) => ({ ...prev, src: '', visible: false }));
          }}
          onExportImage={handleExportImage}
          onExport3D={handleExport3D}
          exportStatus={exportStatus}
          onGenerateSigil={handleGenerateSigil}
          onAddThorns={handleAddThorns}
          onAddSpikes={handleAddSpikes}
          sigilStyle={sigilStyle}
          onSigilStyleChange={setSigilStyle}
          selectedStrokeIndex={selectedStrokeIndex}
          onDeselectStroke={handleDeselectStroke}
          onDeleteSelectedStroke={handleDeleteSelectedStroke}
          toolMode={toolMode}
          onToolModeChange={(m) => {
            setToolMode(m);
            showToast(
              m === 'select'
                ? 'Tool: Select & Modify (S)'
                : m === 'eraser'
                ? 'Tool: Eraser (E)'
                : 'Tool: Brush (B)'
            );
          }}
          eraserSize={eraserSize}
          onEraserSizeChange={setEraserSize}
          eraserMode={eraserMode}
          onEraserModeChange={setEraserMode}
          onOpenShortcuts={() => setShortcutsModalOpen(true)}
          onOpenDocs={() => setDocsModalOpen(true)}
          onToggleCollapse={() => {
            setPanelVisible(false);
            showToast('Panel: Hidden (Tab / P)');
          }}
        />
      ) : (
        <button
          className="panel-toggle-btn"
          onClick={() => {
            setPanelVisible(true);
            showToast('Panel: Shown');
          }}
          title="Show Controls (Tab or P)"
        >
          <span>◨</span>
          <span>Controls (Tab)</span>
        </button>
      )}

      <GlobalToolsDock
        canUndo={historyState.currentStep > 0}
        canRedo={historyState.totalSteps > historyState.currentStep}
        onUndo={handleUndo}
        onRedo={handleRedo}
        erasing={toolMode === 'eraser'}
        onToggleErase={handleToggleEraser}
        animationOn={animOn}
        onToggleAnimation={handleToggleAnimation}
        mode3d={mode3d}
        onToggle3D={handleToggle3D}
        orbitOn={autoOrbit}
        onToggleOrbit={handleToggleOrbit}
        zoomScale={view.scale}
        onZoomIn={() => handleZoom(1.2)}
        onZoomOut={() => handleZoom(0.83)}
        onZoomReset={handleZoomReset}
        panMode={panMode}
        onTogglePan={handleTogglePanMode}
        timelineVisible={timelineVisible}
      />

      <ToastStack toasts={toasts} />

      <TimelineDeck
        currentStep={historyState.currentStep}
        totalSteps={historyState.totalSteps}
        currentLabel={historyState.currentLabel}
        strokeCount={historyState.strokeCount}
        onJumpToStep={handleJumpToStep}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={historyState.currentStep > 0}
        canRedo={historyState.totalSteps > historyState.currentStep}
        isPlaying={isPlaying}
        onTogglePlay={handleTogglePlay}
        speed={replaySpeed}
        onSpeedChange={setReplaySpeed}
        isLooping={isLooping}
        onToggleLoop={() => setIsLooping((v) => !v)}
        visible={timelineVisible}
        onToggleVisible={() => setTimelineVisible((v) => !v)}
      />

      <ShortcutsModal
        isOpen={shortcutsModalOpen}
        onClose={() => setShortcutsModalOpen(false)}
      />

      <DocsModal
        isOpen={docsModalOpen}
        onClose={() => setDocsModalOpen(false)}
        activeVibe={activeVibe}
        currentVibeName={currentVibe}
        initialParams={params}
        canvasStrokes={strokesRef.current}
        onApplyParams={(newParams) => {
          setParams(newParams);
          strokesRef.current.forEach((s) => {
            s.params = { ...newParams };
            if (pipelineRef.current) {
              buildStrokeMesh(
                pipelineRef.current,
                s,
                window.innerWidth,
                window.innerHeight,
                false
              );
            }
          });
          if (pipelineRef.current) {
            pipelineRef.current.dirty = true;
          }
          showToast('Applied Playground Parameters to Canvas');
        }}
      />
    </>
  );
};
