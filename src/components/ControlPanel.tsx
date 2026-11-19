import React, { useState } from 'react';
import { BrushParams, EraserMode, RefImageState, SymmetryMode, ToolMode, VibePreset } from '../types';
import { PAL, PARAM_DEFS, SYMMETRY_MODES } from '../constants/presets';
import { BaseStyle } from '../core/export';
import { SigilStyle } from '../core/sigilGenerator';
import { SliderRow } from './SliderRow';

interface ControlPanelProps {
  params: BrushParams;
  onParamChange: (key: string, value: number) => void;
  currentVibe: string;
  onVibeChange: (vibeName: string) => void;
  vibeData: VibePreset;

  // Symmetry
  symmetry: SymmetryMode;
  onSymmetryChange: (sym: SymmetryMode) => void;

  // Actions
  onUndo: () => void;
  onRedo?: () => void;
  canRedo?: boolean;
  onClear: () => void;
  onOpenShortcuts?: () => void;

  // 3D / Anim
  animOn: boolean;
  onToggleAnim: () => void;
  mode3d: boolean;
  onToggle3D: () => void;
  autoOrbit: boolean;
  onToggleOrbit: () => void;

  // Zoom / Pan
  zoomScale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  panMode: boolean;
  onTogglePanMode: () => void;

  // Comp FX Toggles
  glowEnabled: boolean;
  onToggleGlow: () => void;
  aberrationEnabled: boolean;
  onToggleAberration: () => void;
  noiseEnabled: boolean;
  onToggleNoise: () => void;

  // Reference Image
  refState: RefImageState;
  onLoadRefFile: (file: File) => void;
  onUpdateRef: (partial: Partial<RefImageState>) => void;
  onCenterRef: () => void;
  onClearRef: () => void;

  // Procedural Generator
  onGenerateSigil: (style?: SigilStyle) => void;
  onAddSpikes?: () => void;
  sigilStyle: SigilStyle;
  onSigilStyleChange: (style: SigilStyle) => void;

  // Tool & Eraser
  toolMode: ToolMode;
  onToolModeChange: (mode: ToolMode) => void;
  eraserSize: number;
  onEraserSizeChange: (size: number) => void;
  eraserMode: EraserMode;
  onEraserModeChange: (mode: EraserMode) => void;

