/**
 * Aadhaar card image preparation: crop, deskew, enhance, layout regions, quality check.
 */

const TARGET_MIN_WIDTH = 1200;
const MAX_DIMENSION = 1800;

/** Layout-specific region maps (fractions of cropped card) */
export const AADHAAR_LAYOUT_REGIONS = {
  classic: {
    name: { x: 0.02, y: 0.2, w: 0.68, h: 0.26 },
    dobGender: { x: 0.02, y: 0.44, w: 0.78, h: 0.18 },
    gender: { x: 0.02, y: 0.58, w: 0.45, h: 0.1 },
    aadhaarNumber: { x: 0.02, y: 0.66, w: 0.96, h: 0.3 },
    address: { x: 0.04, y: 0.3, w: 0.92, h: 0.5 },
    pincode: { x: 0.04, y: 0.72, w: 0.92, h: 0.22 },
  },
  pvc: {
    name: { x: 0.03, y: 0.16, w: 0.72, h: 0.24 },
    dobGender: { x: 0.03, y: 0.4, w: 0.8, h: 0.16 },
    gender: { x: 0.03, y: 0.54, w: 0.48, h: 0.1 },
    aadhaarNumber: { x: 0.03, y: 0.62, w: 0.94, h: 0.32 },
    address: { x: 0.05, y: 0.28, w: 0.9, h: 0.52 },
    pincode: { x: 0.05, y: 0.74, w: 0.9, h: 0.2 },
  },
  wide: {
    name: { x: 0.04, y: 0.12, w: 0.55, h: 0.28 },
    dobGender: { x: 0.04, y: 0.38, w: 0.6, h: 0.2 },
    gender: { x: 0.04, y: 0.52, w: 0.35, h: 0.12 },
    aadhaarNumber: { x: 0.04, y: 0.6, w: 0.92, h: 0.32 },
    address: { x: 0.06, y: 0.28, w: 0.88, h: 0.48 },
    pincode: { x: 0.06, y: 0.7, w: 0.88, h: 0.24 },
  },
};

export const AADHAAR_FRONT_REGIONS = AADHAAR_LAYOUT_REGIONS.classic;
export const AADHAAR_BACK_REGIONS = {
  address: AADHAAR_LAYOUT_REGIONS.classic.address,
  pincode: AADHAAR_LAYOUT_REGIONS.classic.pincode,
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

function detectContentBounds(imageData) {
  const { width: w, height: h, data } = imageData;
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  let hits = 0;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const g = grayAt(data, w, x, y);
      if (g < 235) {
        hits++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (hits < w * h * 0.015) {
    return { x: 0, y: 0, w, h };
  }

  const padX = Math.round((maxX - minX) * 0.025);
  const padY = Math.round((maxY - minY) * 0.025);
  return {
    x: Math.max(0, minX - padX),
    y: Math.max(0, minY - padY),
    w: Math.min(w, maxX - minX + 1 + padX * 2),
    h: Math.min(h, maxY - minY + 1 + padY * 2),
  };
}

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
      if (grayAt(imageData.data, w, sx, sy) < 140) sum++;
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

/** Local contrast (CLAHE-lite) + sharpen + optional adaptive binarize */
function applyEnhancements(ctx, w, h, { sharpen = true, binarize = false, denoise = true } = {}) {
  const imageData = ctx.getImageData(0, 0, w, h);
  const { data } = imageData;
  const gray = new Float32Array(w * h);

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  if (denoise && w > 4 && h > 4) {
    const copy = new Float32Array(gray);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        let s = 0;
        let c = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            s += copy[i + dy * w + dx];
            c++;
          }
        }
        gray[i] = s / c;
      }
    }
  }

  const tile = 48;
  for (let ty = 0; ty < h; ty += tile) {
    for (let tx = 0; tx < w; tx += tile) {
      let minG = 255;
      let maxG = 0;
      const th = Math.min(tile, h - ty);
      const tw = Math.min(tile, w - tx);
      for (let y = 0; y < th; y++) {
        for (let x = 0; x < tw; x++) {
          const g = gray[(ty + y) * w + (tx + x)];
          if (g < minG) minG = g;
          if (g > maxG) maxG = g;
        }
      }
      const range = Math.max(18, maxG - minG);
      for (let y = 0; y < th; y++) {
        for (let x = 0; x < tw; x++) {
          const i = (ty + y) * w + (tx + x);
          let v = ((gray[i] - minG) / range) * 255;
          v = Math.max(0, Math.min(255, (v - 128) * 1.42 + 128));
          gray[i] = v;
        }
      }
    }
  }

  if (sharpen) {
    const copy = new Float32Array(gray);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const lap =
          copy[i] * 5 - copy[i - 1] - copy[i + 1] - copy[i - w] - copy[i + w];
        gray[i] = Math.max(0, Math.min(255, lap));
      }
    }
  }

  let threshold = 128;
  if (binarize) {
    let total = 0;
    for (let p = 0; p < gray.length; p++) total += gray[p];
    threshold = Math.max(88, Math.min(168, (total / gray.length) * 0.9));
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
    w = TARGET_MIN_WIDTH;
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
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, bx, by, bw, bh, 0, 0, w, h);
  return canvas;
}

function canvasToBlob(canvas, quality = 0.96) {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
  });
}

