/**
 * Aadhaar card image preparation: detect bounds, deskew, enhance, region crops.
 */

const TARGET_MIN_WIDTH = 1400;
const MAX_DIMENSION = 2000;

/** Relative regions on cropped card (x, y, w, h as 0–1 fractions) */
export const AADHAAR_FRONT_REGIONS = {
  name: { x: 0.02, y: 0.2, w: 0.68, h: 0.28 },
  dobGender: { x: 0.02, y: 0.46, w: 0.78, h: 0.2 },
  aadhaarNumber: { x: 0.02, y: 0.68, w: 0.96, h: 0.28 },
};

export const AADHAAR_BACK_REGIONS = {
  address: { x: 0.04, y: 0.32, w: 0.92, h: 0.48 },
  pincode: { x: 0.04, y: 0.72, w: 0.92, h: 0.22 },
};

function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

function grayAt(data, w, x, y) {
  const i = (y * w + x) * 4;
  return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
}

/** Find bounding box of non-white card content */
function detectContentBounds(imageData) {
  const { width: w, height: h, data } = imageData;
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  let hits = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const g = grayAt(data, w, x, y);
      if (g < 238) {
        hits++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (hits < w * h * 0.02) {
    return { x: 0, y: 0, w, h };
  }

  const padX = Math.round((maxX - minX) * 0.02);
  const padY = Math.round((maxY - minY) * 0.02);
  minX = Math.max(0, minX - padX);
  minY = Math.max(0, minY - padY);
  maxX = Math.min(w - 1, maxX + padX);
  maxY = Math.min(h - 1, maxY + padY);

  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Score horizontal text alignment via row variance on binarized image */
function skewScoreForAngle(imageData, angleDeg) {
  const { width: w, height: h } = imageData;
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = w / 2;
  const cy = h / 2;
  const rowSums = new Float32Array(h);

  for (let y = 0; y < h; y += 2) {
    let sum = 0;
    for (let x = 0; x < w; x += 2) {
      const dx = x - cx;
      const dy = y - cy;
      const sx = Math.round(cos * dx - sin * dy + cx);
      const sy = Math.round(sin * dx + cos * dy + cy);
      if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue;
      const g = grayAt(imageData.data, w, sx, sy);
      if (g < 140) sum++;
    }
    rowSums[y] = sum;
  }

  let mean = 0;
  for (let i = 0; i < h; i++) mean += rowSums[i];
  mean /= h;
  let variance = 0;
  for (let i = 0; i < h; i++) {
    const d = rowSums[i] - mean;
    variance += d * d;
  }
  return variance;
}

function rotateCanvas(sourceCanvas, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const nw = Math.ceil(w * cos + h * sin);
  const nh = Math.ceil(w * sin + h * cos);

  const out = document.createElement("canvas");
  out.width = nw;
  out.height = nh;
  const ctx = out.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, nw, nh);
  ctx.translate(nw / 2, nh / 2);
  ctx.rotate(rad);
  ctx.drawImage(sourceCanvas, -w / 2, -h / 2);
  return out;
}

function applyEnhancements(ctx, w, h, { sharpen = true, binarize = false } = {}) {
  const imageData = ctx.getImageData(0, 0, w, h);
  const { data } = imageData;

  const gray = new Uint8ClampedArray(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  let minG = 255;
  let maxG = 0;
  for (let p = 0; p < gray.length; p++) {
    if (gray[p] < minG) minG = gray[p];
    if (gray[p] > maxG) maxG = gray[p];
  }
  const range = Math.max(1, maxG - minG);

  for (let p = 0; p < gray.length; p++) {
    let v = ((gray[p] - minG) / range) * 255;
    v = Math.max(0, Math.min(255, (v - 128) * 1.35 + 128));
    gray[p] = v;
  }

  if (sharpen) {
    const copy = new Uint8ClampedArray(gray);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const lap =
          copy[i] * 5 -
          copy[i - 1] -
          copy[i + 1] -
          copy[i - w] -
          copy[i + w];
        gray[i] = Math.max(0, Math.min(255, lap));
      }
    }
  }

  let threshold = 128;
  if (binarize) {
    let total = 0;
    for (let p = 0; p < gray.length; p++) total += gray[p];
    threshold = Math.max(90, Math.min(165, (total / gray.length) * 0.92));
  }

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    let v = gray[p];
    if (binarize) v = v < threshold ? 0 : 255;
    data[i] = data[i + 1] = data[i + 2] = v;
    data[i + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
}

function drawToCanvas(img, bounds, scale) {
  const bw = bounds?.w ?? img.width;
  const bh = bounds?.h ?? img.height;
  const bx = bounds?.x ?? 0;
  const by = bounds?.y ?? 0;

  let w = Math.round(bw * scale);
  let h = Math.round(bh * scale);
  if (w < TARGET_MIN_WIDTH && bw > 0) {
    const up = TARGET_MIN_WIDTH / w;
    w = Math.round(w * up);
    h = Math.round(h * up);
  }
  if (w > MAX_DIMENSION) {
    const down = MAX_DIMENSION / w;
    w = MAX_DIMENSION;
    h = Math.round(h * down);
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, bx, by, bw, bh, 0, 0, w, h);
  return canvas;
}

function canvasToBlob(canvas, quality = 0.94) {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
  });
}

