import { useCallback, useEffect, useMemo, useState } from 'react';
import { BrushParams, VibePreset } from '../types';
import { PAL, hexToRgb01, rgb01ToHex } from '../constants/presets';
import { RenderPipeline } from '../core/renderPipeline';

interface UseThemeVibeOptions {
  pipelineRef: React.MutableRefObject<RenderPipeline | null>;
  setParams: React.Dispatch<React.SetStateAction<BrushParams>>;
  showToast: (msg: string) => void;
}

export function useThemeVibe({ pipelineRef, setParams, showToast }: UseThemeVibeOptions) {
  const [currentVibe, setCurrentVibe] = useState<string>('Black Mercury');
  const [customBgColor, setCustomBgColor] = useState<string | null>(null);

  const baseVibe = PAL[currentVibe] || PAL['Black Mercury'] || PAL['Pink K-Pop'];
  const activeVibe = useMemo<VibePreset>(() => {
    if (!customBgColor) return baseVibe;
    const rgb = hexToRgb01(customBgColor);
    return {
      ...baseVibe,
      bg: rgb,
      theme: {
        ...baseVibe.theme,
        bg: customBgColor,
      },
    };
  }, [baseVibe, customBgColor]);

  const currentBgHex = customBgColor || activeVibe.theme?.bg || rgb01ToHex(activeVibe.bg);

  const applyVibeStyles = useCallback(
    (vibeName: string, customBg?: string | null) => {
      const pData = PAL[vibeName];
      if (!pData) return;
      const t = pData.theme || {};
      const rootStyle = document.documentElement.style;
      if (t.accent) rootStyle.setProperty('--accent', t.accent);
      if (t.accentGlow) rootStyle.setProperty('--accent-glow', t.accentGlow);
      if (t.accentTrack) rootStyle.setProperty('--accent-track', t.accentTrack);
      if (t.accentAmbient) rootStyle.setProperty('--accent-ambient', t.accentAmbient);

      const bgToApply = customBg || t.bg || rgb01ToHex(pData.bg);
      rootStyle.setProperty('--bg', bgToApply);
      document.body.style.backgroundColor = bgToApply;

      if (t.panelBg) rootStyle.setProperty('--panel-bg', t.panelBg);
      if (t.panelBorder) rootStyle.setProperty('--panel-border', t.panelBorder);
      if (t.panelBorderTop) rootStyle.setProperty('--panel-border-top', t.panelBorderTop);
      if (t.readoutColor) rootStyle.setProperty('--readout-color', t.readoutColor);
      if (t.readoutBg) rootStyle.setProperty('--readout-bg', t.readoutBg);
      if (t.tabActiveBg) rootStyle.setProperty('--tab-active-bg', t.tabActiveBg);
      if (t.tabBorderTop) rootStyle.setProperty('--tab-border-top', t.tabBorderTop);
      if (t.toggleActiveBg) rootStyle.setProperty('--toggle-active-bg', t.toggleActiveBg);

      const effectiveVibe: VibePreset = customBg
        ? {
            ...pData,
            bg: hexToRgb01(customBg),
            theme: { ...pData.theme, bg: customBg },
          }
        : pData;

      if (pipelineRef.current) {
        pipelineRef.current.applyTheme(effectiveVibe);
      }
    },
    [pipelineRef]
  );

  const handleVibeChange = useCallback(
    (vibeName: string) => {
      if (!PAL[vibeName]) return;
      setCurrentVibe(vibeName);
      setCustomBgColor(null);
      const pData = PAL[vibeName];
      setParams((prev) => ({
        ...prev,
        ...(pData.params || {}),
      }));
      applyVibeStyles(vibeName, null);
      showToast(`Vibe: ${vibeName}`);
    },
    [applyVibeStyles, setParams, showToast]
  );

  const handleBgColorChange = useCallback(
    (hex: string) => {
      setCustomBgColor(hex);
      const rgb = hexToRgb01(hex);
      const updatedVibe: VibePreset = {
        ...activeVibe,
        bg: rgb,
        theme: {
          ...activeVibe.theme,
          bg: hex,
        },
      };
      document.documentElement.style.setProperty('--bg', hex);
      document.body.style.backgroundColor = hex;
      if (pipelineRef.current) {
        pipelineRef.current.applyTheme(updatedVibe);
        pipelineRef.current.dirty = true;
      }
      showToast(`Background: ${hex.toUpperCase()}`);
    },
    [activeVibe, pipelineRef, showToast]
  );

  const handleResetBgColor = useCallback(() => {
    setCustomBgColor(null);
    const defaultHex = baseVibe.theme?.bg || rgb01ToHex(baseVibe.bg);
    document.documentElement.style.setProperty('--bg', defaultHex);
    document.body.style.backgroundColor = defaultHex;
    if (pipelineRef.current) {
      pipelineRef.current.applyTheme(baseVibe);
      pipelineRef.current.dirty = true;
    }
    showToast(`Background: Default (${baseVibe.badge || 'VIBE'})`);
  }, [baseVibe, pipelineRef, showToast]);

  const handleCycleVibe = useCallback(
    (reverse: boolean = false) => {
      const keys = Object.keys(PAL);
      setCurrentVibe((cur) => {
        const idx = keys.indexOf(cur);
        const nextIdx = reverse ? (idx - 1 + keys.length) % keys.length : (idx + 1) % keys.length;
        const nextKey = keys[nextIdx];
        const pData = PAL[nextKey];
        setParams((prev) => ({
          ...prev,
          ...(pData.params || {}),
        }));
        applyVibeStyles(nextKey);
        showToast(`Vibe: ${nextKey}`);
        return nextKey;
      });
    },
    [applyVibeStyles, setParams, showToast]
  );

  useEffect(() => {
    applyVibeStyles(currentVibe, customBgColor);
  }, [currentVibe, customBgColor, applyVibeStyles]);

  return {
    currentVibe,
    customBgColor,
    activeVibe,
    currentBgHex,
    handleVibeChange,
    handleBgColorChange,
    handleResetBgColor,
    handleCycleVibe,
  };
}