function cropRegionCanvas(sourceCanvas, region) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const rx = Math.round(region.x * w);
  const ry = Math.round(region.y * h);
  const rw = Math.max(40, Math.round(region.w * w));
  const rh = Math.max(28, Math.round(region.h * h));

  const canvas = document.createElement("canvas");
  const scale = rw < 400 ? Math.min(2, 400 / rw) : 1;
  canvas.width = Math.round(rw * scale);
  canvas.height = Math.round(rh * scale);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(sourceCanvas, rx, ry, rw, rh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Detect Aadhaar layout from card aspect ratio and quick header probe.
 */
export function detectAadhaarLayout(canvas, probeText = "") {
  const ar = canvas.width / Math.max(1, canvas.height);
  const t = String(probeText || "");
  const hasDevanagari = /[\u0900-\u097F]/.test(t);

  if (ar > 1.48) return "wide";
  if (ar < 1.32 || (hasDevanagari && ar < 1.42)) return "pvc";
  return "classic";
}

export function getRegionsForLayout(layout, side = "front") {
  const map = AADHAAR_LAYOUT_REGIONS[layout] || AADHAAR_LAYOUT_REGIONS.classic;
  if (side === "back") {
    return { address: map.address, pincode: map.pincode };
  }
  return {
    name: map.name,
    dobGender: map.dobGender,
    gender: map.gender,
    aadhaarNumber: map.aadhaarNumber,
  };
}

/**
 * Blur / brightness check on canvas (for camera capture).
 */
export function assessCaptureQuality(canvas) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const sampleW = Math.min(320, w);
  const sampleH = Math.min(240, h);
  const small = document.createElement("canvas");
  small.width = sampleW;
  small.height = sampleH;
  const sctx = small.getContext("2d");
  sctx.drawImage(canvas, 0, 0, w, h, 0, 0, sampleW, sampleH);
  const { data } = sctx.getImageData(0, 0, sampleW, sampleH);

  let sum = 0;
  let sumSq = 0;
  let n = 0;
  const gray = new Float32Array(sampleW * sampleH);

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    gray[p] = g;
    sum += g;
    sumSq += g * g;
    n++;
  }

  const mean = sum / n;
  const variance = sumSq / n - mean * mean;
  const brightness = mean;

  let lapSum = 0;
  for (let y = 1; y < sampleH - 1; y++) {
    for (let x = 1; x < sampleW - 1; x++) {
      const i = y * sampleW + x;
      const lap = Math.abs(
        4 * gray[i] -
          gray[i - 1] -
          gray[i + 1] -
          gray[i - sampleW] -
          gray[i + sampleW],
      );
      lapSum += lap;
    }
  }
  const sharpness = lapSum / n;

  let ok = true;
  let message = "";

  if (brightness < 70) {
    ok = false;
    message = "Image is too dark. Please use better lighting and retake.";
  } else if (brightness > 220) {
    ok = false;
    message = "Image is overexposed. Reduce glare and retake.";
  } else if (sharpness < 12) {
    ok = false;
    message = "Image looks blurry. Hold steady, align the card, and retake.";
  }

  return { ok, brightness, sharpness, variance, message };
}

/**
 * Full pipeline: load → crop → deskew → enhance → layout regions.
 */
export async function prepareAadhaarCardImage(imageInput, side = "front") {
  if (typeof document === "undefined") {
    return { baseBlob: imageInput, regions: {}, baseCanvas: null, layout: "classic" };
  }

  const blob =
    imageInput instanceof Blob
      ? imageInput
      : await fetch(imageInput).then((r) => r.blob());

  const img = await loadImageFromBlob(blob);

  const probeScale = Math.min(1, 800 / (img.width || 800));
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
  for (const a of [-9, -6, -3, 0, 3, 6, 9]) {
    const score = skewScoreForAngle(skewData, a);
    if (score > bestScore) {
      bestScore = score;
      bestAngle = a;
    }
  }
  if (bestAngle !== 0) {
    cardCanvas = rotateCanvas(cardCanvas, bestAngle);
  }

  const primary = document.createElement("canvas");
  primary.width = cardCanvas.width;
  primary.height = cardCanvas.height;
  const primaryCtx = primary.getContext("2d");
  primaryCtx.drawImage(cardCanvas, 0, 0);
  applyEnhancements(primaryCtx, primary.width, primary.height, {
    sharpen: true,
    binarize: false,
    denoise: true,
  });

  const binarized = document.createElement("canvas");
  binarized.width = cardCanvas.width;
  binarized.height = cardCanvas.height;
  const binCtx = binarized.getContext("2d");
  binCtx.drawImage(cardCanvas, 0, 0);
  applyEnhancements(binCtx, binarized.width, binarized.height, {
    sharpen: true,
    binarize: true,
    denoise: true,
  });

  const layout = detectAadhaarLayout(primary);
  const regionDefs = getRegionsForLayout(layout, side);
  const regions = {};

  const altRegions = {};
  for (const [key, rect] of Object.entries(regionDefs)) {
    regions[key] = await canvasToBlob(cropRegionCanvas(primary, rect));
    altRegions[key] = await canvasToBlob(cropRegionCanvas(binarized, rect));
  }

  return {
    baseBlob: await canvasToBlob(primary),
    altBinarizedBlob: await canvasToBlob(binarized),
    baseCanvas: primary,
    regions,
    altRegions,
    layout,
  };
}

export async function preprocessImageForFrontOcr(imageInput, { binarize = false } = {}) {
  const prep = await prepareAadhaarCardImage(imageInput, "front");
  return binarize ? prep.altBinarizedBlob : prep.baseBlob;
}