function cropRegionCanvas(sourceCanvas, region) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const rx = Math.round(region.x * w);
  const ry = Math.round(region.y * h);
  const rw = Math.max(32, Math.round(region.w * w));
  const rh = Math.max(24, Math.round(region.h * h));

  const canvas = document.createElement("canvas");
  canvas.width = rw;
  canvas.height = rh;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, rw, rh);
  ctx.drawImage(sourceCanvas, rx, ry, rw, rh, 0, 0, rw, rh);
  return canvas;
}

/**
 * Full pipeline: load → crop card → deskew → upscale → return base canvas + region blobs.
 */
export async function prepareAadhaarCardImage(imageInput, side = "front") {
  if (typeof document === "undefined") {
    return { baseBlob: imageInput, regions: {}, baseCanvas: null };
  }

  const blob =
    imageInput instanceof Blob
      ? imageInput
      : await fetch(imageInput).then((r) => r.blob());

  const img = await loadImageFromBlob(blob);

  const probeScale = Math.min(1, 900 / (img.width || 900));
  const probeCanvas = drawToCanvas(img, null, probeScale);
  const probeCtx = probeCanvas.getContext("2d");
  const probeData = probeCtx.getImageData(0, 0, probeCanvas.width, probeCanvas.height);
  const bounds = detectContentBounds(probeData);

  const scaleToFull = (img.width || 1) / probeCanvas.width;
  const fullBounds = {
    x: Math.round(bounds.x * scaleToFull),
    y: Math.round(bounds.y * scaleToFull),
    w: Math.round(bounds.w * scaleToFull),
    h: Math.round(bounds.h * scaleToFull),
  };

  let cardCanvas = drawToCanvas(img, fullBounds, 1);

  const skewData = cardCanvas.getContext("2d").getImageData(0, 0, cardCanvas.width, cardCanvas.height);
  let bestAngle = 0;
  let bestScore = -1;
  for (let a = -12; a <= 12; a += 3) {
    const score = skewScoreForAngle(skewData, a);
    if (score > bestScore) {
      bestScore = score;
      bestAngle = a;
    }
  }
  if (bestAngle !== 0) {
    cardCanvas = rotateCanvas(cardCanvas, bestAngle);
  }

  const variants = [];
  for (const binarize of [false, true]) {
    const c = document.createElement("canvas");
    c.width = cardCanvas.width;
    c.height = cardCanvas.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(cardCanvas, 0, 0);
    applyEnhancements(ctx, c.width, c.height, { sharpen: true, binarize });
    variants.push(c);
  }

  const regionDefs = side === "back" ? AADHAAR_BACK_REGIONS : AADHAAR_FRONT_REGIONS;
  const regions = {};

  for (const [key, rect] of Object.entries(regionDefs)) {
    const blobs = [];
    for (const variantCanvas of variants) {
      const cropped = cropRegionCanvas(variantCanvas, rect);
      blobs.push(await canvasToBlob(cropped));
    }
    regions[key] = blobs;
  }

  const baseCanvas = variants[0];
  const baseBlob = await canvasToBlob(baseCanvas);

  return { baseBlob, baseCanvas, regions, variants };
}

export async function preprocessImageForFrontOcr(imageInput, { binarize = false } = {}) {
  const { baseBlob, variants } = await prepareAadhaarCardImage(imageInput, "front");
  if (!variants?.length) return baseBlob;
  const idx = binarize ? 1 : 0;
  return canvasToBlob(variants[idx] ?? variants[0]);
}
