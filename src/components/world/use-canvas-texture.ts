'use client';

import { useEffect, useMemo } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';

/**
 * A CanvasTexture rebuilt whenever `redrawKey` changes — used for in-world screens
 * and printed surfaces (laptop code, pinout poster, PCB silkscreen).
 */
export function useCanvasTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  redrawKey: string
): CanvasTexture {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) draw(ctx, width, height);
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
    // `draw` is a fresh closure every render; redraw only when the key changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, redrawKey]);

  useEffect(() => () => texture.dispose(), [texture]);

  return texture;
}
