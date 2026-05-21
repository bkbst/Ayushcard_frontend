/**
 * Resolve card document paths and download Aadhaar front/back images.
 */

function getApiFileBase() {
  let baseUrl = import.meta.env.VITE_API_BASE_URL || "";
  if (!baseUrl && import.meta.env.DEV) {
    return window.location.origin;
  }
  if (
    !baseUrl &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1")
  ) {
    baseUrl = "https://bkbsbackend-production.up.railway.app";
  }
  const fileBase = String(baseUrl).replace(/\/api$/, "");
  return fileBase.endsWith("/") ? fileBase.slice(0, -1) : fileBase;
}

export function resolveDocumentUrl(path) {
  if (!path) return "";
  const s = String(path).trim();
  if (
    s.startsWith("http") ||
    s.startsWith("data:") ||
    s.startsWith("blob:")
  ) {
    return s;
  }
  const cleanPath = s.startsWith("/") ? s : `/${s}`;
  return `${getApiFileBase()}${cleanPath}`;
}

/** Same unwrap as HealthCardDetails — API envelopes vary. */
export function unwrapCardFromApiResponse(res) {
  if (!res || typeof res !== "object") return null;
  if (res._id || res.applicationId || Array.isArray(res.documents)) {
    return res;
  }
  const rawArray = Array.isArray(res?.data?.data) ? res.data.data : [];
  const raw =
    rawArray[0] ||
    res?.data?.card ||
    res?.data?.data ||
    res?.card ||
    (res?.data && !Array.isArray(res.data) ? res.data : null) ||
    res;
  return raw && typeof raw === "object" ? raw : null;
}

function docPath(doc) {
  if (!doc || typeof doc !== "object") return "";
  const raw =
    doc.path ||
    doc.url ||
    doc.fileUrl ||
    doc.file ||
    doc.location ||
    doc.secure_url ||
    "";
  return typeof raw === "string" ? raw.trim() : "";
}

function isImageLike(path = "", mime = "") {
  const lower = String(path).toLowerCase();
  if (/(\.jpg|\.jpeg|\.png|\.webp|\.gif|\.heic|\.heif)$/i.test(lower)) return true;
  if (lower.startsWith("data:image/")) return true;
  if (mime && String(mime).toLowerCase().startsWith("image/")) return true;
  if (path.length > 200 && lower.startsWith("data:")) return true;
  return false;
}

function docLabels(doc) {
  const name = String(
    doc.name || doc.filename || doc.originalName || "",
  ).toLowerCase();
  const type = String(doc.type || "").toLowerCase();
  return { name, type, combined: `${name} ${type}` };
}

function isSkippedDoc(doc) {
  const { name, type, combined } = docLabels(doc);
  if (
    type === "profile_photo" ||
    type === "payment_screenshot" ||
    type === "supporting_document" ||
    type === "cash" ||
    (type === "image" && name === "cashpaymentreceipt")
  ) {
    return true;
  }
  if (
    name.includes("profile") ||
    name.includes("family_head") ||
    name.includes("cashpayment") ||
    name === "documentback" ||
    name.includes("supporting") ||
    name.includes("payment")
  ) {
    return true;
  }
  if (combined.includes("supporting_document")) return true;
  return false;
}

function classifyAadhaarSide(doc) {
  if (!doc || isSkippedDoc(doc)) return null;
  const { name, type } = docLabels(doc);
  if (type === "aadhaar_front" || name === "documentfront") return "front";
  if (type === "aadhaar_back" || name === "aadhaarback") return "back";
  return null;
}

/** Front = Aadhaar front; back = Aadhaar back (not supporting documentBack). */
export function getCardFrontBackPaths(card) {
  const docs = Array.isArray(card?.documents) ? card.documents : [];
  let front = "";
  let back = "";

  for (const doc of docs) {
    const path = docPath(doc);
    if (!path || !isImageLike(path, doc.mimetype)) continue;
    const side = classifyAadhaarSide(doc);
    if (side === "front" && !front) front = path;
    if (side === "back" && !back) back = path;
  }

  if (!front) {
    const top = card?.documentFront || card?.aadhaarFront || card?.aadhaar_front;
    if (top && isImageLike(top)) front = String(top).trim();
  }

  if (!back) {
    const top = card?.aadhaarBackImage || card?.aadhaarBack;
    if (top && isImageLike(top)) back = String(top).trim();
  }

  // Submission order: [0] front, [1] aadhaar back (staff/public payloads)
  const imageDocs = docs.filter(
    (d) => !isSkippedDoc(d) && isImageLike(docPath(d), d.mimetype),
  );
  if (!front && imageDocs[0]) {
    const side = classifyAadhaarSide(imageDocs[0]);
    if (side !== "back") front = docPath(imageDocs[0]);
  }
  if (!back && imageDocs[1]) {
    const side = classifyAadhaarSide(imageDocs[1]);
    if (side !== "front") back = docPath(imageDocs[1]);
  }

  // Last resort: first two non-skipped image docs in order
  if (!front && imageDocs.length > 0) front = docPath(imageDocs[0]);
  if (!back && imageDocs.length > 1) back = docPath(imageDocs[1]);

  return { front, back };
}

function extensionFromUrl(url, fallback = "jpg") {
  if (url.startsWith("data:image/")) {
    const m = url.match(/^data:image\/(\w+)/);
    return m?.[1]?.replace("jpeg", "jpg") || fallback;
  }
  const m = String(url).match(/\.(\w{3,4})(?:\?|$)/i);
  return m?.[1]?.toLowerCase() || fallback;
}

function authHeaders() {
  const token =
    localStorage.getItem("token") || sessionStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function blobFromSource(resolvedUrl) {
  if (resolvedUrl.startsWith("data:") || resolvedUrl.startsWith("blob:")) {
    const res = await fetch(resolvedUrl);
    return res.blob();
  }
  const res = await fetch(resolvedUrl, {
    headers: authHeaders(),
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`Could not fetch image (${res.status})`);
  }
  return res.blob();
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function downloadOne(path, filename) {
  const resolved = resolveDocumentUrl(path);
  if (!resolved) return false;
  const blob = await blobFromSource(resolved);
  const ext = extensionFromUrl(resolved);
  const name = filename.includes(".") ? filename : `${filename}.${ext}`;
  triggerDownload(blob, name);
  return true;
}

/**
 * Download front and back photos for a card.
 * @returns {{ downloaded: string[], missing: string[] }}
 */
export async function downloadCardFrontBackPhotos(card, options = {}) {
  const cardId = String(
    options.cardLabel || card?.applicationId || card?.id || card?._id || "card",
  )
    .replace(/[^\w-]+/g, "_")
    .slice(0, 48);

  let cardData = card;

  if (options.fetchCardById) {
    const full = await options.fetchCardById(card);
    if (full) {
      cardData = {
        ...card,
        ...full,
        documents: full.documents ?? card.documents,
      };
    }
  }

  let { front, back } = getCardFrontBackPaths(cardData);

  const downloaded = [];
  const missing = [];

  if (front) {
    try {
      await downloadOne(front, `${cardId}_front`);
      downloaded.push("front");
      await new Promise((r) => setTimeout(r, 350));
    } catch {
      missing.push("front");
    }
  } else {
    missing.push("front");
  }

  if (back) {
    try {
      await downloadOne(back, `${cardId}_back`);
      downloaded.push("back");
    } catch {
      missing.push("back");
    }
  } else {
    missing.push("back");
  }

  return { downloaded, missing };
}
