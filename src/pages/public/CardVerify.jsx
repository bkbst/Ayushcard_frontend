import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { MapPin, Phone, Mail, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { resolveProfileImageFromCard } from "../../utils/profileImage";
import {
  buildCardVerifyUrl,
  fetchPublicCardByVerifyId,
  getCardDisplayId,
} from "../../utils/cardVerify";
import { isPublicCardVerified, getDisplayStatus } from "../../utils/healthCardUtils";

const apiBase = import.meta.env.DEV
  ? ""
  : (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || "");

const publicApi = axios.create({
  baseURL: apiBase,
  headers: { "Content-Type": "application/json" },
  timeout: 15000,
});

const Row = ({ label, value }) => (
  <div className="flex gap-1.5 sm:gap-2 min-w-0">
    <span className="w-[4.5rem] sm:w-24 shrink-0 font-bold text-[11px] sm:text-sm text-gray-700">
      {label}
    </span>
    <span className="text-[11px] sm:text-sm font-medium text-gray-800 break-words min-w-0">
      : {value || "—"}
    </span>
  </div>
);

export default function CardVerify() {
  const { cardId } = useParams();
  const [card, setCard] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!cardId) return;

    const doFetch = async () => {
      setLoading(true);
      setError("");

      const raw = await fetchPublicCardByVerifyId(publicApi, cardId);

      if (!raw || (!raw._id && !raw.cardNo && !raw.applicationId)) {
        setError("Card not found or not accessible. Please check the QR code.");
        setLoading(false);
        return;
      }

      setCard(raw);

      try {
        const mId = raw._id;
        if (!mId) throw new Error("missing mongo id");
        const mRes = await publicApi.get(`/api/card-members/card/${mId}`);
        const mArr =
          Array.isArray(mRes.data?.data) ? mRes.data.data :
          Array.isArray(mRes.data?.data?.members) ? mRes.data.data.members :
          Array.isArray(mRes.data) ? mRes.data : [];
        setMembers(mArr.length > 0 ? mArr : (Array.isArray(raw.members) ? raw.members : []));
      } catch {
        setMembers(Array.isArray(raw.members) ? raw.members : []);
      }

      setLoading(false);
    };

    doFetch();
  }, [cardId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center px-4">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={40} className="animate-spin text-orange-500" />
          <p className="text-gray-600 font-medium text-sm sm:text-base">Verifying Card…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 max-w-sm w-full text-center">
          <XCircle size={48} className="text-red-400 mx-auto mb-4 sm:w-14 sm:h-14" />
          <h2 className="text-lg sm:text-xl font-bold text-gray-800 mb-2">Card Not Found</h2>
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  const name = [card.firstName, card.middleName, card.lastName].filter(Boolean).join(" ");
  const isVerified = isPublicCardVerified(card);
  const statusLabel = getDisplayStatus(card);
  const cardNo = getCardDisplayId(card);
  const ngoLocation = card.ngoLocation || "Mangla Vihar Kanpur - 208015";
  const ngoPhone = card.ngoPhone || "8303902030";
  const ngoEmail = card.ngoEmail || "baijnaathkesarbaisewatrust9625@gmail.com";
  const verifyUrl = buildCardVerifyUrl(card) || window.location.href;

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 flex flex-col items-center py-6 sm:py-8 px-3 sm:px-4 pb-10"
      style={{ fontFamily: "Inter, sans-serif" }}
    >
      {/* Status banner */}
      <div
        className={`w-full max-w-lg rounded-2xl px-4 py-4 sm:px-6 sm:py-5 mb-5 sm:mb-6 text-center shadow-md ${
          isVerified
            ? "bg-green-50 border border-green-200"
            : "bg-red-50 border border-red-200"
        }`}
      >
        <div className="flex items-center justify-center gap-2 mb-1">
          {isVerified ? (
            <CheckCircle size={22} className="text-green-600 shrink-0" />
          ) : (
            <XCircle size={22} className="text-red-500 shrink-0" />
          )}
          <h1 className="text-base sm:text-xl font-bold text-gray-900 leading-snug">
            {isVerified
              ? "This Ayush Card is Verified"
              : statusLabel === "Not verified"
                ? "Ayush Card Application Received — Pending Verification"
                : "This Ayush Card is NOT Verified"}
          </h1>
        </div>
        <p className="text-xs sm:text-sm text-gray-600">Card ID: {cardNo}</p>
        <p className={`text-xs sm:text-sm font-semibold mt-1 ${isVerified ? "text-green-700" : "text-amber-700"}`}>
          Status: {statusLabel}
        </p>
      </div>

      {/* Front card */}
      <div className="w-full max-w-lg rounded-2xl sm:rounded-[28px] overflow-hidden shadow-2xl mb-4 sm:mb-5">
        <div className="bg-gradient-to-r from-[#CC2B2B] to-[#F59E0B] p-3 sm:p-5 text-white">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-4">
            <div className="flex gap-2.5 sm:gap-3 items-center min-w-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white rounded-full flex items-center justify-center shrink-0">
                <img
                  src="/logo1.svg"
                  alt="logo"
                  className="w-full h-full object-contain rounded-full"
                  onError={(e) => { e.target.style.display = "none"; }}
                />
              </div>
              <div className="min-w-0">
                <div className="border-t border-b border-white py-0.5 mb-1 inline-block">
                  <p className="text-[11px] sm:text-[13px] font-bold leading-tight">BAIJNAATH KESAR</p>
                  <p className="text-[11px] sm:text-[13px] font-bold leading-tight">BAI SEWA TRUST</p>
                </div>
                <p className="text-[10px] sm:text-[11px] text-white/80 truncate">Card ID: {cardNo}</p>
              </div>
            </div>
            <div className="sm:text-right shrink-0">
              <h2 className="text-lg sm:text-xl font-extrabold tracking-wide">AYUSH CARD</h2>
              <p className="text-[9px] sm:text-[10px] mt-0.5 text-white/80">सेहत का सुरक्षा कवच – आयुष्य कार्ड के साथ!</p>
              <p className="text-[9px] sm:text-[10px] text-white/80">Health Shield – With Ayush Card!</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 items-stretch">
            <div className="flex gap-3 items-start">
              <div className="w-16 h-20 sm:w-20 sm:h-24 bg-white rounded-xl overflow-hidden border-2 border-black shrink-0">
                {(() => {
                  const profileSrc = resolveProfileImageFromCard(card);
                  return profileSrc ? (
                    <img src={profileSrc} alt="profile" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400 text-[10px] sm:text-xs">
                      No Photo
                    </div>
                  );
                })()}
              </div>

              <div className="flex-1 min-w-0 bg-white text-black rounded-xl p-2.5 sm:p-3 space-y-1">
                <Row label="Name" value={name} />
                <Row label="W/o" value={card.relatedPerson} />
                <Row label="DOB" value={card.dob} />
                <Row label="Phone" value={card.contact} />
                <Row label="Reg Date" value={card.applicationDate} />
              </div>
            </div>

            <div className="flex justify-center sm:justify-end shrink-0">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white rounded-xl p-1 border-2 border-black">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(verifyUrl)}`}
                  alt="qr"
                  className="w-full h-full"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-[#E5B556] px-3 sm:px-4 py-2.5 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1.5 sm:gap-2 text-[10px] sm:text-[11px] text-white">
          <span className="flex items-center gap-1 min-w-0">
            <MapPin size={11} className="shrink-0" />
            <span className="truncate">{ngoLocation}</span>
          </span>
          <span className="flex items-center gap-1 shrink-0">
            <Phone size={11} className="shrink-0" />
            {ngoPhone}
          </span>
          <span className="flex items-center gap-1 min-w-0">
            <Mail size={11} className="shrink-0" />
            <span className="truncate">{ngoEmail}</span>
          </span>
        </div>
      </div>

      {/* Family members */}
      {members.length > 0 && (
        <div className="w-full max-w-lg bg-white rounded-2xl shadow-md overflow-hidden mb-4 sm:mb-5">
          <div className="bg-gradient-to-r from-[#CC2B2B] to-[#F59E0B] px-4 sm:px-5 py-3 text-white">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
              <div className="min-w-0">
                <p className="text-xs font-bold">BAIJNAATH KESAR BAI SEWA TRUST</p>
                <p className="text-[10px] text-white/70 truncate">Card ID: {cardNo}</p>
              </div>
              <p className="text-sm sm:text-base font-extrabold shrink-0">AYUSH CARD</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <p className="text-center font-bold text-sm py-2 text-gray-800">Family Details</p>
            <table className="w-full min-w-[280px] text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 text-[11px] sm:text-xs font-bold text-gray-500">
                  <th className="py-2 px-2 sm:px-3 border-b border-gray-200 text-left">Sr.</th>
                  <th className="py-2 px-2 sm:px-3 border-b border-gray-200 text-left">Name</th>
                  <th className="py-2 px-2 sm:px-3 border-b border-gray-200 text-center">Age</th>
                  <th className="py-2 px-2 sm:px-3 border-b border-gray-200 text-left">Relation</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 px-2 sm:px-3 text-gray-500 text-xs sm:text-sm">{i + 1}</td>
                    <td className="py-2 px-2 sm:px-3 font-semibold text-gray-800 text-xs sm:text-sm break-words">
                      {m.name}
                    </td>
                    <td className="py-2 px-2 sm:px-3 text-center text-gray-600 text-xs sm:text-sm">{m.age}</td>
                    <td className="py-2 px-2 sm:px-3 text-gray-600 text-xs sm:text-sm">{m.relation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-gradient-to-r from-[#CC2B2B] to-[#F59E0B] px-4 sm:px-5 py-4 text-white">
            <p className="text-[11px] sm:text-xs font-bold uppercase mb-2 tracking-wide">
              Important Information / Instructions
            </p>
            <ol className="text-[10px] sm:text-[11px] list-decimal list-inside space-y-0.5 text-white/90">
              <li>Carry this card during every hospital visit.</li>
              <li>Inform NGO staff if the card is lost.</li>
              <li>This card is non-transferable.</li>
              <li>Update your info yearly with coordinator.</li>
            </ol>

            <p className="text-[10px] font-bold uppercase mt-4 mb-1.5 tracking-wider">Issue Date</p>
            <div className="bg-white text-black rounded-lg px-3 py-2 text-[11px] sm:text-xs font-semibold w-full max-w-[12rem] leading-relaxed">
              <div>Date : {card.cardIssueDate || "—"}</div>
              <div>Expiry : {card.cardExpiredDate || "—"}</div>
            </div>
          </div>

          <div className="bg-[#E5B556] px-3 sm:px-4 py-2.5 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1.5 text-[10px] sm:text-[11px] text-white">
            <span className="flex items-center gap-1 min-w-0">
              <MapPin size={11} className="shrink-0" />
              <span className="truncate">{ngoLocation}</span>
            </span>
            <span className="flex items-center gap-1 shrink-0">
              <Phone size={11} className="shrink-0" />
              {ngoPhone}
            </span>
          </div>
        </div>
      )}

      <div className="w-full max-w-lg flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 mt-4 sm:mt-6">
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

      <p className="text-xs text-gray-400 text-center max-w-sm mt-4 mb-4 hidden print:block px-4">
        This page is auto-generated by scanning the QR code on the Ayush Card issued by
        Baijnaath Kesar Bai Sewa Trust.
      </p>
    </div>
  );
}
