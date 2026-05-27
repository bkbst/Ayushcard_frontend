import React from "react";
import ReactDOM from "react-dom/client";
import { toJpeg } from "html-to-image";
import AyushCardPreview from "../components/admin/AyushCardPreview";
import {
  resolveDocumentFrontFromCard,
  resolveProfileImageFromCard,
} from "./profileImage";

const CARD_W = 580;
const CARD_H = 340;

const PLACEHOLDER =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const DEFAULT_CAPTURE = {
  quality: 0.92,
  backgroundColor: "#ffffff",
  pixelRatio: 2,
  width: CARD_W,
  height: CARD_H,
  fontEmbedCSS: "",
  imagePlaceholder: PLACEHOLDER,
};

const BULK_CAPTURE = {
  ...DEFAULT_CAPTURE,
  quality: 0.88,
  pixelRatio: 1.5,
};

function waitFrames(count = 2) {
  return new Promise((resolve) => {
    let n = 0;
    const step = () => {
      n += 1;
      if (n >= count) resolve();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

async function waitForImagesIn(el, timeoutMs = 2000) {
  const imgs = [...el.querySelectorAll("img")];
  if (!imgs.length) return;

  await Promise.race([
    Promise.all(
      imgs.map(
        (img) =>
          new Promise((resolve) => {
            if (img.complete && img.naturalHeight > 0) {
              resolve();
              return;
            }
            const done = () => resolve();
            img.addEventListener("load", done, { once: true });
            img.addEventListener("error", done, { once: true });
          }),
      ),
    ),
    new Promise((r) => setTimeout(r, timeoutMs)),
  ]);
}

async function settleAfterRender(host) {
  await waitFrames(2);
  await waitForImagesIn(host, 2000);
  await new Promise((r) => setTimeout(r, 80));
}

function createCaptureSlot() {
  const wrapper = document.createElement("div");
  wrapper.style.cssText =
    "position:fixed;top:0;left:0;opacity:0;pointer-events:none;z-index:-9999;overflow:hidden;";
  const host = document.createElement("div");
  host.style.cssText = `width:${CARD_W}px;height:${CARD_H}px;background:#fff;position:relative;`;
  wrapper.appendChild(host);
  document.body.appendChild(wrapper);
  const root = ReactDOM.createRoot(host);
  return { wrapper, host, root, busy: false };
}

const CAPTURE_POOL_SIZE = 2;
const capturePool = [];

function getCaptureSlot(slotIndex = 0) {
  const i = slotIndex % CAPTURE_POOL_SIZE;
  if (!capturePool[i]) capturePool[i] = createCaptureSlot();
  return capturePool[i];
}

function renderToSlot(slot, cardData, side) {
  slot.root.render(
    React.createElement(AyushCardPreview, {
      data: cardData,
      side,
      exportMode: true,
    }),
  );
}

/* ── Convert a profile image URL to a base64 data URL ── */
const imageDataUrlCache = new Map();

async function toDataUrl(imagePath) {
  if (!imagePath || typeof imagePath !== "string") return "";
  if (imagePath.startsWith("data:")) return imagePath;

  // Build fetch URL: use relative path for /uploads (Vite proxies it)
  let fetchUrl = imagePath;
  if (!imagePath.startsWith("http") && !imagePath.startsWith("/")) {
    fetchUrl = "/" + imagePath;
  }
  if (imagePath.startsWith("/uploads") || imagePath.startsWith("/")) {
    // relative — works via Vite proxy
    fetchUrl = imagePath;
  } else if (!imagePath.startsWith("http")) {
    const base = import.meta.env.VITE_API_URL || "https://bkbsbackend-production.up.railway.app";
    fetchUrl = `${base.replace(/\/$/, "")}/${imagePath}`;
  }

  if (imageDataUrlCache.has(fetchUrl)) return imageDataUrlCache.get(fetchUrl);

  try {
    const resp = await fetch(fetchUrl);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    imageDataUrlCache.set(fetchUrl, dataUrl);
    return dataUrl;
  } catch (err) {
    console.warn("[capture] Failed to prefetch image:", fetchUrl, err);
    return "";
  }
}

/** Render AyushCardPreview off-screen and return a JPEG data URL. */
export async function captureAyushCardPreview(cardData, side = "front", options = {}) {
  const slotIndex = options.slotIndex ?? 0;
  const slot = getCaptureSlot(slotIndex);
  const jpegOpts = {
    ...(options.bulk ? BULK_CAPTURE : DEFAULT_CAPTURE),
    ...(options.jpegOptions || {}),
  };

  while (slot.busy) {
    await new Promise((r) => setTimeout(r, 16));
  }
  slot.busy = true;

  try {
    // Pre-fetch profile image as data URL to avoid CORS in html-to-image
    const profilePath = resolveProfileImageFromCard(cardData);
    let enrichedData = cardData;
    if (profilePath) {
      const dataUrl = await toDataUrl(profilePath);
      if (dataUrl) {
        enrichedData = {
          ...cardData,
          profilePic: dataUrl,
          profileImage: dataUrl,
          profilePhoto: dataUrl,
        };
      }
    }

    renderToSlot(slot, enrichedData, side);
    await settleAfterRender(slot.host);
    return await toJpeg(slot.host, jpegOpts);
  } catch (err) {
    console.error("Ayush card capture error:", err);
    throw err;
  } finally {
    slot.busy = false;
  }
}

/** Front + back for one card (reuses same capture slot). */
export async function captureAyushCardPair(cardData, options = {}) {
  const front = await captureAyushCardPreview(cardData, "front", options);
  const back = await captureAyushCardPreview(cardData, "back", options);
  return { front, back };
}

function formatDisplayDate(val) {
  if (!val) return "";
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return String(val);
  return d.toLocaleDateString("en-GB").replace(/\//g, "-");
}

/** Map API card record → AyushCardPreview `data` prop. */
export function mapApiCardToPreviewData(card) {
  const applicant =
    card.applicant ||
    [card.firstName, card.middleName, card.lastName].filter(Boolean).join(" ");

  const docs = Array.isArray(card.documents) ? card.documents : [];

  return {
    ...card,
    applicationId: card.applicationId || card.id || card._id || "",
    cardNo: card.cardNo || card.cardNumber || "",
    applicant,
    applicantFirstName: card.firstName || card.applicantFirstName || "",
    applicantMiddleName: card.middleName || card.applicantMiddleName || "",
    applicantLastName: card.lastName || card.applicantLastName || "",
    firstName: card.firstName,
    middleName: card.middleName,
    lastName: card.lastName,
    phone: card.contact || card.phone || "",
    contact: card.contact || card.phone || "",
    dob: card.dob || "",
    aadhaarNumber:
      card.aadhaarNumber || card.aadhaarNo || card.aadharNumber || "",
    dateApplied: formatDisplayDate(card.applicationDate) || card.dateApplied,
    applicationDate: formatDisplayDate(card.applicationDate),
    issueDate: formatDisplayDate(card.cardIssueDate || card.issueDate),
    cardIssueDate: card.cardIssueDate,
    expiryDate: formatDisplayDate(card.cardExpiredDate || card.expiryDate),
    cardExpiredDate: card.cardExpiredDate,
    campName: card.campId?.name || card.campName || "",
    profilePic: card.profilePic || "",
    profileImage: resolveProfileImageFromCard(card),
    documentFront: resolveDocumentFrontFromCard(card),
    documents: docs,
    members: (Array.isArray(card.members) ? card.members : []).map((m) => ({
      name: m.name || m.fullName || "",
      relation: m.relation || "Family Member",
      age: m.age ?? "",
      documentId: m.documentId || "",
      documentType: m.documentType || "Aadhaar",
    })),
    ngoLocation: card.ngoLocation,
    ngoPhone: card.ngoPhone,
    ngoEmail: card.ngoEmail,
    payment: card.payment,
  };
}

export const AYUSH_CARD_EXPORT_SIZE = { width: CARD_W, height: CARD_H };

/** Warm two off-screen slots so first bulk capture is faster. */
export function warmAyushCardCapturePool(size = CAPTURE_POOL_SIZE) {
  for (let i = 0; i < Math.min(size, CAPTURE_POOL_SIZE); i++) getCaptureSlot(i);
}
