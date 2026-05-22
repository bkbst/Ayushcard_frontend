/**
 * Server-side Aadhaar OCR API — maps responses to form autofill shape.
 */

import { OcrImageError } from "./ocrUploadImage.js";
import { isValidAadhaarName } from "./ocr.js";

export { OcrImageError };

function unwrapApiBody(body) {
  if (!body || typeof body !== "object") return {};
  if (body.data != null && typeof body.data === "object" && !Array.isArray(body.data)) {
    return body.data;
  }
  return body;
}

/** HTML date inputs require YYYY-MM-DD; OCR API often returns DD/MM/YYYY. */
export function normalizeOcrDobForDateInput(dob) {
  const s = String(dob || "").trim();
  if (!s) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const slashOrDash = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slashOrDash) {
    const [, day, month, year] = slashOrDash;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const ymd = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (ymd) {
    const [, year, month, day] = ymd;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return "";
}

/** Member / API autofill — trust server OCR names with light validation. */
export function acceptOcrNameForAutofill(name, source = "api") {
  const t = String(name || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!t || t.length < 3 || t.length > 80) return "";
  if (!/^[A-Za-z]+(?:\s+[A-Za-z]+){0,4}$/.test(t)) return "";

  if (source === "api") return t;
  return isValidAadhaarName(t) ? t : "";
}

export function mapFrontOcrApiResponse(raw) {
  const data = unwrapApiBody(raw);
  const aadhaarNumber = String(data.aadhaarNumber || "").replace(/\D/g, "");
  const name = String(data.name || "").trim();
  const dob = normalizeOcrDobForDateInput(data.dob);
  const gender = String(data.gender || "").trim();
  const hasAll =
    aadhaarNumber.length === 12 && !!name && !!dob && !!gender;

  return {
    docNumber: aadhaarNumber,
    name,
    dob,
    gender,
    type: aadhaarNumber.length === 12 ? "aadhaar" : "unknown",
    ocrConfidence: 85,
    source: "api",
    canAutofill: hasAll,
    valid: hasAll,
    validationMessage: hasAll
      ? ""
      : "Some Aadhaar details could not be read. Please verify or enter manually.",
  };
}

export function mapBackOcrApiResponse(raw) {
  const data = unwrapApiBody(raw);
  const address = String(data.address || "").trim();
  const pincode = String(data.pincode || "").replace(/\D/g, "").slice(0, 6);
  const hasPin = pincode.length === 6;
  const hasAddr = address.length >= 8;

  return {
    address,
    pincode,
    ocrConfidence: 85,
    source: "api",
    canAutofill: hasPin || hasAddr,
    valid: hasPin && hasAddr,
    validationMessage:
      hasPin && hasAddr
        ? ""
        : "Some address details could not be read. Please verify or enter manually.",
  };
}

export function isOcrApiEnabled() {
  return import.meta.env.VITE_USE_AADHAAR_OCR_API !== "false";
}

/** Server down / not deployed — fall back to on-device OCR without alarming the user. */
export function isOcrApiUnavailableError(error) {
  const status = error?.response?.status;
  return status === 503 || status === 502 || status === 504 || status === 404;
}

export function getOcrApiErrorMessage(error) {
  if (error instanceof OcrImageError && error.message) {
    return error.message;
  }

  const dataMsg =
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    (typeof error?.response?.data === "string" ? error.response.data : "");

  if (typeof dataMsg === "string" && dataMsg.trim() && dataMsg !== "Network Error") {
    return dataMsg.trim();
  }

  if (error?.response?.status === 401) {
    return "Please sign in again to use server Aadhaar scan.";
  }
  if (error?.response?.status === 400) {
    return dataMsg?.trim() || "Could not upload image for scan. Please try again.";
  }
  if (error?.response?.status === 413) {
    return "Image is too large. Please use a file under 5MB.";
  }
  if (error?.response?.status >= 500) {
    return "OCR service is temporarily unavailable. Please try again shortly.";
  }

  if (error?.code === "ECONNABORTED" || /timeout/i.test(String(error?.message || ""))) {
    return "OCR request timed out. Try a smaller image or check your connection.";
  }

  const raw = String(error?.message || "").trim();
  if (
    raw === "Network Error" ||
    (!error?.response && error?.request) ||
    /network/i.test(raw)
  ) {
    return import.meta.env.DEV
      ? "Could not reach OCR service. Log in, restart `npm run dev`, and ensure gallery images are JPG/PNG under 5MB."
      : "Could not reach OCR service. Check your internet connection and try again.";
  }

  if (raw) return raw;
  return "Failed to process Aadhaar image. Please try again or enter details manually.";
}

/** Retry once on network / 5xx failures. */
export async function withOcrRetry(fn, { retries = 1 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const status = err?.response?.status;
      const retryable =
        !status ||
        status >= 500 ||
        status === 408 ||
        status === 429 ||
        err?.code === "ECONNABORTED" ||
        err?.message === "Network Error";
      if (attempt < retries && retryable) {
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

/** Smooth progress while waiting on network OCR. */
export function startOcrProgressTicker(onProgress, from = 10, to = 78) {
  let p = from;
  onProgress(p);
  const id = setInterval(() => {
    p = Math.min(to, p + 4);
    onProgress(p);
    if (p >= to) clearInterval(id);
  }, 280);
  return id;
}
