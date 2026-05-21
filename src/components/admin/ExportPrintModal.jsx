import React, { useState } from "react";
import { X, Download, Loader2 } from "lucide-react";
import jsPDF from "jspdf";
import AyushCardPreview from "./AyushCardPreview";
import { captureAyushCardPreview } from "../../utils/ayushCardCapture";
import { useToast } from "../ui/Toast";
import apiService from "../../api/service";

const drawGridPage = (pdf, imageDataUrls) => {
  const PAGE_W = 457.2;
  const PAGE_H = 304.8;
  const COLS = 5;
  const ROWS = 5;
  const cardW = 88;
  const cardH = 54;
  const gapX = 3;
  const gapY = 3;

  const totalGridW = cardW * COLS + gapX * (COLS - 1);
  const totalGridH = cardH * ROWS + gapY * (ROWS - 1);
  const startX = (PAGE_W - totalGridW) / 2;
  const startY = (PAGE_H - totalGridH) / 2;

  imageDataUrls.forEach((img, idx) => {
    const col = idx % COLS;
    const row = Math.floor(idx / COLS);
    const x = startX + col * (cardW + gapX);
    const y = startY + row * (cardH + gapY);
    pdf.addImage(img, "JPEG", x, y, cardW, cardH);
  });

  for (let i = imageDataUrls.length; i < COLS * ROWS; i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = startX + col * (cardW + gapX);
    const y = startY + row * (cardH + gapY);
    pdf.setFillColor(248, 250, 252);
    pdf.rect(x, y, cardW, cardH, "F");
  }
};

/* ─────────────────────────────────────────────────────────────────────────────
   Build a grid PDF from up to 25 card images per page.
   Format: 12 x 18 inch landscape (457.2 x 304.8 mm) -> cards are exactly 88 x 54 mm.
───────────────────────────────────────────────────────────────────────────── */
const buildGridPdf = (pages, filename) => {
  const PAGE_W = 457.2;
  const PAGE_H = 304.8;
  const sheetPages = Array.isArray(pages[0]) ? pages : [pages];
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: [PAGE_W, PAGE_H] });

  sheetPages.forEach((imageDataUrls, pageIndex) => {
    if (pageIndex > 0) pdf.addPage([PAGE_W, PAGE_H], "landscape");
    drawGridPage(pdf, imageDataUrls);
  });

  pdf.save(filename);
};

