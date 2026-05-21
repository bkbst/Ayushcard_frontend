import jsPDF from "jspdf";
import {
  captureAyushCardPair,
  captureAyushCardPreview,
  mapApiCardToPreviewData,
  warmAyushCardCapturePool,
  AYUSH_CARD_EXPORT_SIZE,
} from "./ayushCardCapture";
import { unwrapCardFromApiResponse } from "./cardPhotoDownload";

function triggerDataUrlDownload(dataUrl, filename) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function hasRealMembers(members) {
  return (
    Array.isArray(members) &&
    members.some((m) => String(m.name || m.fullName || "").trim())
  );
}

function cardNeedsDocumentFetch(card) {
  const docs = Array.isArray(card.documents) ? card.documents : [];
  return docs.length === 0 && !card.profileImage && !card.documentFront;
}

async function mapWithConcurrency(items, mapper, limit = 6) {
  const results = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  const workers = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

async function fetchCardByIdOnce(card, fetchCardById) {
  const id = card._id || card.applicationId;
  if (!id || !fetchCardById) return null;
  try {
    const full = await fetchCardById({ ...card, _id: card._id || id });
    return full || null;
  } catch {
    return null;
  }
}

async function loadPreviewData(card, options = {}) {
  let raw = card;

  if (options.fetchCardById && cardNeedsDocumentFetch(card)) {
    const full = await fetchCardByIdOnce(card, options.fetchCardById);
    if (full) raw = { ...card, ...full };
  }

  let members = raw.members || [];
  const needsMembers =
    options.fetchMembers &&
    raw._id &&
    !hasRealMembers(members);

  if (needsMembers) {
    try {
      const mRes = await options.fetchMembers(raw._id);
      const mRaw = Array.isArray(mRes?.data)
        ? mRes.data
        : Array.isArray(mRes?.data?.members)
          ? mRes.data.members
          : Array.isArray(mRes)
            ? mRes
            : [];
      if (mRaw.length > 0) members = mRaw;
    } catch {
      /* use card.members from API */
    }
  }

  return mapApiCardToPreviewData({ ...raw, members });
}

async function loadAllPreviewData(cards, options = {}, onProgress) {
  const total = cards.length;
  let done = 0;

  return mapWithConcurrency(
    cards,
    async (card) => {
      const data = await loadPreviewData(card, options);
      done += 1;
      onProgress?.(done, total, "loading");
      return data;
    },
    options.fetchConcurrency ?? 8,
  );
}

/**
 * Download designed Ayush Card — front and back.
 */
export async function downloadAyushCardFrontAndBack(card, options = {}) {
  const label = String(
    options.cardLabel || card.applicationId || card.id || card._id || "ayush_card",
  )
    .replace(/[^\w-]+/g, "_")
    .slice(0, 48);

  const previewData = await loadPreviewData(card, options);
  const { front: frontImg, back: backImg } = await captureAyushCardPair(
    previewData,
    options,
  );

  const frontFile = `${label}_ayush_card_front.jpg`;
  triggerDataUrlDownload(frontImg, frontFile);

  const backFile = `${label}_ayush_card_back.jpg`;
  triggerDataUrlDownload(backImg, backFile);

  let pdfFile;
  if (options.includePdf !== false) {
    const { width: w, height: h } = AYUSH_CARD_EXPORT_SIZE;
    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "px",
      format: [w, h],
    });
    pdf.addImage(frontImg, "JPEG", 0, 0, w, h);
    pdf.addPage([w, h], "landscape");
    pdf.addImage(backImg, "JPEG", 0, 0, w, h);
    pdfFile = `${label}_ayush_card.pdf`;
    pdf.save(pdfFile);
  }

  return { previewData, frontFile, backFile, pdfFile };
}

/** @deprecated Use downloadAyushCardFrontAndBack */
export async function downloadAyushCardPdf(card, options = {}) {
  return downloadAyushCardFrontAndBack(card, options);
}

/** @deprecated Use downloadAyushCardFrontAndBack */
export async function downloadAyushCardImages(card, options = {}) {
  return downloadAyushCardFrontAndBack(card, { ...options, includePdf: false });
}

/**
 * All cards → one PDF (each card: front page + back page).
 */
export async function downloadAllAyushCardsAsPdf(
  cards,
  options = {},
  onProgress,
) {
  if (!cards?.length) {
    throw new Error("No cards to download.");
  }

  warmAyushCardCapturePool(2);

  onProgress?.(0, cards.length, "loading");
  const previewList = await loadAllPreviewData(
    cards,
    { ...options, fetchConcurrency: options.fetchConcurrency ?? 8 },
    (current, total, phase) => onProgress?.(current, total, phase),
  );

  const { width: w, height: h } = AYUSH_CARD_EXPORT_SIZE;
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "px",
    format: [w, h],
  });

  const captureOpts = { bulk: true };
  const renderConcurrency = options.renderConcurrency ?? 2;

  const pairs = await mapWithConcurrency(
    previewList,
    async (previewData, index) => {
      const pair = await captureAyushCardPair(previewData, {
        ...captureOpts,
        slotIndex: index % renderConcurrency,
      });
      onProgress?.(index + 1, cards.length, "rendering");
      return pair;
    },
    renderConcurrency,
  );

  let pageIndex = 0;
  for (const { front, back } of pairs) {
    if (pageIndex > 0) pdf.addPage([w, h], "landscape");
    pdf.addImage(front, "JPEG", 0, 0, w, h);
    pdf.addPage([w, h], "landscape");
    pdf.addImage(back, "JPEG", 0, 0, w, h);
    pageIndex += 2;
  }

  const fileName =
    String(options.fileName || "all_ayush_cards")
      .replace(/[^\w-]+/g, "_")
      .slice(0, 64) + ".pdf";
  pdf.save(fileName);

  return { fileName, cardCount: cards.length, pageCount: pageIndex };
}

export { unwrapCardFromApiResponse };
