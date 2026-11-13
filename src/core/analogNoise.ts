export interface AnalogNoiseSettings {
  opacity: number;
  size: number;
  fps: number;
  contrast: number;
  colored: boolean;
  dust: number;
  scratches: number;
  flicker: number;
}

export const DEFAULT_ANALOG_SETTINGS: AnalogNoiseSettings = {
  opacity: 0.18,
  size: 1,
  fps: 24,
  contrast: 0.6,
  colored: false,
  dust: 0.12,
  scratches: 0.08,
  flicker: 0.15,
};

const TAU = Math.PI * 2;
const TILE = 128;

function clamp(x: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, x));
}

export function generateGrainTile(contrast = 0.6, colored = false): HTMLCanvasElement {
  const cvs = document.createElement('canvas');
  cvs.width = TILE;
  cvs.height = TILE;
  const ctx = cvs.getContext('2d');
  if (!ctx) return cvs;

  const imgData = ctx.createImageData(TILE, TILE);
  const data = imgData.data;
  const c = clamp(contrast, 0, 1);
  const factor = (259 * (c * 255 + 255)) / (255 * (259 - c * 255));

  for (let i = 0; i < data.length; i += 4) {
    if (colored) {
      data[i] = clamp(factor * (Math.random() * 255 - 128) + 128, 0, 255);
      data[i + 1] = clamp(factor * (Math.random() * 255 - 128) + 128, 0, 255);
      data[i + 2] = clamp(factor * (Math.random() * 255 - 128) + 128, 0, 255);
    } else {
      const v = clamp(factor * (Math.random() * 255 - 128) + 128, 0, 255);
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
    }
    data[i + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
  return cvs;
}

export function drawSpeck(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  rgb: string,
  alpha: number
) {
  ctx.fillStyle = `rgba(${rgb}, ${alpha})`;
  ctx.beginPath();
  if (radius < 1.4) {
    ctx.rect(x - radius, y - radius, radius * 2, radius * 2);
  } else {
    ctx.arc(x, y, radius, 0, TAU);
  }
  ctx.fill();
}

export function drawHair(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const x = Math.random() * w;
  const y = Math.random() * h;
  const length = 12 + Math.random() * 28;
  const angle = Math.random() * TAU;
  const bend = (Math.random() - 0.5) * 16;
  const ex = x + Math.cos(angle) * length;
  const ey = y + Math.sin(angle) * length;
  const cx = (x + ex) / 2 - Math.sin(angle) * bend;
  const cy = (y + ey) / 2 + Math.cos(angle) * bend;
  ctx.strokeStyle = `rgba(16, 12, 9, ${0.4 + Math.random() * 0.35})`;
  ctx.lineWidth = 0.6 + Math.random() * 0.7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(cx, cy, ex, ey);
  ctx.stroke();
}

export function applyAnalogFXToCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  intensity = 0.1
) {
  if (intensity <= 0.005) return;
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const noiseAmp = intensity * 45;

  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * noiseAmp;
    data[i] = clamp(data[i] + n, 0, 255);
    data[i + 1] = clamp(data[i + 1] + n, 0, 255);
    data[i + 2] = clamp(data[i + 2] + n, 0, 255);
  }
  ctx.putImageData(imgData, 0, 0);

  // Scanlines
  ctx.fillStyle = `rgba(0, 0, 0, ${intensity * 0.18})`;
  for (let y = 0; y < height; y += 3) {
    ctx.fillRect(0, y, width, 1);
  }

  // Dust specks
  const specks = Math.round(intensity * 120 * ((width * height) / 400000));
  for (let i = 0; i < specks; i++) {
    const light = Math.random() < 0.4;
    drawSpeck(
      ctx,
      Math.random() * width,
      Math.random() * height,
      0.8 + Math.random() ** 2.5 * 3.0,
      light ? '255, 250, 240' : '18, 14, 10',
      (0.3 + Math.random() * 0.4) * intensity * 2
    );
  }
}
