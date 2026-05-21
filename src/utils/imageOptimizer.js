/**
 * Resize / compress images before server OCR (~1–2MP JPEGs, not 4–12MP camera frames).
 */

const DEFAULT_MAX_WIDTH = 1200;
const DEFAULT_MAX_HEIGHT = 1200;
const DEFAULT_JPEG_QUALITY = 0.82;

/** Aadhaar front overlay aspect in Step1 camera UI */
export const AADHAAR_SCAN_FRAME_ASPECT = 1.586;

function loadImageFromSource(source) {
  return new Promise((resolve, reject) => {
    if (source instanceof HTMLImageElement && source.complete) {
      resolve(source);
      return;
    }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image for optimization."));
    if (typeof source === "string") {
      img.src = source;
    } else if (source instanceof Blob) {
      const objectUrl = URL.createObjectURL(source);
      img.src = objectUrl;
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Failed to load image for optimization."));
      };
    } else {
      reject(new Error("Unsupported image source."));
    }
  });
}

/**
 * Crop to central card-shaped region (matches on-screen scan frame).
 */
export function computeCenterCropRect(width, height, aspect = AADHAAR_SCAN_FRAME_ASPECT) {
  const sourceAspect = width / height;
  let cropW;
  let cropH;
  if (sourceAspect > aspect) {
    cropH = height;
    cropW = Math.round(height * aspect);
  } else {
    cropW = width;
    cropH = Math.round(width / aspect);
  }
  return {
    sx: Math.max(0, Math.round((width - cropW) / 2)),
    sy: Math.max(0, Math.round((height - cropH) / 2)),
    sw: Math.min(width, cropW),
    sh: Math.min(height, cropH),
  };
}

/**
 * Draw source onto canvas with max bounds and optional center crop.
 */
export function drawOptimizedCanvas(
  source,
  {
    maxWidth = DEFAULT_MAX_WIDTH,
    maxHeight = DEFAULT_MAX_HEIGHT,
    cropToScanFrame = false,
    scanAspect = AADHAAR_SCAN_FRAME_ASPECT,
  } = {},
) {
  const sw = source.videoWidth || source.naturalWidth || source.width;
  const sh = source.videoHeight || source.naturalHeight || source.height;
  if (!sw || !sh) throw new Error("Invalid image dimensions.");

  const crop = cropToScanFrame
    ? computeCenterCropRect(sw, sh, scanAspect)
    : { sx: 0, sy: 0, sw, sh };

  let dw = crop.sw;
  let dh = crop.sh;
  const scale = Math.min(maxWidth / dw, maxHeight / dh, 1);
  dw = Math.max(1, Math.round(dw * scale));
  dh = Math.max(1, Math.round(dh * scale));

  const canvas = document.createElement("canvas");
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, dw, dh);
  ctx.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, dw, dh);
  return canvas;
}

/**
 * @param {Blob|File|HTMLImageElement|HTMLCanvasElement|string} input
 * @param {object} [options]
 * @returns {Promise<{ blob: Blob, canvas: HTMLCanvasElement, dataUrl: string, width: number, height: number }>}
 */
export async function optimizeImageForOcr(input, options = {}) {
  const quality = options.quality ?? DEFAULT_JPEG_QUALITY;
  const maxWidth = options.maxWidth ?? DEFAULT_MAX_WIDTH;
  const maxHeight = options.maxHeight ?? DEFAULT_MAX_HEIGHT;
  const cropToScanFrame = Boolean(options.cropToScanFrame);

  let source = input;
  if (input instanceof HTMLCanvasElement) {
    source = input;
  } else if (!(input instanceof HTMLImageElement)) {
    source = await loadImageFromSource(input);
  }

  const canvas = drawOptimizedCanvas(source, {
    maxWidth,
    maxHeight,
    cropToScanFrame,
    scanAspect: options.scanAspect ?? AADHAAR_SCAN_FRAME_ASPECT,
  });

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to encode optimized image."))),
      "image/jpeg",
      quality,
    );
  });

  return {
    blob,
    canvas,
    dataUrl: canvas.toDataURL("image/jpeg", quality),
    width: canvas.width,
    height: canvas.height,
  };
}

/** Capture visible scan frame from live video (not full sensor frame). */
export async function captureVideoScanFrame(video, options = {}) {
  const full = document.createElement("canvas");
  full.width = video.videoWidth;
  full.height = video.videoHeight;
  const ctx = full.getContext("2d");
  ctx.drawImage(video, 0, 0);
  return optimizeImageForOcr(full, { ...options, cropToScanFrame: true });
}
