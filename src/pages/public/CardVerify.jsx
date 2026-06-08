import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import AyushCardPreview from "../../components/admin/AyushCardPreview";
import { mapApiCardToPreviewData } from "../../utils/ayushCardCapture";
import {
  fetchPublicCardByVerifyId,
  getCardDisplayId,
  isValidCardRecord,
} from "../../utils/cardVerify";
import { isPublicCardVerified, getDisplayStatus } from "../../utils/healthCardUtils";

const publicApi = axios.create({
  baseURL: import.meta.env.DEV ? "" : (import.meta.env.VITE_API_BASE_URL || ""),
  headers: { "Content-Type": "application/json" },
  timeout: 15000,
});

function unwrapMembers(res) {
  if (Array.isArray(res?.data?.data)) return res.data.data;
  if (Array.isArray(res?.data?.data?.members)) return res.data.data.members;
  if (Array.isArray(res?.data?.members)) return res.data.members;
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res?.members)) return res.members;
  return [];
}

export default function CardVerify() {
  const { cardId } = useParams();
  const [previewData, setPreviewData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cardSide, setCardSide] = useState("front");

  useEffect(() => {
    if (!cardId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");

      const raw = await fetchPublicCardByVerifyId(publicApi, cardId);

      if (!raw || !isValidCardRecord(raw)) {
        if (!cancelled) {
          setError("Card not found. Please check the QR code.");
          setLoading(false);
        }
        return;
      }

      let members = Array.isArray(raw.members) ? raw.members : [];
      try {
        if (raw._id) {
          const mRes = await publicApi.get(`/api/card-members/card/${raw._id}`);
          const fetched = unwrapMembers(mRes);
          if (fetched.length > 0) members = fetched;
        }
      } catch {
        // use members from card record
      }

      if (!cancelled) {
        setPreviewData(mapApiCardToPreviewData({ ...raw, members }));
        setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFF7F4] flex items-center justify-center px-4">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={40} className="animate-spin text-[#F68E5F]" />
          <p className="text-gray-600 font-medium text-sm sm:text-base">Loading Ayush Card…</p>
        </div>
      </div>
    );
  }

  if (error || !previewData) {
    return (
      <div className="min-h-screen bg-[#FFF7F4] flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 max-w-sm w-full text-center">
          <XCircle size={48} className="text-red-400 mx-auto mb-4" />
          <h2 className="text-lg sm:text-xl font-bold text-gray-800 mb-2">Card Not Found</h2>
          <p className="text-gray-500 text-sm">{error || "Unable to load this card."}</p>
        </div>
      </div>
    );
  }

  const isVerified = isPublicCardVerified(previewData);
  const statusLabel = getDisplayStatus(previewData);
  const cardNo = getCardDisplayId(previewData);

  return (
    <div
      className="min-h-screen bg-[#FFF7F4] flex flex-col items-center py-5 sm:py-8 px-3 sm:px-4 pb-10"
      style={{ fontFamily: "Inter, sans-serif" }}
    >
      {/* Verification status */}
      <div
        className={`w-full max-w-[620px] rounded-2xl px-4 py-4 sm:px-6 sm:py-5 mb-4 sm:mb-6 text-center shadow-sm ${
          isVerified
            ? "bg-green-50 border border-green-200"
            : "bg-amber-50 border border-amber-200"
        }`}
      >
        <div className="flex items-center justify-center gap-2 mb-1">
          {isVerified ? (
            <CheckCircle size={22} className="text-green-600 shrink-0" />
          ) : (
            <XCircle size={22} className="text-amber-600 shrink-0" />
          )}
          <h1 className="text-base sm:text-xl font-bold text-gray-900 leading-snug">
            {isVerified
              ? "This Ayush Card is Verified"
              : statusLabel === "Not verified"
                ? "Ayush Card Application Received"
                : "This Ayush Card is NOT Verified"}
          </h1>
        </div>
        <p className="text-xs sm:text-sm text-gray-600">Card ID: {cardNo}</p>
        <p
          className={`text-xs sm:text-sm font-semibold mt-1 ${
            isVerified ? "text-green-700" : "text-amber-700"
          }`}
        >
          Status: {statusLabel}
        </p>
      </div>

      {/* Same card preview as application / admin details */}
      <div className="w-full max-w-[620px] border border-[#E2E8F0] rounded-xl bg-white overflow-hidden shadow-md">
        <div className="p-3 sm:p-4 border-b border-[#E2E8F0] flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-white">
          <h2 className="font-bold text-[15px] sm:text-[16px] text-[#22333B]">Ayush Card</h2>
          <div className="flex bg-[#F8FAFC] p-1 rounded-lg self-center sm:self-auto">
            {["front", "back"].map((side) => (
              <button
                key={side}
                type="button"
                onClick={() => setCardSide(side)}
                className={`px-4 sm:px-6 py-1.5 rounded-md text-[12px] sm:text-[13px] font-semibold transition-all ${
                  cardSide === side
                    ? "bg-white shadow-sm text-[#0F172A]"
                    : "text-[#64748B] hover:text-[#0F172A]"
                }`}
              >
                {side.charAt(0).toUpperCase() + side.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-[#F8FAFC] p-3 sm:p-8 md:p-10 flex flex-col items-center justify-center min-h-[280px] sm:min-h-[400px]">
          <div className="w-full max-w-[580px]">
            <AyushCardPreview
              data={previewData}
              side={cardSide}
              onFlip={(side) => setCardSide(side)}
            />
          </div>
          <p className="text-[11px] sm:text-[13px] text-[#94A3B8] mt-4 sm:mt-8 text-center font-medium px-2">
            Tap the card or use Front / Back to view both sides
          </p>
        </div>
      </div>

      <div className="w-full max-w-[620px] flex flex-col sm:flex-row justify-center gap-3 mt-6">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="w-full sm:w-auto bg-[#0b646e] hover:bg-[#09525a] text-white px-6 py-2.5 rounded-md font-semibold text-sm transition-colors"
        >
          Go Back
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="w-full sm:w-auto bg-[#0b646e] hover:bg-[#09525a] text-white px-6 py-2.5 rounded-md font-semibold text-sm transition-colors"
        >
          Download
        </button>
      </div>
    </div>
  );
}
