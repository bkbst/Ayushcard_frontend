import React from "react";
import ReactDOM from "react-dom/client";
import { toJpeg } from "html-to-image";
import AyushCardPreview from "../components/admin/AyushCardPreview";

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
    renderToSlot(slot, cardData, side);
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
  const profileFromDocs = docs.find((d) => {
    const n = String(d.name || d.type || "").toLowerCase();
    return n.includes("profile") || n.includes("photo") || n.includes("head");
  });

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
    profileImage:
      card.profileImage ||
      profileFromDocs?.path ||
      profileFromDocs?.url ||
      docs[2]?.path ||
      docs[2]?.url ||
      "",
    documentFront:
      card.documentFront ||
      docs.find((d) => d.name === "documentFront")?.path ||
      docs.find((d) => d.type === "aadhaar_front")?.path ||
      "",
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
