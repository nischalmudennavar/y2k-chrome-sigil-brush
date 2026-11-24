import { useCallback, useState } from 'react';
import { BrushParams, HistoryStep, Stroke, SymmetryMode } from '../types';
import { RenderPipeline } from '../core/renderPipeline';
import { buildStrokeMesh } from '../core/geometry';
import {
  addSpikesToExistingStroke,
  addStraightThornsToExistingStroke,
  generateRandomSigil,
  SigilStyle,
} from '../core/sigilGenerator';

interface UseSigilActionsOptions {
  pipelineRef: React.MutableRefObject<RenderPipeline | null>;
  strokesRef: React.MutableRefObject<Stroke[]>;
  selectedStrokeIndexRef: React.MutableRefObject<number | null>;
  params: BrushParams;
  symmetry: SymmetryMode;
  setSymmetry: React.Dispatch<React.SetStateAction<SymmetryMode>>;
  pushHistoryStep: (step: HistoryStep, options?: { disposeRedo?: boolean }) => void;
  showToast: (msg: string) => void;
}

const STYLE_NAMES: Record<SigilStyle, string> = {
  'cyber-gothic': 'Cyber Gothic',
  'bio-mecha': 'Bio-Mecha',
  'radial-seal': 'Radial Seal',
  'minimal-blade': 'Minimal Blade',
};

export function useSigilActions({
  pipelineRef,
  strokesRef,
  selectedStrokeIndexRef,
  params,
  symmetry,
  setSymmetry,
  pushHistoryStep,
  showToast,
}: UseSigilActionsOptions) {
  const [sigilStyle, setSigilStyle] = useState<SigilStyle>('cyber-gothic');

  const handleGenerateSigil = useCallback(
    (style?: SigilStyle) => {
      if (!pipelineRef.current) return;

      const removed = strokesRef.current.splice(0);
      removed.forEach((s) => {
        if (s.group) pipelineRef.current?.root.remove(s.group);
      });

      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const scale = Math.min(cx, cy) * 0.72;
      const chosenStyle = style || sigilStyle;

      let activeSym = symmetry;
      if (chosenStyle === 'radial-seal') {
        if (!activeSym.startsWith('Radial')) {
          activeSym = 'Radial 4';
          setSymmetry('Radial 4');
        }
      } else if (activeSym === 'None') {
        activeSym = 'Mirror X';
        setSymmetry('Mirror X');
      }

      const generated = generateRandomSigil({
        center: { x: cx, y: cy },
        scale,
        symmetry: activeSym,
        style: chosenStyle,
        spikeDensity: 0.75,
        spikeLength: 1.05,
        brushParams: params,
      });

      generated.forEach((s) => {
        buildStrokeMesh(pipelineRef.current!, s, window.innerWidth, window.innerHeight, false);
      });

      strokesRef.current.push(...generated);
      pipelineRef.current.dirty = true;
      pushHistoryStep({
        added: generated,
        removed,
        label: `Sigil (${STYLE_NAMES[chosenStyle]})`,
      });

      showToast(`Generated ${STYLE_NAMES[chosenStyle]} Sigil`);
    },
    [params, pipelineRef, pushHistoryStep, setSymmetry, showToast, sigilStyle, strokesRef, symmetry]
  );

  const attachToTargetStroke = useCallback(
    (kind: 'thorns' | 'spikes') => {
      if (!pipelineRef.current || strokesRef.current.length === 0) {
        showToast(
          kind === 'thorns'
            ? 'Draw a stroke first to attach straight thorns'
            : 'Draw a stroke first to attach spikes'
        );
        return;
      }

      const selIdx = selectedStrokeIndexRef.current;
      const targetIdx =
        selIdx !== null && strokesRef.current[selIdx] ? selIdx : strokesRef.current.length - 1;
      const target = strokesRef.current[targetIdx];

      const newStrokes =
        kind === 'thorns'
          ? addStraightThornsToExistingStroke(target, 8, 1.15, 'alternating', 75)
          : addSpikesToExistingStroke(target, 6, 1.15);

      if (newStrokes.length === 0) {
        showToast(
          kind === 'thorns'
            ? 'Could not attach thorns to stroke'
            : 'Could not attach spikes to stroke'
        );
        return;
      }

      newStrokes.forEach((s) => {
        buildStrokeMesh(pipelineRef.current!, s, window.innerWidth, window.innerHeight, false);
      });

      strokesRef.current.push(...newStrokes);
      pipelineRef.current.dirty = true;
      pushHistoryStep({
        added: newStrokes,
        removed: [],
        label:
          kind === 'thorns'
            ? `Attached Straight Thorns to Stroke #${targetIdx + 1}`
            : `Attached Spikes to Stroke #${targetIdx + 1}`,
      });
      showToast(
        kind === 'thorns'
          ? `Attached Straight Thorns to Stroke #${targetIdx + 1}`
          : `Attached Spikes to Stroke #${targetIdx + 1}`
      );
    },
    [pipelineRef, pushHistoryStep, selectedStrokeIndexRef, showToast, strokesRef]
  );

  const handleAddThorns = useCallback(() => attachToTargetStroke('thorns'), [attachToTargetStroke]);
  const handleAddSpikes = useCallback(() => attachToTargetStroke('spikes'), [attachToTargetStroke]);

  return {
    sigilStyle,
    setSigilStyle,
    handleGenerateSigil,
    handleAddThorns,
    handleAddSpikes,
  };
}
