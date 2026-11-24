import { useCallback, useEffect, useState } from 'react';

export type ResizeDirection = 'right' | 'left' | 'bottom' | 'corner-br' | 'corner-tl';

interface UseResizablePanelOptions {
  initialWidth?: number | null;
  initialHeight?: number | null;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
}

export function useResizablePanel({
  initialWidth = null,
  initialHeight = null,
  minWidth = 240,
  maxWidth = 800,
  minHeight = 200,
  maxHeight = 900,
}: UseResizablePanelOptions) {
  const [size, setSize] = useState<{ width: number | null; height: number | null }>({
    width: initialWidth,
    height: initialHeight,
  });

  useEffect(() => {
    const clampToViewport = () => {
      setSize((prev) => {
        const vwMax = Math.max(minWidth, window.innerWidth - 36);
        const vhMax = Math.max(minHeight, window.innerHeight - 36);
        const nextW =
          prev.width !== null
            ? Math.min(Math.min(maxWidth, vwMax), Math.max(minWidth, prev.width))
            : null;
        const nextH =
          prev.height !== null
            ? Math.min(Math.min(maxHeight, vhMax), Math.max(minHeight, prev.height))
            : null;
        if (nextW === prev.width && nextH === prev.height) return prev;
        return { width: nextW, height: nextH };
      });
    };
    window.addEventListener('resize', clampToViewport);
    return () => window.removeEventListener('resize', clampToViewport);
  }, [minWidth, maxWidth, minHeight, maxHeight]);

  const startResize = useCallback(
    (direction: ResizeDirection) => (e: React.PointerEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();

      const panelEl = (e.currentTarget as HTMLElement).parentElement;
      const rect = panelEl?.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = size.width ?? rect?.width ?? minWidth;
      const startH = size.height ?? rect?.height ?? minHeight;

      const onPointerMove = (moveEvent: PointerEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        const vwMax = Math.max(minWidth, window.innerWidth - 36);
        const vhMax = Math.max(minHeight, window.innerHeight - 36);
        const effMaxW = Math.min(maxWidth, vwMax);
        const effMaxH = Math.min(maxHeight, vhMax);

        setSize((prev) => {
          let nextW = prev.width;
          let nextH = prev.height;

          if (direction === 'right' || direction === 'corner-br') {
            nextW = Math.round(Math.min(effMaxW, Math.max(minWidth, startW + dx)));
          } else if (direction === 'left' || direction === 'corner-tl') {
            nextW = Math.round(Math.min(effMaxW, Math.max(minWidth, startW - dx)));
          }

          if (direction === 'bottom' || direction === 'corner-br') {
            nextH = Math.round(Math.min(effMaxH, Math.max(minHeight, startH + dy)));
          } else if (direction === 'corner-tl') {
            nextH = Math.round(Math.min(effMaxH, Math.max(minHeight, startH - dy)));
          }

          return { width: nextW, height: nextH };
        });
      };

      const onPointerUp = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
        document.body.style.userSelect = '';
      };

      document.body.style.userSelect = 'none';
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    },
    [size.width, size.height, minWidth, maxWidth, minHeight, maxHeight]
  );

  return { size, startResize };
}
