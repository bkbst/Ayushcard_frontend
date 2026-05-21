/**
 * Server-side Aadhaar OCR API — maps responses to form autofill shape.
 */

function unwrapApiBody(body) {
  if (!body || typeof body !== "object") return {};
  if (body.data != null && typeof body.data === "object" && !Array.isArray(body.data)) {
    return body.data;
  }
  return body;
}

export function mapFrontOcrApiResponse(raw) {
  const data = unwrapApiBody(raw);
  const aadhaarNumber = String(data.aadhaarNumber || "").replace(/\D/g, "");
  const name = String(data.name || "").trim();
  const dob = String(data.dob || "").trim();
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
  const msg =
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message;
  if (typeof msg === "string" && msg.trim()) return msg.trim();
  if (error?.response?.status === 401) {
    return "Please sign in again to use server Aadhaar scan.";
  }
  if (error?.response?.status === 400) {
    return msg || "Could not upload image for scan. Please try again.";
  }
  if (error?.response?.status === 413) {
    return "Image is too large. Please use a file under 5MB.";
  }
  if (error?.response?.status >= 500) {
    return "OCR service is temporarily unavailable. Scanning on this device instead.";
  }
  return "Could not read Aadhaar from image. Please try again or enter details manually.";
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