  // Export
  onExportImage: (isTransparentPNG: boolean, aspect: string, res: number, framing: 'fit' | 'view') => void;
  onExport3D: (format: 'stl' | 'gltf', baseStyle: BaseStyle, gridRes: number) => void;
  exportStatus?: string;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  params,
  onParamChange,
  currentVibe,
  onVibeChange,
  vibeData,
  symmetry,
  onSymmetryChange,
  onUndo,
  onRedo,
  canRedo = false,
  onClear,
  onOpenShortcuts,
  animOn,
  onToggleAnim,
  mode3d,
  onToggle3D,
  autoOrbit,
  onToggleOrbit,
  zoomScale,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  panMode,
  onTogglePanMode,
  glowEnabled,
  onToggleGlow,
  aberrationEnabled,
  onToggleAberration,
  noiseEnabled,
  onToggleNoise,
  refState,
  onLoadRefFile,
  onUpdateRef,
  onCenterRef,
  onClearRef,
  onExportImage,
  onExport3D,
  exportStatus,
  onGenerateSigil,
  onAddSpikes,
  sigilStyle,
  onSigilStyleChange,
  toolMode,
  onToolModeChange,
  eraserSize,
  onEraserSizeChange,
  eraserMode,
  onEraserModeChange,
}) => {
  const [activeTab, setActiveTab] = useState<'brush' | 'chrome' | 'comp' | 'ref' | 'export'>('brush');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // 1-Step confirmation for destructive Clear action (UX-03)
  const [clearConfirming, setClearConfirming] = useState<boolean>(false);
  const clearTimerRef = React.useRef<number | null>(null);

  const handleClearClick = () => {
    if (clearConfirming) {
      if (clearTimerRef.current !== null) {
        window.clearTimeout(clearTimerRef.current);
        clearTimerRef.current = null;
      }
      setClearConfirming(false);
      onClear();
    } else {
      setClearConfirming(true);
      clearTimerRef.current = window.setTimeout(() => {
        setClearConfirming(false);
        clearTimerRef.current = null;
      }, 3500);
    }
  };

  // Export options state
  const [expAspect, setExpAspect] = useState<string>('1:1');
  const [expRes, setExpRes] = useState<number>(2048);
  const [expFraming, setExpFraming] = useState<'fit' | 'view'>('fit');
  const [exp3dBase, setExp3dBase] = useState<BaseStyle>('extruded');
  const [exp3dRes, setExp3dRes] = useState<number>(384);

  const brushDefs = PARAM_DEFS.filter((d) => d.category === 'brush');
  const chromeDefs = PARAM_DEFS.filter((d) => d.category === 'chrome');
  const compDefs = PARAM_DEFS.filter((d) => d.category === 'comp');

  return (
    <div id="panel">
      {/* Vibe & Style Deck Header (UX-06 uncrowded layout) */}
      <div className="vibe-card">
        <div className="vibe-header">
          <span className="vibe-title">Aesthetic Vibe</span>
          {onOpenShortcuts && (
            <button
              className="shortcuts-trigger-btn"
              onClick={onOpenShortcuts}
              title="Keyboard Shortcuts (? or /)"
            >
              Shortcuts (?)
            </button>
          )}
        </div>
        <div className="vibe-select-row">
          <select
            id="vibeSel"
            value={currentVibe}
            onChange={(e) => onVibeChange(e.target.value)}
          >
            {Object.entries(PAL).map(([key, item]) => (
              <option key={key} value={key}>
                {item.name || key}
              </option>
            ))}
          </select>
          <span className="vibe-badge" id="vibeBadge">
            {vibeData.badge || 'VIBE'}
          </span>
        </div>
      </div>

      {/* Segmented Mode Switcher (UX-02) */}
      <div className="tab-bar segmented-control" role="tablist">
        <button
          role="tab"
          aria-selected={activeTab === 'brush'}
          className={`tab-btn ${activeTab === 'brush' ? 'active' : ''}`}
          onClick={() => setActiveTab('brush')}
        >
          Brush
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'chrome'}
          className={`tab-btn ${activeTab === 'chrome' ? 'active' : ''}`}
          onClick={() => setActiveTab('chrome')}
        >
          Chrome
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'comp'}
          className={`tab-btn ${activeTab === 'comp' ? 'active' : ''}`}
          onClick={() => setActiveTab('comp')}
        >
          Comp
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'ref'}
          className={`tab-btn ${activeTab === 'ref' ? 'active' : ''}`}
          onClick={() => setActiveTab('ref')}
        >
          Ref
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'export'}
          className={`tab-btn ${activeTab === 'export' ? 'active' : ''}`}
          onClick={() => setActiveTab('export')}
        >
          Export
        </button>
      </div>

      {/* Tab 1: Brush */}
      {activeTab === 'brush' && (
        <div id="tab-brush" className="tab-pane active">
          {/* Zoom & Pan Viewport Tools (UX-02 distinct grouping) */}
          <div className="viewport-tools">
            <span className="viewport-label">Viewport</span>
            <div className="zoom-bar">
              <button id="btnZoomOut" title="Zoom Out (Wheel Down)" onClick={onZoomOut}>
                −
              </button>
              <button id="btnZoomReset" title="Reset Zoom to 100%" onClick={onZoomReset}>
                {Math.round(zoomScale * 100)}%
              </button>
              <button id="btnZoomIn" title="Zoom In (Wheel Up)" onClick={onZoomIn}>
                +
              </button>
              <button
                id="btnPanMode"
                className={panMode ? 'is-active' : ''}
                title="Pan Canvas (or Hold Spacebar)"
                onClick={onTogglePanMode}
              >
                Pan
              </button>
            </div>
          </div>

          {/* Tool Selector: Brush vs Eraser (No emojis) */}
          <div className="tool-selector">
            <button
              className={`tool-btn ${toolMode === 'brush' ? 'is-active' : ''}`}
              onClick={() => onToolModeChange('brush')}
              title="Draw Liquid Chrome Strokes (Shortcut: B)"
            >
              Brush
            </button>
            <button
              className={`tool-btn ${toolMode === 'eraser' ? 'is-active' : ''}`}
              onClick={() => onToolModeChange('eraser')}
              title="Eraser Brush (Shortcut: E)"
            >
              Eraser
            </button>
          </div>

          {toolMode === 'eraser' ? (
            <div id="rows-eraser">
              <div className="row">
                <label>
                  Eraser Size <span>{Math.round(eraserSize)}px</span>
                </label>
                <input
                  type="range"
                  min="6"
                  max="120"
                  step="2"
                  value={eraserSize}
                  onChange={(e) => onEraserSizeChange(parseFloat(e.target.value))}
                />
              </div>

              <div className="row">
                <label>Eraser Mode</label>
                <select
                  value={eraserMode}
                  onChange={(e) => onEraserModeChange(e.target.value as EraserMode)}
                >
                  <option value="slice">Slice &amp; Carve (Split &amp; Taper)</option>
                  <option value="stroke">Whole Stroke (Delete on Touch)</option>
                </select>
              </div>
            </div>
          ) : (
            <div id="rows-brush">
              {brushDefs.map((def) => (
                <SliderRow
                  key={def.key}
                  def={def}
                  value={params[def.key]}
                  onChange={onParamChange}
                />
              ))}
            </div>
          )}

          <div className="row">
            <label>Symmetry</label>
            <select
              id="sym"
              value={symmetry}
              onChange={(e) => onSymmetryChange(e.target.value as SymmetryMode)}
            >
              {SYMMETRY_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </div>

          {/* Procedural Sigil Generator with Spikes */}
          <div className="row" style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            <label>Sigil Generator</label>
            <select
              value={sigilStyle}
              onChange={(e) => onSigilStyleChange(e.target.value as SigilStyle)}
              title="Select Procedural Sigil Aesthetic"
            >
              <option value="cyber-gothic">Cyber Gothic (Ribs &amp; Stinger)</option>
              <option value="bio-mecha">Bio-Mecha (Fin Blades &amp; Barbs)</option>
              <option value="radial-seal">Radial Seal (Occult Mandala)</option>
              <option value="minimal-blade">Minimal Blade (Scythe Thorns)</option>
            </select>
          </div>

          <div className="buttons w" style={{ marginTop: 6, marginBottom: 8 }}>
            <button
              id="btnRandomSigil"
              onClick={() => onGenerateSigil(sigilStyle)}
              title="Generate Procedural Sigil on Random Path with Spikes (Shortcut: R)"
              style={{
                background: 'linear-gradient(180deg, #443763 0%, #2b2145 48%, #1c1530 52%, #241a3d 100%)',
                borderTopColor: '#a183fa',
                color: '#ece4ff',
              }}
            >
              Random Sigil
            </button>
            {onAddSpikes && (
              <button
                id="btnAddSpikes"
                onClick={onAddSpikes}
                title="Attach Thorn Spikes to Most Recent Stroke (Shortcut: Shift+R)"
              >
                Add Spikes
              </button>
            )}
          </div>

          {/* Action Row: UNDO/REDO paired on left, CLEAR isolated on right with 1-step confirm (UX-03) */}
          <div className="buttons history-actions">
            <div className="undo-redo-group">
              <button id="undo" onClick={onUndo} title="Undo Stroke (Ctrl+Z)">
                Undo
              </button>
              {onRedo && (
                <button
                  id="redo"
                  onClick={onRedo}
                  title="Redo Stroke (Ctrl+Shift+Z / Ctrl+Y)"
                  disabled={!canRedo}
                  style={{ opacity: canRedo ? 1 : 0.4 }}
                >
                  Redo
                </button>
              )}
            </div>
            <button
              id="clear"
              className={`clear-btn ${clearConfirming ? 'confirming' : ''}`}
              onClick={handleClearClick}
              title={clearConfirming ? 'Click again to confirm wipe canvas' : 'Clear Canvas (Shift+C)'}
            >
              {clearConfirming ? 'Confirm?' : 'Clear'}
            </button>
          </div>
        </div>
      )}

      {/* Tab 2: Chrome */}
      {activeTab === 'chrome' && (
        <div id="tab-chrome" className="tab-pane active">
          <div id="rows-chrome">
            {chromeDefs.map((def) => (
              <SliderRow
                key={def.key}
                def={def}
                value={params[def.key]}
                onChange={onParamChange}
              />
            ))}
          </div>

          <div className="row">
            <label>Environment / Vibe</label>
            <select
              id="pal"
              value={currentVibe}
              onChange={(e) => onVibeChange(e.target.value)}
            >
              {Object.entries(PAL).map(([key, item]) => (
                <option key={key} value={key}>
                  {item.name || key}
                </option>
              ))}
            </select>
          </div>

          <div className="buttons w">
            <button
              id="bAnim"
              className={animOn ? 'is-active' : ''}
              onClick={onToggleAnim}
            >
              {`Animation: ${animOn ? 'on' : 'off'}`}
            </button>
            <button
              id="b3d"
              className={mode3d ? 'is-active' : ''}
              onClick={onToggle3D}
            >
              {`3D: ${mode3d ? 'on' : 'off'}`}
            </button>
            {mode3d && (
              <button
                id="bOrb"
                className={autoOrbit ? 'is-active' : ''}
                onClick={onToggleOrbit}
              >
                {`Orbit: ${autoOrbit ? 'on' : 'off'}`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Comp */}
      {activeTab === 'comp' && (
        <div id="tab-comp" className="tab-pane active">
          <div className="buttons w" style={{ marginBottom: 14 }}>
            <button
              id="bCompGlow"
              className={glowEnabled ? 'is-active' : ''}
              onClick={onToggleGlow}
              title="Toggle Star Glow post-process filter"
            >
              {`Glow: ${glowEnabled ? 'on' : 'off'}`}
            </button>
            <button
              id="bCompAb"
              className={aberrationEnabled ? 'is-active' : ''}
              onClick={onToggleAberration}
              title="Toggle Chromatic Aberration filter"
            >
              {`Aberration: ${aberrationEnabled ? 'on' : 'off'}`}
            </button>
            <button
              id="bCompNoise"
              className={noiseEnabled ? 'is-active' : ''}
              onClick={onToggleNoise}
              title="Toggle Film Grain & Analog Noise DOM overlay"
            >
              {`Noise: ${noiseEnabled ? 'on' : 'off'}`}
            </button>
          </div>

          <div id="rows-comp">
            {compDefs.map((def) => {
              const isEnabled =
                def.key === 'glow'
                  ? glowEnabled
                  : def.key === 'aberration'
                  ? aberrationEnabled
                  : def.key === 'noise'
                  ? noiseEnabled
                  : true;
              return (
                <div
                  key={def.key}
                  style={{
                    opacity: isEnabled ? 1 : 0.4,
                    pointerEvents: isEnabled ? 'auto' : 'none',
                    transition: 'opacity 0.2s ease',
                  }}
                >
                  <SliderRow
                    def={def}
                    value={params[def.key]}
                    onChange={onParamChange}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 4: Ref */}
      {activeTab === 'ref' && (
        <div id="tab-ref" className="tab-pane active">
          <div className="ref-header" style={{ marginBottom: 10 }}>
            <span className="ref-label">Reference</span>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files?.[0]) onLoadRefFile(e.target.files[0]);
              }}
            />
            <button
              id="btnLoadRef"
              className="ref-btn-add"
              onClick={() => fileInputRef.current?.click()}
            >
              + Image (⌘V)
            </button>
          </div>

          {refState.src ? (
            <div id="refControls">
              <div className="row">
                <label>
                  Ref Opacity <span>{Math.round(refState.opacity * 100)}%</span>
                </label>
                <input
                  type="range"
                  min="0.05"
                  max="1"
                  step="0.05"
                  value={refState.opacity}
                  onChange={(e) =>
                    onUpdateRef({ opacity: parseFloat(e.target.value) })
                  }
                />
              </div>

              <div className="row">
                <label>
                  Ref Scale <span>{refState.scale.toFixed(2)}x</span>
                </label>
                <input
                  type="range"
                  min="0.2"
                  max="3"
                  step="0.05"
                  value={refState.scale}
                  onChange={(e) =>
                    onUpdateRef({ scale: parseFloat(e.target.value) })
                  }
                />
              </div>

              <div className="row">
                <label>Ref Blend</label>
                <select
                  value={refState.blend}
                  onChange={(e) =>
                    onUpdateRef({
                      blend: e.target.value as 'normal' | 'screen' | 'multiply',
                    })
                  }
                >
                  <option value="normal">Normal</option>
                  <option value="screen">Screen (Dark BG)</option>
                  <option value="multiply">Multiply (Light BG)</option>
                </select>
              </div>

              <div className="buttons">
                <button onClick={onCenterRef}>Center</button>
                <button
                  onClick={() => onUpdateRef({ visible: !refState.visible })}
                >
                  {refState.visible ? 'Hide' : 'Show'}
                </button>
                <button onClick={onClearRef}>Remove</button>
              </div>
            </div>
          ) : (
            <div
              id="refEmptyHint"
              style={{
                fontSize: 11,
                color: '#7d889e',
                lineHeight: 1.55,
                padding: '8px 2px',
              }}
            >
              Paste an image from clipboard (⌘V / Ctrl+V), drag &amp; drop onto canvas, or click{' '}
              <strong>+ Image</strong> to trace existing sigils.
            </div>
          )}
        </div>
      )}

      {/* Tab 5: Export */}
      {activeTab === 'export' && (
        <div id="tab-export" className="tab-pane active">
          <div className="export-section-title">Image Export</div>
          <div className="row">
            <label>Aspect Ratio</label>
            <select
              value={expAspect}
              onChange={(e) => setExpAspect(e.target.value)}
            >
              <option value="1:1">1:1 Square (2048x2048)</option>
              <option value="4:5">4:5 Portrait (1638x2048)</option>
              <option value="9:16">9:16 Story / Reels (1152x2048)</option>
              <option value="16:9">16:9 Landscape (2048x1152)</option>
              <option value="4:3">4:3 Classic (2048x1536)</option>
              <option value="auto">Viewport / Screen View</option>
            </select>
          </div>

          <div className="row">
            <label>Resolution</label>
            <select
              value={expRes}
              onChange={(e) => setExpRes(parseInt(e.target.value, 10))}
            >
              <option value="2048">Ultra HD (2048px)</option>
              <option value="1536">High Res (1536px)</option>
              <option value="1024">Standard (1024px)</option>
            </select>
          </div>

          <div className="row">
            <label>Framing</label>
            <select
              value={expFraming}
              onChange={(e) => setExpFraming(e.target.value as 'fit' | 'view')}
            >
              <option value="fit">Auto Fit (Centered)</option>
              <option value="view">Current Viewport</option>
            </select>
          </div>

          <div className="buttons" style={{ marginTop: 6 }}>
            <button
              className="export-btn export-btn-accent"
              onClick={() => onExportImage(true, expAspect, expRes, expFraming)}
            >
              PNG (Object Only)
            </button>
            <button
              className="export-btn"
              onClick={() => onExportImage(false, expAspect, expRes, expFraming)}
            >
              JPEG (Full Art)
            </button>
          </div>
          <div className="export-hint">
            PNG exports isolated chrome object with alpha transparency. JPEG includes active vibe background, star flares, and analog film grain.
          </div>

          <div className="export-section-title">3D Model &amp; Print</div>
          <div className="row">
            <label>3D Style</label>
            <select
              value={exp3dBase}
              onChange={(e) => setExp3dBase(e.target.value as BaseStyle)}
            >
              <option value="extruded">Extruded Sigil (Flat SVG/PNG Style - No Brim)</option>
              <option value="sigil">Chiseled 3D Sigil (Sculpted Relief - No Brim)</option>
              <option value="sigil-surface">Chiseled Surface (Mesh Only - No Brim)</option>
              <option value="solid">Solid Plinth (With Base Block)</option>
              <option value="surface">Relief Surface (With Base Grid)</option>
            </select>
          </div>

          <div className="row">
            <label>Mesh Density</label>
            <select
              value={exp3dRes}
              onChange={(e) => setExp3dRes(parseInt(e.target.value, 10))}
            >
              <option value="384">Ultra Detail (384x384 - Recommended)</option>
              <option value="512">Master HD (512x512)</option>
              <option value="256">Standard (256x256)</option>
              <option value="180">Draft (180x180)</option>
            </select>
          </div>

          <div className="buttons" style={{ marginTop: 6 }}>
            <button
              className="export-btn export-btn-accent"
              onClick={() => onExport3D('stl', exp3dBase, exp3dRes)}
            >
              STL (.stl 3D Print)
            </button>
            <button
              className="export-btn"
              onClick={() => onExport3D('gltf', exp3dBase, exp3dRes)}
            >
              GLTF (.glb PBR)
            </button>
          </div>
          <div className="export-hint">
            "Extruded Sigil" produces a clean, flat 3D solid from the exact vector stroke silhouette (like extruding an SVG/PNG), with vertical walls and zero support brim.
          </div>

          {exportStatus && <div className="export-status">{exportStatus}</div>}
        </div>
      )}

      <div className="hint">
        Drag to draw. Pinch or scroll wheel to zoom. Hold Spacebar to pan. Paste (⌘V) or load a reference image to trace sigils. Pen pressure changes thickness. Ctrl/Cmd+Z to undo.
      </div>
    </div>
  );
};
