import React, { useState } from 'react';
import { BrushParams, RefImageState, SymmetryMode, VibePreset } from '../types';
import { PAL, PARAM_DEFS, SYMMETRY_MODES } from '../constants/presets';
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

  // Export
  onExportImage: (isTransparentPNG: boolean, aspect: string, res: number, framing: 'fit' | 'view') => void;
  onExport3D: (format: 'stl' | 'gltf', baseStyle: 'solid' | 'surface', gridRes: number) => void;
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
}) => {
  const [activeTab, setActiveTab] = useState<'brush' | 'chrome' | 'comp' | 'ref' | 'export'>('brush');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Export options state
  const [expAspect, setExpAspect] = useState<string>('1:1');
  const [expRes, setExpRes] = useState<number>(2048);
  const [expFraming, setExpFraming] = useState<'fit' | 'view'>('fit');
  const [exp3dBase, setExp3dBase] = useState<'solid' | 'surface'>('solid');
  const [exp3dRes, setExp3dRes] = useState<number>(256);

  const brushDefs = PARAM_DEFS.filter((d) => d.category === 'brush');
  const chromeDefs = PARAM_DEFS.filter((d) => d.category === 'chrome');
  const compDefs = PARAM_DEFS.filter((d) => d.category === 'comp');

  return (
    <div id="panel">
      {/* Vibe & Style Deck Header */}
      <div className="vibe-card">
        <div className="vibe-header">
          <span className="vibe-title">Aesthetic Vibe</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {onOpenShortcuts && (
              <button
                className="shortcuts-trigger-btn"
                onClick={onOpenShortcuts}
                title="Keyboard Shortcuts (? or /)"
                style={{
                  padding: '2px 7px',
                  fontSize: '10px',
                  fontWeight: 700,
                  borderRadius: '4px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.18)',
                  color: 'var(--readout-color)',
                  cursor: 'pointer',
                  letterSpacing: '0.04em',
                }}
              >
                ⌨ Keys
              </button>
            )}
            <span className="vibe-badge" id="vibeBadge">
              {vibeData.badge || 'VIBE'}
            </span>
          </div>
        </div>
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
      </div>

      {/* Tactile Category Tabs */}
      <div className="tab-bar">
        <button
          className={`tab-btn ${activeTab === 'brush' ? 'active' : ''}`}
          onClick={() => setActiveTab('brush')}
        >
          Brush
        </button>
        <button
          className={`tab-btn ${activeTab === 'chrome' ? 'active' : ''}`}
          onClick={() => setActiveTab('chrome')}
        >
          Chrome
        </button>
        <button
          className={`tab-btn ${activeTab === 'comp' ? 'active' : ''}`}
          onClick={() => setActiveTab('comp')}
        >
          Comp
        </button>
        <button
          className={`tab-btn ${activeTab === 'ref' ? 'active' : ''}`}
          onClick={() => setActiveTab('ref')}
        >
          Ref
        </button>
        <button
          className={`tab-btn ${activeTab === 'export' ? 'active' : ''}`}
          onClick={() => setActiveTab('export')}
        >
          Export
        </button>
      </div>

      {/* Tab 1: Brush */}
      {activeTab === 'brush' && (
        <div id="tab-brush" className="tab-pane active">
          {/* Zoom & Pan Controls */}
          <div className="zoom-bar">
            <button id="btnZoomOut" title="Zoom Out (Wheel Down)" onClick={onZoomOut}>
              −
            </button>
            <button id="btnZoomReset" title="Reset Zoom" onClick={onZoomReset}>
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

          <div className="buttons">
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
            <button id="clear" onClick={onClear} title="Clear Canvas (Shift+C)">
              Clear
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
            <label>Base Style</label>
            <select
              value={exp3dBase}
              onChange={(e) => setExp3dBase(e.target.value as 'solid' | 'surface')}
            >
              <option value="solid">Solid Plinth (Watertight 3D Print)</option>
              <option value="surface">Relief Surface (Mesh Only)</option>
            </select>
          </div>

          <div className="row">
            <label>Mesh Density</label>
            <select
              value={exp3dRes}
              onChange={(e) => setExp3dRes(parseInt(e.target.value, 10))}
            >
              <option value="256">Fine (256x256 Grid)</option>
              <option value="180">Standard (180x180 Grid)</option>
              <option value="360">Ultra Fine (360x360 Grid)</option>
            </select>
          </div>

          <div className="buttons" style={{ marginTop: 6 }}>
            <button
              className="export-btn"
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
            STL produces watertight solid manifold mesh for 3D slicers. GLTF includes metallic PBR chrome material for 3D viewers and Blender.
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