/* ─────────────────────────────────────────────────────────────────────────────
   5×5 visible preview grid using tiny AyushCardPreview thumbnails
───────────────────────────────────────────────────────────────────────────── */
const PreviewGrid = ({ cards, side, total }) => (
  <div className="flex-1 bg-white rounded border border-gray-200 p-2 overflow-hidden">
    <div className="grid grid-cols-5 gap-1 w-full h-full">
      {[...Array(25)].map((_, i) => {
        const card  = cards[i];
        const empty = i >= total;
        return (
          <div
            key={i}
            className={`relative rounded overflow-hidden border flex items-center justify-center ${
              empty
                ? "border-dashed border-gray-200 bg-gray-50 opacity-30"
                : "border-gray-200 bg-gray-50"
            }`}
            style={{ minHeight: "80px" }}
          >
            {card && !empty && (
              <div
                style={{
                  transform: "scale(0.12)",
                  transformOrigin: "center",
                  pointerEvents: "none",
                  position: "absolute",
                }}
              >
                <AyushCardPreview data={card} side={side} exportMode={true} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  </div>
);

/* ─────────────────────────────────────────────────────────────────────────────
   Main Modal
───────────────────────────────────────────────────────────────────────────── */
export default function ExportPrintModal({ isOpen, onClose, selectedData, onExportSuccess, markPrintedOnDownload = false }) {
  const { toastSuccess, toastError, toastWarn } = useToast();

  const [downloading, setDownloading]         = useState(false);
  const [downloadedCount, setDownloadedCount] = useState(0);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [progress, setProgress] = useState("");

  // Batch cards into groups of 25
  const chunks      = [];
  for (let i = 0; i < selectedData.length; i += 25) chunks.push(selectedData.slice(i, i + 25));
  const totalChunks  = chunks.length;
  const currentCards = chunks[currentChunkIndex] || [];

  if (!isOpen) return null;

  const markAsPrinted = async () => {
    if (!markPrintedOnDownload) return;
    const cardIds = selectedData.map((c) => c._id || c.id).filter(Boolean);
    if (cardIds.length === 0) return;
    try {
      await apiService.updatePrintStatus(cardIds, true);
    } catch (err) {
      console.error("[ExportModal] Failed to update print status:", err);
    }
  };

  /* ── capture all cards in a batch for a given side ── */
  const captureAll = async (cards, side, batchLabel) => {
    const imgs = [];
    for (let i = 0; i < cards.length; i++) {
      setProgress(`${batchLabel} — Rendering card ${i + 1} / ${cards.length}…`);
      imgs.push(await captureAyushCardPreview(cards[i], side));
    }
    return imgs;
  };

  /* ── Single side download ── */
  const handleDownloadSide = async (side) => {
    if (!currentCards.length) { toastWarn("No cards in this batch."); return; }
    setDownloading(true);
    try {
      const imgs = await captureAll(currentCards, side, `Batch ${currentChunkIndex + 1} ${side}`);
      setProgress("Building PDF…");
      const s = currentChunkIndex * 25 + 1;
      const e = Math.min((currentChunkIndex + 1) * 25, selectedData.length);
      buildGridPdf([imgs], `Batch_${currentChunkIndex + 1}_${side.toUpperCase()}_Cards_${s}-${e}.pdf`);
      setDownloadedCount((p) => p + 1);
      toastSuccess(`${side === "front" ? "Front" : "Back"} sheet downloaded!`);
      if (markPrintedOnDownload) {
        await markAsPrinted();
        if (onExportSuccess) onExportSuccess();
      }
    } catch (err) {
      console.error("[ExportModal]", err);
      toastError("PDF failed: " + (err?.message || "Unknown error. Check console."));
    } finally { setDownloading(false); setProgress(""); }
  };

  /* ── Both sides for current batch ── */
  const handleDownloadBoth = async () => {
    if (!currentCards.length) { toastWarn("No cards in this batch."); return; }
    setDownloading(true);
    try {
      const frontImgs = await captureAll(currentCards, "front", `Batch ${currentChunkIndex + 1} FRONT`);
      const backImgs  = await captureAll(currentCards, "back",  `Batch ${currentChunkIndex + 1} BACK`);
      const s = currentChunkIndex * 25 + 1;
      const e = Math.min((currentChunkIndex + 1) * 25, selectedData.length);
      setProgress("Building PDF…");
      buildGridPdf(
        [frontImgs, backImgs],
        `Batch_${currentChunkIndex + 1}_Cards_${s}-${e}.pdf`,
      );
      setDownloadedCount((p) => p + 1);
      toastSuccess("Front & back PDF downloaded!");
      if (markPrintedOnDownload) {
        await markAsPrinted();
        if (onExportSuccess) onExportSuccess();
      }
    } catch (err) {
      console.error("[ExportModal]", err);
      toastError("PDF failed: " + (err?.message || "Unknown error. Check console."));
    } finally { setDownloading(false); setProgress(""); }
  };

  /* ── All batches ── */
  const handleDownloadAll = async () => {
    setDownloading(true);
    try {
      for (let ci = 0; ci < totalChunks; ci++) {
        const batch = chunks[ci];
        const frontImgs = await captureAll(batch, "front", `Batch ${ci + 1}/${totalChunks} FRONT`);
        const backImgs  = await captureAll(batch, "back",  `Batch ${ci + 1}/${totalChunks} BACK`);
        const s = ci * 25 + 1;
        const e = Math.min((ci + 1) * 25, selectedData.length);
        setProgress(`Saving Batch ${ci + 1} PDF…`);
        buildGridPdf([frontImgs, backImgs], `Batch_${ci + 1}_Cards_${s}-${e}.pdf`);
        setDownloadedCount((p) => p + 1);
      }
      // After successful completion of all batches, update print status in backend (if enabled)
      setProgress("Finalizing print status...");
      await markAsPrinted();

      toastSuccess("All batches downloaded! Cards marked as exported.");
      if (onExportSuccess) onExportSuccess();
    } catch (err) {
      console.error("[ExportModal]", err);
      toastError("Download failed: " + (err?.message || "Unknown error. Check console."));
    } finally { setDownloading(false); setProgress(""); }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 text-[#1E293B] p-2 sm:p-4"
      style={{ fontFamily: "Inter, sans-serif" }}
    >
      <div className="bg-white rounded-2xl w-full sm:w-[92%] max-w-5xl h-[92vh] sm:h-[88vh] flex flex-col shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-start sm:items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200 shrink-0 gap-3">
          <h2 className="text-[18px] sm:text-[20px] font-bold leading-tight">Export for Printing</h2>
          <button
            onClick={onClose}
            disabled={downloading}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-40"
          >
            <X size={22} />
          </button>
        </div>

        {/* Progress bar */}
        {downloading && progress && (
          <div className="px-4 sm:px-6 py-2 bg-orange-50 border-b border-orange-100 flex items-center gap-2 shrink-0">
            <Loader2 size={14} className="animate-spin text-orange-500 shrink-0" />
            <span className="text-sm text-orange-700 font-medium truncate">{progress}</span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">

          {/* Batch info row */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-5 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-8 h-8 rounded-lg bg-[#22333B] text-white flex items-center justify-center font-bold text-sm">
                {currentChunkIndex + 1}
              </span>
              <div>
                <h3 className="font-bold text-[16px] sm:text-[16px]">Batch {currentChunkIndex + 1} of {totalChunks}</h3>
                <p className="text-sm text-gray-500 leading-snug">
                  Cards {currentChunkIndex * 25 + 1} –{" "}
                  {Math.min((currentChunkIndex + 1) * 25, selectedData.length)} · Front + Back Sheet pair
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:flex-wrap w-full lg:w-auto">
              {totalChunks > 1 && (
                <>
                  <button onClick={() => setCurrentChunkIndex((p) => Math.max(0, p - 1))}
                    disabled={currentChunkIndex === 0 || downloading}
                    className="px-3 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 w-full sm:w-auto">
                    ← Prev
                  </button>
                  <button onClick={() => setCurrentChunkIndex((p) => Math.min(totalChunks - 1, p + 1))}
                    disabled={currentChunkIndex === totalChunks - 1 || downloading}
                    className="px-3 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 w-full sm:w-auto">
                    Next →
                  </button>
                </>
              )}
              <button onClick={handleDownloadBoth} disabled={downloading}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-[#22333B] text-white rounded-lg text-sm font-medium hover:bg-[#1a2830] disabled:opacity-50 w-full sm:w-auto">
                {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                Download Both
              </button>
            </div>
          </div>

          {/* Front / Back grid pair */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-5">
            {/* FRONT */}
            <div className="border border-gray-200 rounded-xl p-3 sm:p-4 flex flex-col gap-3 min-h-[420px] sm:h-[520px]">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between shrink-0 gap-3">
                <div>
                  <span className="px-2 py-0.5 bg-[#22333B] text-white rounded text-xs font-bold mr-2 inline-block">FRONT</span>
                  <span className="font-bold text-sm">Sheet {currentChunkIndex + 1}</span>
                  <p className="text-xs text-gray-400 mt-0.5">{currentCards.length} cards · 12x18 in</p>
                </div>
                <button onClick={() => handleDownloadSide("front")} disabled={downloading}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 bg-[#3E3E3E] text-white rounded-lg text-xs font-medium hover:bg-gray-700 disabled:opacity-50 w-full sm:w-auto">
                  {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} Download
                </button>
              </div>
              <PreviewGrid cards={currentCards} side="front" total={currentCards.length} />
              <p className="text-xs text-center text-gray-400 shrink-0">12x18 (457x305mm) · 88x54mm Cards</p>
            </div>

            {/* BACK */}
            <div className="border border-gray-200 rounded-xl p-3 sm:p-4 flex flex-col gap-3 min-h-[420px] sm:h-[520px]">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between shrink-0 gap-3">
                <div>
                  <span className="px-2 py-0.5 bg-gray-500 text-white rounded text-xs font-bold mr-2 inline-block">BACK</span>
                  <span className="font-bold text-sm">Sheet {currentChunkIndex + 1}</span>
                  <p className="text-xs text-gray-400 mt-0.5">{currentCards.length} cards · 12x18 in</p>
                </div>
                <button onClick={() => handleDownloadSide("back")} disabled={downloading}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 bg-[#3E3E3E] text-white rounded-lg text-xs font-medium hover:bg-gray-700 disabled:opacity-50 w-full sm:w-auto">
                  {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} Download
                </button>
              </div>
              <PreviewGrid cards={currentCards} side="back" total={currentCards.length} />
              <p className="text-xs text-center text-gray-400 shrink-0">12x18 (457x305mm) · 88x54mm Cards</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 bg-white px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
          <span className="text-sm font-medium text-gray-500 text-center sm:text-left">
            {downloadedCount} of {totalChunks} PDFs downloaded
          </span>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
            <button
              onClick={() => { setDownloadedCount(0); setCurrentChunkIndex(0); }}
              disabled={downloading}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50 w-full sm:w-auto"
            >
              Reset
            </button>
            <button
              onClick={handleDownloadAll}
              disabled={downloading}
              className="px-6 py-2 bg-[#F68E5F] hover:bg-[#ff702d] text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 shadow-sm disabled:opacity-60 w-full sm:w-auto"
            >
              {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              {downloading ? "Processing…" : "Download All"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
