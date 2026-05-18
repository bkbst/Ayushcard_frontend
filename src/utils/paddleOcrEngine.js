const ORT_WASM_BASE =
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/";

/** Vite resolves the hashed worker bundle from the package (hash changes per release). */
const paddleWorkerLoaders = import.meta.glob(
  "../../node_modules/@paddleocr/paddleocr-js/dist/assets/worker-entry-*.js",
  { query: "?url", import: "default" },
);

/** @type {import("@paddleocr/paddleocr-js").PaddleOCR | import("@paddleocr/paddleocr-js").WorkerBackedPaddleOCR | null} */
let ocrInstance = null;
let initPromise = null;
let PaddleOCRClass = null;

async function loadPaddleOCR() {
  if (!PaddleOCRClass) {
    const mod = await import("@paddleocr/paddleocr-js");
    PaddleOCRClass = mod.PaddleOCR;
  }
  return PaddleOCRClass;
}

async function resolvePaddleWorkerUrl() {
  const keys = Object.keys(paddleWorkerLoaders);
  if (!keys.length) {
    throw new Error("PaddleOCR worker bundle not found in node_modules.");
  }
  return paddleWorkerLoaders[keys[0]]();
}

function baseCreateOptions(lang) {
  return {
    lang,
    ocrVersion: "PP-OCRv5",
    textRecScoreThresh: 0.4,
    textDetBoxThresh: 0.45,
    textDetUnclipRatio: 1.6,
    ortOptions: {
      backend: "wasm",
      wasmPaths: ORT_WASM_BASE,
      numThreads: 1,
      simd: false,
    },
  };
}

async function createPaddleInstance(PaddleOCR, { lang, useWorker }) {
  const opts = baseCreateOptions(lang);
  if (useWorker) {
    const workerUrl = await resolvePaddleWorkerUrl();
    opts.worker = {
      createWorker: () => new Worker(workerUrl, { type: "module" }),
    };
  } else {
    opts.worker = false;
  }
  return PaddleOCR.create(opts);
}

/**
 * Initialize PaddleOCR — worker first (non-blocking UI), then main-thread fallback.
 */
export async function getPaddleOcr() {
  if (ocrInstance) return ocrInstance;
  if (!initPromise) {
    initPromise = (async () => {
      const PaddleOCR = await loadPaddleOCR();
      const attempts = [
        { lang: "en", useWorker: true, label: "en (worker)" },
        { lang: "en", useWorker: false, label: "en (main thread)" },
        { lang: "ch", useWorker: false, label: "ch (main thread)" },
      ];

      let lastError = null;
      for (const { lang, useWorker, label } of attempts) {
        try {
          const instance = await createPaddleInstance(PaddleOCR, { lang, useWorker });
          if (label !== "en (worker)") {
            console.info(`PaddleOCR ready: ${label}`);
          }
          ocrInstance = instance;
          return instance;
        } catch (err) {
          lastError = err;
          console.warn(`PaddleOCR ${label} failed:`, err?.message || err);
        }
      }
      throw lastError || new Error("PaddleOCR could not be initialized.");
    })().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

export function preloadAadhaarOcrWorker() {
  return getPaddleOcr();
}

function polyCentroid(poly) {
  if (!poly?.length) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const p of poly) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / poly.length, y: sy / poly.length };
}

export async function recognizeAadhaarImage(
  imageInput,
  { minWordConfidence = 48, onProgress = () => {} } = {},
) {
  const ocr = await getPaddleOcr();
  const minScore = minWordConfidence / 100;

  onProgress(10);
  const [result] = await ocr.predict(imageInput, {
    textRecScoreThresh: minScore,
    textDetLimitSideLen: 1280,
    textDetLimitType: "max",
  });
  onProgress(95);

  const items = (result?.items || [])
    .filter((it) => (it.score ?? 0) >= minScore && String(it.text || "").trim())
    .sort((a, b) => {
      const ca = polyCentroid(a.poly);
      const cb = polyCentroid(b.poly);
      return ca.y - cb.y || ca.x - cb.x;
    });

  const text = items.map((it) => String(it.text).trim()).join("\n");
  const confidence = items.length
    ? Math.round(
        (items.reduce((sum, it) => sum + (it.score || 0), 0) / items.length) * 100,
      )
    : 0;

  return {
    text,
    confidence,
    rawText: text,
    lines: items.map((it) => ({
      text: String(it.text).trim(),
      confidence: Math.round((it.score || 0) * 100),
      poly: it.poly,
    })),
  };
}

export function majorityPick(values, normalize = (v) => v) {
  const counts = new Map();
  for (const raw of values) {
    const v = normalize(raw);
    if (!v) continue;
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  let best = "";
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      bestCount = c;
      best = v;
    }
  }
  return best;
}

export async function disposePaddleOcr() {
  if (ocrInstance?.dispose) {
    try {
      await ocrInstance.dispose();
    } catch {
      /* ignore */
    }
  }
  ocrInstance = null;
  initPromise = null;
}
