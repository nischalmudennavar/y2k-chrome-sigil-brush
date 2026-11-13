import React from 'react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  keys: string[];
  desc: string;
}

interface ShortcutGroup {
  category: string;
  items: ShortcutItem[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    category: 'Drawing & Brush',
    items: [
      { keys: ['['], desc: 'Decrease Brush Width (−2px, Shift for −10)' },
      { keys: [']'], desc: 'Increase Brush Width (+2px, Shift for +10)' },
      { keys: ['X'], desc: 'Cycle Symmetry (None, Mirror, Radial)' },
      { keys: ['Ctrl', 'Z'], desc: 'Undo Stroke' },
      { keys: ['Ctrl', 'Shift', 'Z'], desc: 'Redo Stroke (or Ctrl+Y)' },
      { keys: ['Shift', 'C'], desc: 'Clear Canvas' },
    ],
  },
  {
    category: 'Canvas & Navigation',
    items: [
      { keys: ['+'], desc: 'Zoom In (or Wheel Up)' },
      { keys: ['−'], desc: 'Zoom Out (or Wheel Down)' },
      { keys: ['0', 'or', 'F'], desc: 'Reset Zoom & Center View' },
      { keys: ['Space', '+ Drag'], desc: 'Pan Canvas (or Middle Click)' },
      { keys: ['H'], desc: 'Toggle Hand / Pan Mode' },
      { keys: ['↑', '↓', '←', '→'], desc: 'Nudge View (Shift for larger step)' },
      { keys: ['3', 'or', 'D'], desc: 'Toggle 3D Perspective Mode' },
      { keys: ['O'], desc: 'Toggle 3D Auto-Orbit' },
    ],
  },
  {
    category: 'Aesthetic & Effects',
    items: [
      { keys: ['V'], desc: 'Cycle Aesthetic Vibe (Shift+V for Prev)' },
      { keys: ['A'], desc: 'Toggle Shimmer / Specular Animation' },
      { keys: ['G'], desc: 'Toggle Star Glow Post-Filter' },
      { keys: ['B'], desc: 'Toggle Chromatic Aberration' },
      { keys: ['N'], desc: 'Toggle Film Noise / Scratches' },
    ],
  },
  {
    category: 'Interface',
    items: [
      { keys: ['Tab', 'or', 'P'], desc: 'Toggle HUD Control Panel' },
      { keys: ['?', 'or', '/'], desc: 'Show / Hide This Cheat Sheet' },
      { keys: ['Esc'], desc: 'Close Modal / Deselect Tools' },
    ],
  },
];

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      className="shortcuts-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard Shortcuts"
    >
      <div className="shortcuts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-header">
          <div className="shortcuts-title-row">
            <span className="shortcuts-badge">Y2K HUD</span>
            <span className="shortcuts-title">Keyboard Command Deck</span>
          </div>
          <button className="shortcuts-close-btn" onClick={onClose} aria-label="Close dialog">
            ✕
          </button>
        </div>

        <div className="shortcuts-body">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.category} className="shortcuts-group">
              <div className="shortcuts-group-title">{group.category}</div>
              <div className="shortcuts-list">
                {group.items.map((item, idx) => (
                  <div key={idx} className="shortcuts-row">
                    <div className="shortcuts-keys">
                      {item.keys.map((k, ki) =>
                        k === 'or' ? (
                          <span key={ki} className="shortcuts-key-sep">
                            or
                          </span>
                        ) : (
                          <kbd key={ki} className="shortcuts-kbd">
                            {k}
                          </kbd>
                        )
                      )}
                    </div>
                    <span className="shortcuts-desc">{item.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="shortcuts-footer">
          <span className="shortcuts-footer-tip">
            Tip: Press <kbd className="shortcuts-kbd mini">?</kbd> anytime to toggle this deck
          </span>
          <button className="shortcuts-done-btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
